import { useEffect, useRef } from "react";
import type { SetupPart } from "../api";
import { megabytes, progressText, useSetupPart } from "../setup";

interface Props {
  exporter: SetupPart;
  onReady(): void;
  onLater(): void;
}

/** The first thing a new Mac sees: one download, with its size, before the first export. */
export function GettingReady({ exporter, onReady, onLater }: Props) {
  const { part = exporter, problem, start } = useSetupPart(exporter);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  useEffect(() => {
    heading.current?.focus();
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  useEffect(() => {
    if (part.ready) onReady();
  }, [part.ready, onReady]);

  const share = part.bytes > 0 ? Math.min(1, part.done / part.bytes) : 0;
  const failed = Boolean(problem) && !part.ready;

  return (
    <main className="start getting-ready">
      <section className="start-copy">
        <h1 className="headline" ref={heading} tabIndex={-1}>
          Getting U-Cut ready.
        </h1>
        <p className="lede">
          One last piece, then you can export: the part that draws every frame of your reel. It's{" "}
          {megabytes(part.bytes)}, comes from Google's Chrome for Testing, and stays on this Mac.
          This happens once.
        </p>
        {failed ? (
          <div className="ready-problem" role="alert">
            <p>{problem}</p>
            <div className="start-actions">
              <button type="button" className="button-solid" onClick={() => void start()}>
                Try again
              </button>
              <button type="button" className="button-text" onClick={onLater}>
                Look around first
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="meter"
              role="progressbar"
              aria-label="Download progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(share * 100)}
              aria-valuetext={progressText(part)}
            >
              <span style={{ width: `${share * 100}%` }} />
            </div>
            <p className="ready-status" aria-live="polite">
              {progressText(part)}
            </p>
            <div className="start-actions">
              <button type="button" className="button-text" onClick={onLater}>
                Look around first
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
