import { useCallback, useEffect, useState } from "react";
import { api, type Catalog } from "./api";
import { Connections } from "./components/Connections";
import { GettingReady } from "./components/GettingReady";
import { Splash } from "./components/Splash";
import { Start } from "./components/Start";
import { Studio } from "./components/Studio";
import { useReel } from "./reel";

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Someone can look around while the exporter downloads. Exporting says when it's ready.
  const [later, setLater] = useState(false);
  const reel = useReel(catalog);
  const { state, actions } = reel;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let loaded = await api.catalog();
        setCatalog(loaded);
        // Samples are prepared just after start-up, so check back for the first-screen reel.
        for (
          let attempt = 0;
          attempt < 20 && loaded.samples.length === 0 && !cancelled;
          attempt += 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          loaded = await api.catalog();
        }
        if (!cancelled) setCatalog(loaded);
      } catch (error) {
        setFailure((error as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (catalog) {
      const style = document.createElement("style");
      style.textContent = catalog.fontCss;
      document.head.append(style);
      return () => style.remove();
    }
    return undefined;
  }, [catalog]);

  useEffect(() => {
    if (!state.notice) return;
    const timer = setTimeout(actions.dismiss, 7000);
    return () => clearTimeout(timer);
  }, [state.notice, actions.dismiss]);

  const isFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");
  const exporter = catalog?.setup.find((part) => part.id === "browser");
  // Only the person at this Mac can download it, so guests on the network never see this.
  const gettingReady = Boolean(catalog?.local && exporter && !exporter.ready && !later);
  const reloadCatalog = useCallback(() => {
    void api.catalog().then(setCatalog, () => {});
  }, []);
  const lookAround = useCallback(() => setLater(true), []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the whole window accepts dropped files.
    <div
      className={`room ${dropping ? "is-dropping" : ""}`}
      onDragEnter={(event) => {
        if (isFiles(event)) setDropping(true);
      }}
      onDragOver={(event) => {
        if (isFiles(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget === null) setDropping(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        void actions.addFiles([...event.dataTransfer.files]);
      }}
    >
      {failure ? (
        <main className="start">
          <section className="start-copy">
            <h1 className="headline">U-Cut can't reach its engine.</h1>
            <p className="lede">{failure}</p>
          </section>
        </main>
      ) : !catalog ? null : gettingReady && exporter ? (
        <GettingReady exporter={exporter} onReady={reloadCatalog} onLater={lookAround} />
      ) : state.now ? (
        <Studio
          catalog={catalog}
          reel={reel}
          onConnections={() => setConnecting(true)}
          onCatalogChanged={reloadCatalog}
        />
      ) : (
        <Start
          catalog={catalog}
          items={state.items}
          ready={state.ready}
          arriving={state.arriving}
          onFiles={(files) => void actions.addFiles(files)}
          onSamples={() => void actions.addSamples()}
          reading={state.reading}
          onRecording={(file) => void actions.addRecording(file)}
          onPrompt={(prompt) => void actions.writeReel(prompt)}
          onConnections={() => setConnecting(true)}
        />
      )}
      {dropping ? (
        <div className="drop-veil" aria-hidden="true">
          <p>Let go to add them</p>
        </div>
      ) : null}
      {connecting ? (
        <Connections
          jobId={state.now ? (state.job?.id ?? null) : null}
          onClose={() => setConnecting(false)}
          onChanged={() => {
            void api.catalog().then(setCatalog, () => {});
          }}
        />
      ) : null}
      <Splash />
      <div className="notice" role="status" aria-live="polite">
        {state.notice ? (
          <button type="button" onClick={actions.dismiss}>
            {state.notice}
          </button>
        ) : null}
      </div>
    </div>
  );
}
