import { useEffect, useRef } from "react";
import type { RenderEvent } from "../api";

interface Props {
  render: RenderEvent;
  onClose(): void;
}

function waitingLine(render: RenderEvent): string {
  const ahead = (render.position ?? 1) - 1;
  const seconds = render.etaSeconds ?? 0;
  const time =
    seconds >= 90
      ? `about ${Math.round(seconds / 60)} minutes`
      : `about ${Math.max(5, seconds)} seconds`;
  if (ahead > 0) return `${ahead} ${ahead === 1 ? "reel" : "reels"} ahead of yours, ${time}.`;
  return `This will take ${time}.`;
}

const stageNames: Record<string, string> = {
  preparing: "Getting your media ready",
  rendering: "Rendering every frame",
  finishing: "Balancing the sound",
};

export function ExportSheet({ render, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const finished = render.state === "done" && render.url;
  const failed = render.state === "failed";

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label="Export"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {finished ? (
        <div className="sheet-done">
          {/* biome-ignore lint/a11y/useMediaCaption: a reel of music and pictures has no speech to caption. */}
          <video src={render.url} autoPlay loop controls playsInline className="final" />
          <div className="sheet-side">
            <h2>Your reel is ready.</h2>
            <p>Download it and post it anywhere.</p>
            <a className="button-solid" href={`${render.url}?download`}>
              Download MP4
            </a>
            <button type="button" className="button-quiet" onClick={onClose}>
              Back to editing
            </button>
          </div>
        </div>
      ) : failed ? (
        <div className="sheet-progress">
          <h2>That export didn't finish.</h2>
          <p>{render.error}</p>
          <button type="button" className="button-solid" onClick={onClose}>
            Back to editing
          </button>
        </div>
      ) : (
        <div className="sheet-progress">
          <h2 aria-live="polite">
            {render.state === "queued" ? "In line" : `${Math.round(render.progress * 100)}%`}
          </h2>
          <p>
            {render.state === "queued"
              ? waitingLine(render)
              : (stageNames[render.stage ?? ""] ?? "Rendering every frame")}
          </p>
          <div
            className="meter"
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(render.progress * 100)}
          >
            <span style={{ width: `${render.progress * 100}%` }} />
          </div>
          <button type="button" className="button-text" onClick={onClose}>
            Cancel export
          </button>
        </div>
      )}
    </dialog>
  );
}
