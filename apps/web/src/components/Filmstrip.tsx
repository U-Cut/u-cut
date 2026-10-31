import type { EditPlan, MediaItem } from "@u-cut/schema";
import { type RefObject, useState } from "react";
import { thumbUrl } from "../api";

interface Props {
  plan: EditPlan;
  items: MediaItem[];
  playhead: RefObject<HTMLDivElement | null>;
  onSeek(time: number): void;
  onSwap(first: number, second: number): void;
  onReplace(index: number, item: MediaItem): void;
}

export function Filmstrip({ plan, items, playhead, onSeek, onSwap, onReplace }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const chosen = selected === null ? undefined : plan.shots[selected];
  const unused = items.filter((item) => item.id !== chosen?.media);

  return (
    <section className="film" aria-label="Shots in this reel">
      {chosen && selected !== null ? (
        <section className="swap" aria-label={`Replace shot ${selected + 1}`}>
          <p>Replace this shot</p>
          <ul>
            {unused.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={`Use ${item.kind} ${item.id.slice(0, 6)}`}
                  onClick={() => {
                    onReplace(selected, item);
                    setSelected(null);
                  }}
                >
                  <img src={thumbUrl(item.id)} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="button-text" onClick={() => setSelected(null)}>
            Keep it
          </button>
        </section>
      ) : null}
      <div className="strip">
        {plan.shots.map((shot, index) => (
          <button
            type="button"
            key={`${shot.media}-${shot.start}`}
            className={[
              "shot-tile",
              selected === index ? "is-selected" : "",
              over === index ? "is-over" : "",
              dragging === index ? "is-dragging" : "",
            ].join(" ")}
            style={{ flexGrow: shot.end - shot.start }}
            draggable
            aria-label={`Shot ${index + 1}, ${(shot.end - shot.start).toFixed(1)} seconds. Press to replace.`}
            aria-pressed={selected === index}
            onClick={() => {
              onSeek(shot.start);
              setSelected(selected === index ? null : index);
            }}
            onDragStart={(event) => {
              setDragging(index);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-ucut-shot", String(index));
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              if (dragging === null) return;
              event.preventDefault();
              event.stopPropagation();
              setOver(index);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragging !== null) onSwap(dragging, index);
              setDragging(null);
              setOver(null);
            }}
          >
            <img src={thumbUrl(shot.media)} alt="" draggable={false} />
          </button>
        ))}
        <div className="playhead" ref={playhead} />
      </div>
    </section>
  );
}
