import type { Script } from "@u-cut/schema";
import type { RefObject } from "react";

interface Props {
  script: Script;
  playhead: RefObject<HTMLDivElement | null>;
  /** Where each line starts in the reel. */
  starts: number[];
  onSeek(time: number): void;
  onChange(index: number, text: string): void;
  onRemove(index: number): void;
  onAdd(): void;
  onRewrite(): void;
}

export function ScriptLines({
  script,
  playhead,
  starts,
  onSeek,
  onChange,
  onRemove,
  onAdd,
  onRewrite,
}: Props) {
  return (
    <section className="film moments" aria-label="Your script">
      <div className="moments-bar">
        <div ref={playhead} className="moments-playhead" />
      </div>
      <ol>
        {script.lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a line is its place and its words.
          <li className="pick" key={`${index}-${line.text}`}>
            <div className="pick-head">
              <button
                type="button"
                className="pick-time"
                onClick={() => onSeek(starts[index] ?? 0)}
              >
                Line {index + 1}
              </button>
              {script.lines.length > 1 ? (
                <button
                  type="button"
                  className="pick-toggle"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => onRemove(index)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <textarea
              aria-label={`Line ${index + 1}`}
              rows={2}
              maxLength={160}
              defaultValue={line.text}
              onBlur={(event) => {
                const text = event.target.value.trim();
                if (text && text !== line.text) onChange(index, text);
              }}
            />
          </li>
        ))}
        <li className="pick pick-actions">
          <button type="button" className="button-text" onClick={onAdd}>
            Add a line
          </button>
          <button type="button" className="button-text" onClick={onRewrite}>
            Write it differently
          </button>
        </li>
      </ol>
    </section>
  );
}
