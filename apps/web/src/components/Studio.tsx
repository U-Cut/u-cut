import { vibes } from "@u-cut/planner-rules";
import type { Aspect, MediaItem, Vibe } from "@u-cut/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Catalog } from "../api";
import type { useReel } from "../reel";
import { ExportSheet } from "./ExportSheet";
import { Filmstrip } from "./Filmstrip";
import { MuteIcon, PauseIcon, PlayIcon, RedoIcon, SoundIcon, UndoIcon } from "./icons";
import { Sort } from "./Sort";
import { Stage, type StageHandle } from "./Stage";

type Reel = ReturnType<typeof useReel>;

interface Props {
  catalog: Catalog;
  reel: Reel;
}

const vibeNames = Object.keys(vibes) as Vibe[];
const vibeLabels: Record<Vibe, string> = {
  chill: "Chill",
  hype: "Hype",
  cinematic: "Cinematic",
  nostalgic: "Nostalgic",
};
const lengths = [10, 20, 30, 45];
const shapes: { value: Aspect; label: string }[] = [
  { value: "9:16", label: "Tall" },
  { value: "1:1", label: "Square" },
  { value: "16:9", label: "Wide" },
];

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            type="button"
            key={String(option.value)}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Studio({ catalog, reel }: Props) {
  const { state, actions } = reel;
  const now = state.now;
  const stage = useRef<StageHandle>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(0);
  const [sorting, setSorting] = useState(false);

  const plan = now?.plan;
  const onTime = useCallback(
    (time: number) => {
      if (!plan) return;
      if (playhead.current) playhead.current.style.left = `${(time / plan.duration) * 100}%`;
      // The room breathes with the music.
      const beatsPerSecond = (plan.music.bpm ?? 100) / 60;
      const phase = ((time + plan.music.start) * beatsPerSecond) % 1;
      room.current?.style.setProperty("--beat", Math.exp(-phase * 4.5).toFixed(3));
    },
    [plan],
  );

  const remix = useCallback(() => {
    setFlash((value) => value + 1);
    actions.remix();
  }, [actions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) || state.render || sorting) return;
      const command = event.metaKey || event.ctrlKey;
      if (event.code === "Space" && target.tagName !== "BUTTON") {
        event.preventDefault();
        stage.current?.toggle();
      } else if (event.key.toLowerCase() === "r" && !command) {
        remix();
      } else if (event.key.toLowerCase() === "z" && command) {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (!plan) return;
        const time = stage.current?.time() ?? 0;
        const next =
          event.key === "ArrowRight"
            ? plan.shots.find((shot) => shot.start > time + 0.01)
            : plan.shots.findLast((shot) => shot.start < time - 0.25);
        stage.current?.seek(next?.start ?? 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, plan, remix, sorting, state.render]);

  if (!now || !plan) return null;
  const { settings } = now;
  const templates = catalog.templates.map((template) => ({
    value: template.manifest.id,
    label: template.manifest.name,
  }));

  return (
    <div className="studio" ref={room}>
      <div className="stage-glow is-breathing" />
      <header className="topbar">
        <div className="topbar-start">
          <span className="wordmark">U-Cut</span>
          <button
            type="button"
            className="button-text"
            onClick={() => {
              if (window.confirm("Start a new reel? This one will close.")) actions.startOver();
            }}
          >
            New reel
          </button>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-button"
            onClick={actions.undo}
            disabled={state.past.length === 0}
            aria-label="Undo"
            title="Undo (⌘Z)"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={actions.redo}
            disabled={state.future.length === 0}
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
          >
            <RedoIcon />
          </button>
          <button type="button" className="button-solid" onClick={() => void actions.exportReel()}>
            Export
          </button>
        </div>
      </header>

      <nav className="vibes" aria-label="Vibe">
        {vibeNames.map((vibe) => (
          <button
            type="button"
            key={vibe}
            aria-pressed={settings.vibe === vibe}
            onClick={() => actions.change({ vibe })}
          >
            {vibeLabels[vibe]}
          </button>
        ))}
      </nav>

      <section className="center" aria-label="Your reel">
        <div className={`stage-wrap shape-${settings.aspect.replace(":", "x")}`}>
          <button
            type="button"
            className="stage-button"
            onClick={() => stage.current?.toggle()}
            aria-label={playing ? "Pause" : "Play"}
          >
            <Stage
              ref={stage}
              catalog={catalog}
              items={state.items}
              plan={plan}
              muted={muted}
              onTime={onTime}
              onPlayingChange={setPlaying}
            />
            {playing ? null : (
              <span className="paused" aria-hidden="true">
                <PlayIcon />
              </span>
            )}
          </button>
          <span key={flash} className={flash ? "shutter" : ""} aria-hidden="true" />
        </div>
        <div className="transport">
          <button
            type="button"
            className="icon-button"
            onClick={() => stage.current?.toggle()}
            aria-label={playing ? "Pause" : "Play"}
            title="Space"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="remix" onClick={remix} aria-keyshortcuts="R">
            Remix <kbd>R</kbd>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={muted ? "Turn sound on" : "Mute"}
            onClick={() => {
              setMuted(!muted);
              stage.current?.setMuted(!muted);
            }}
          >
            {muted ? <MuteIcon /> : <SoundIcon />}
          </button>
        </div>
      </section>

      <aside className="controls" aria-label="Reel settings">
        <label className="title-field">
          <span>Title</span>
          <input
            type="text"
            value={settings.title}
            placeholder="Add a title"
            maxLength={60}
            onChange={(event) => actions.rename(event.target.value)}
          />
        </label>
        <Choice
          label="Style"
          options={templates}
          value={settings.template}
          onChange={(template) => actions.change({ template })}
        />
        <Choice
          label="Length"
          options={lengths.map((value) => ({ value, label: `${value} s` }))}
          value={lengths.reduce((best, value) =>
            Math.abs(value - settings.duration) < Math.abs(best - settings.duration) ? value : best,
          )}
          onChange={(duration) => actions.change({ duration })}
        />
        <Choice
          label="Shape"
          options={shapes}
          value={settings.aspect}
          onChange={(aspect) => actions.change({ aspect })}
        />
        <div className="media-note">
          <p>
            {Math.round(plan.duration)} seconds, {plan.shots.length} shots
          </p>
          <button type="button" className="button-text" onClick={() => setSorting(true)}>
            Sort your photos
          </button>
          <button type="button" className="button-text" onClick={() => picker.current?.click()}>
            Add photos or clips
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*,video/*,.heic,.heif,.mov"
            multiple
            hidden
            aria-label="Add photos or clips"
            onChange={(event) => {
              void actions.addFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </div>
      </aside>

      <Filmstrip
        plan={plan}
        items={state.items as MediaItem[]}
        playhead={playhead}
        onSeek={(time) => stage.current?.seek(time)}
        onSwap={actions.swap}
        onReplace={actions.replace}
      />

      {state.render ? <ExportSheet render={state.render} onClose={actions.cancelExport} /> : null}
      {sorting ? (
        <Sort
          catalog={catalog}
          items={state.items}
          excluded={settings.excludedScenes}
          onExcluded={actions.setExcluded}
          onScene={(item, scene) => void actions.setScene(item, scene)}
          onClose={() => setSorting(false)}
        />
      ) : null}
    </div>
  );
}
