import type { Catalog } from "../api";

interface Props {
  catalog: Catalog;
  voice: string | null;
  ready: boolean;
  installing: boolean;
  voicing: { done: number; total: number } | null;
  onVoice(voice: string | null): void;
  onInstall(): void;
}

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export function VoiceChoice({
  catalog,
  voice,
  ready,
  installing,
  voicing,
  onVoice,
  onInstall,
}: Props) {
  if (!ready) {
    return (
      <div className="voice-offer">
        <p>
          {isLocal
            ? `Add a voice to read this aloud. It's a one-time ${catalog.voice.size} download, and it stays on this computer.`
            : "The person running U-Cut can add a voice from their computer."}
        </p>
        {isLocal ? (
          <button
            type="button"
            className="button-outline"
            disabled={installing}
            onClick={onInstall}
          >
            {installing ? "Getting the voice" : "Add a voice"}
          </button>
        ) : null}
      </div>
    );
  }
  const options = [...catalog.voice.voices, { id: "", name: "None" }];
  return (
    <fieldset className="choice">
      <legend>Voice</legend>
      <div>
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            aria-pressed={(voice ?? "") === option.id}
            onClick={() => onVoice(option.id || null)}
          >
            {option.name}
          </button>
        ))}
      </div>
      {voicing ? (
        <p className="voice-progress" aria-live="polite">
          Reading line {Math.min(voicing.done + 1, voicing.total)} of {voicing.total}
        </p>
      ) : null}
    </fieldset>
  );
}
