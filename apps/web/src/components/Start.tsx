import type { MediaItem } from "@u-cut/schema";
import { useMemo, useRef, useState } from "react";
import { type Catalog, thumbUrl } from "../api";
import { planWith } from "../reel";
import { Stage } from "./Stage";

interface Props {
  catalog: Catalog;
  items: MediaItem[];
  ready: string[];
  arriving: number;
  onFiles(files: File[]): void;
  onSamples(): void;
  reading: boolean;
  onRecording(file: File): void;
  onPrompt(prompt: string): void;
  onConnections(): void;
}

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export function Start({
  catalog,
  items,
  ready,
  arriving,
  onFiles,
  onSamples,
  reading,
  onRecording,
  onPrompt,
  onConnections,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const recording = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const busy = arriving > 0 || items.length > 0;
  const finished = items.filter((item) => ready.includes(item.id)).length;
  const total = items.length + arriving;

  const demo = useMemo(() => {
    if (catalog.samples.length === 0) return null;
    return planWith(catalog, catalog.samples, {
      vibe: "cinematic",
      template: "weekend-recap",
      aspect: "9:16",
      duration: 14,
      seed: 4,
      title: "Your reel",
      excludedScenes: [],
      recipe: null,
      demo: null,
      script: null,
    });
  }, [catalog]);

  return (
    <main className="start">
      <section className="start-copy">
        {reading ? (
          <>
            <h1 className="headline" aria-live="polite">
              Finding the best moments.
            </h1>
            <p className="lede">
              U-Cut is listening to your recording and watching the screen. A minute of recording
              takes about 20 seconds.
            </p>
            <div
              className="meter is-working"
              role="progressbar"
              aria-label="Reading your recording"
            >
              <span />
            </div>
          </>
        ) : busy ? (
          <>
            <h1 className="headline" aria-live="polite">
              {finished} of {total}
            </h1>
            <p className="lede">Reading your media. Your reel will start by itself.</p>
            <div
              className="meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={finished}
              aria-label="Reading your media"
            >
              <span style={{ width: `${(finished / Math.max(total, 1)) * 100}%` }} />
            </div>
            <ul className="arrivals" aria-hidden="true">
              {items.slice(-14).map((item) => (
                <li key={item.id} className={ready.includes(item.id) ? "is-ready" : ""}>
                  {ready.includes(item.id) ? <img src={thumbUrl(item.id)} alt="" /> : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h1 className="headline">Drop your photos and clips.</h1>
            <p className="lede">
              U-Cut cuts them to music and plays you a finished reel in seconds.
              {isLocal ? " Your files stay on this computer." : ""}
            </p>
            <div className="start-actions">
              <button type="button" className="button-solid" onClick={() => input.current?.click()}>
                Choose files
              </button>
              <button type="button" className="button-quiet" onClick={onSamples}>
                Try it with sample photos
              </button>
            </div>
            <form
              className="start-prompt"
              onSubmit={(event) => {
                event.preventDefault();
                if (prompt.trim()) onPrompt(prompt.trim());
              }}
            >
              <label>
                <span className="start-prompt-label">Or just describe it</span>
                <span className="start-prompt-row">
                  <textarea
                    rows={prompt.length > 48 ? 3 : 1}
                    value={prompt}
                    maxLength={4000}
                    placeholder="A 20-second reel about my Goa trip, chill vibe"
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button type="submit" className="button-solid" disabled={!prompt.trim()}>
                    Write it
                  </button>
                </span>
              </label>
            </form>
            <button
              type="button"
              className="button-text start-recording"
              onClick={() => recording.current?.click()}
            >
              Turn a screen recording into a demo
            </button>
            <button type="button" className="button-text start-connections" onClick={onConnections}>
              Connect your assistant, voices and more
            </button>
            <input
              ref={recording}
              type="file"
              accept="video/*,.mov"
              hidden
              aria-label="Choose a screen recording"
              onChange={(event) => {
                const [file] = event.target.files ?? [];
                if (file) onRecording(file);
                event.target.value = "";
              }}
            />
            <input
              ref={input}
              type="file"
              accept="image/*,video/*,.heic,.heif,.mov"
              multiple
              hidden
              aria-label="Choose photos and clips"
              onChange={(event) => onFiles([...(event.target.files ?? [])])}
            />
          </>
        )}
      </section>
      {demo ? (
        <aside className="start-reel" aria-hidden="true">
          <div className="stage-glow" />
          <Stage catalog={catalog} items={catalog.samples} plan={demo} muted />
        </aside>
      ) : null}
    </main>
  );
}
