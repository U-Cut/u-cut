import type { Demo, Moment } from "@u-cut/schema";
import type { RefObject } from "react";

interface Props {
  demo: Demo;
  playhead: RefObject<HTMLDivElement | null>;
  /** Where each kept moment starts in the finished demo. */
  starts: Map<number, number>;
  onSeek(time: number): void;
  onToggle(index: number): void;
  onCaption(index: number, caption: string): void;
}

const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

function Pick({
  moment,
  kept,
  canEdit,
  onSeek,
  onToggle,
  onCaption,
}: {
  moment: Moment;
  kept: boolean;
  canEdit: boolean;
  onSeek(): void;
  onToggle(): void;
  onCaption(caption: string): void;
}) {
  const words = moment.caption ?? moment.quote;
  return (
    <li className={kept ? "pick" : "pick is-skipped"}>
      <div className="pick-head">
        <button type="button" className="pick-time" onClick={onSeek} disabled={!kept}>
          {clock(moment.in)}
          <span>{(moment.out - moment.in).toFixed(1)} s</span>
        </button>
        <button type="button" className="pick-toggle" aria-pressed={kept} onClick={onToggle}>
          {kept ? "Keep" : "Skip"}
        </button>
      </div>
      <p className="pick-why">{moment.why}</p>
      {canEdit ? (
        <textarea
          aria-label={`What's said at ${clock(moment.in)}`}
          rows={2}
          defaultValue={words}
          onBlur={(event) => {
            const text = event.target.value.trim();
            if (text && text !== words) onCaption(text);
          }}
        />
      ) : null}
    </li>
  );
}

export function Moments({ demo, playhead, starts, onSeek, onToggle, onCaption }: Props) {
  return (
    <section className="film moments" aria-label="Moments in this recording">
      <div className="moments-bar">
        <div ref={playhead} className="moments-playhead" />
      </div>
      <ol>
        {demo.moments.map((moment, index) => (
          <Pick
            key={`${moment.in}-${moment.out}-${moment.caption ?? ""}`}
            moment={moment}
            kept={!demo.skipped.includes(index)}
            canEdit={moment.quote.length > 0}
            onSeek={() => onSeek(starts.get(index) ?? 0)}
            onToggle={() => onToggle(index)}
            onCaption={(caption) => onCaption(index, caption)}
          />
        ))}
      </ol>
    </section>
  );
}
