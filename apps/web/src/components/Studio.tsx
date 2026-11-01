import { vibes } from "@u-cut/planner-rules";
import type { Aspect, MediaItem, Vibe } from "@u-cut/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "../api";
import type { useReel } from "../reel";
import { BrandForm } from "./BrandForm";
import { ExportSheet } from "./ExportSheet";
import { Filmstrip } from "./Filmstrip";
import { MuteIcon, PauseIcon, PlayIcon, PlusIcon, RedoIcon, SoundIcon, UndoIcon } from "./icons";
import { Moments } from "./Moments";
import { ScriptLines } from "./ScriptLines";
import { Sort } from "./Sort";
import { Stage, type StageHandle } from "./Stage";
import { VoiceChoice } from "./VoiceChoice";

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
/** These are used by a matched reel, a demo and a written reel, not picked from the list. */
const builtForOneJob = ["recipe", "demo", "explainer"];
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
  const reelPicker = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(0);
  const [sorting, setSorting] = useState(false);

  const plan = now?.plan;
  const demo = now?.settings.demo ?? null;
  const script = now?.settings.script ?? null;
  const momentStarts = useMemo(() => {
    const starts = new Map<number, number>();
    const kept = (demo?.moments ?? []).flatMap((_, index) =>
      demo?.skipped.includes(index) ? [] : [index],
    );
    for (const [place, index] of kept.entries()) {
      const shot = plan?.shots[place];
      if (shot) starts.set(index, shot.start);
    }
    return starts;
  }, [demo, plan]);
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
      } else if (event.key.toLowerCase() === "r" && !command && !demo) {
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
  }, [actions, demo, plan, remix, sorting, state.render]);

  if (!now || !plan) return null;
  const { settings } = now;
  const templates = catalog.templates
    .filter((template) => !builtForOneJob.includes(template.manifest.id))
    .map((template) => ({ value: template.manifest.id, label: template.manifest.name }));

  return (
    <div className="studio" ref={room}>
      <div className="stage-glow is-breathing" />
      <header className="topbar">
        <span className="wordmark">U-Cut</span>
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
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              if (window.confirm("Start a new reel? This one will close.")) actions.startOver();
            }}
          >
            <PlusIcon />
            <span>New reel</span>
          </button>
          <button type="button" className="button-solid" onClick={() => void actions.exportReel()}>
            Export
          </button>
        </div>
      </header>

      {demo ? (
        <p className="demo-note">
          {demo.moments.length - demo.skipped.length} of {demo.moments.length} moments,{" "}
          {Math.round(plan.duration)} seconds
        </p>
      ) : (
        <nav className="vibes" aria-label="Vibe">
          {vibeNames.map((vibe) => (
            <button
              type="button"
              key={vibe}
              aria-pressed={settings.vibe === vibe && !settings.recipe}
              onClick={() =>
                settings.recipe ? actions.forgetReel({ vibe }) : actions.change({ vibe })
              }
            >
              {vibeLabels[vibe]}
            </button>
          ))}
          {settings.recipe ? (
            <button type="button" aria-pressed={true} disabled>
              Your reel
            </button>
          ) : null}
          {script ? null : (
            <button
              type="button"
              className="button-text match-reel"
              disabled={state.studying}
              onClick={() => reelPicker.current?.click()}
            >
              {state.studying ? "Studying your reel" : "Match a reel you love"}
            </button>
          )}
          <input
            ref={reelPicker}
            type="file"
            accept="video/*,.mov"
            hidden
            aria-label="Choose a reel to match"
            onChange={(event) => {
              const [file] = event.target.files ?? [];
              if (file) void actions.matchReel(file);
              event.target.value = "";
            }}
          />
        </nav>
      )}

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
          {demo ? null : (
            <button type="button" className="remix" onClick={remix} aria-keyshortcuts="R">
              Remix <kbd>R</kbd>
            </button>
          )}
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
        {demo ? (
          <>
            <BrandForm
              key={demo.media}
              demo={demo}
              onBrand={actions.setBrand}
              onCaptions={(captions) => actions.changeDemo({ captions })}
              onLogo={(file) => void actions.setLogo(file)}
            />
            <Choice
              label="Shape"
              options={shapes}
              value={settings.aspect}
              onChange={(aspect) => actions.change({ aspect })}
            />
          </>
        ) : script ? (
          <>
            <VoiceChoice
              catalog={catalog}
              voice={script.voice}
              ready={state.voiceReady ?? catalog.voice.ready}
              installing={state.installingVoice}
              voicing={state.voicing}
              onVoice={actions.setVoice}
              onInstall={() => void actions.addVoice()}
            />
            <Choice
              label="Shape"
              options={shapes}
              value={settings.aspect}
              onChange={(aspect) => actions.change({ aspect })}
            />
            <div className="media-note">
              <p>{Math.round(plan.duration)} seconds</p>
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
          </>
        ) : (
          <>
            {settings.recipe ? (
              <div className="recipe-card">
                <p>{settings.recipe.notes}</p>
                <p className="recipe-promise">
                  Your reel uses this style. Nothing from that reel appears in it.
                </p>
              </div>
            ) : null}
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
              value={settings.recipe ? "" : settings.template}
              onChange={(template) =>
                settings.recipe ? actions.forgetReel({ template }) : actions.change({ template })
              }
            />
            <Choice
              label="Length"
              options={lengths.map((value) => ({ value, label: `${value} s` }))}
              value={lengths.reduce((best, value) =>
                Math.abs(value - settings.duration) < Math.abs(best - settings.duration)
                  ? value
                  : best,
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
          </>
        )}
      </aside>

      {script ? (
        <ScriptLines
          script={script}
          playhead={playhead}
          starts={plan.texts.map((text) => text.start)}
          onSeek={(time) => stage.current?.seek(time)}
          onChange={actions.setLine}
          onRemove={actions.removeLine}
          onAdd={actions.addLine}
          onRewrite={actions.rewrite}
        />
      ) : demo ? (
        <Moments
          demo={demo}
          playhead={playhead}
          starts={momentStarts}
          onSeek={(time) => stage.current?.seek(time)}
          onToggle={actions.toggleMoment}
          onCaption={actions.setCaption}
        />
      ) : (
        <Filmstrip
          plan={plan}
          items={state.items as MediaItem[]}
          playhead={playhead}
          onSeek={(time) => stage.current?.seek(time)}
          onSwap={actions.swap}
          onReplace={actions.replace}
        />
      )}

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
