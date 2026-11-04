import { useEffect, useState } from "react";
import { api, type Catalog, type VoiceList } from "../api";

interface Props {
  catalog: Catalog;
  voice: string | null;
  ready: boolean;
  installing: boolean;
  voicing: { done: number; total: number } | null;
  onVoice(voice: string | null): void;
  onInstall(): void;
  /** Opens Connections, where other voices are. */
  onMore(): void;
}

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
/** Past this many voices, a list is easier to scan than a row of names. */
const rowLimit = 6;

const serviceNames: Record<string, string> = {
  voicestudio: "Voice Studio",
  elevenlabs: "ElevenLabs",
  deepgram: "Deepgram",
};

export function VoiceChoice({
  catalog,
  voice,
  ready,
  installing,
  voicing,
  onVoice,
  onInstall,
  onMore,
}: Props) {
  const service = catalog.uses.voice;
  const [listed, setListed] = useState<VoiceList | null>(null);

  useEffect(() => {
    if (service === "kokoro") return;
    let cancelled = false;
    api.voices().then(
      (list) => {
        if (!cancelled) setListed(list);
      },
      (error: Error) => {
        if (!cancelled) setListed({ service, ready: false, voices: [], error: error.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [service]);

  if (service === "kokoro" && !ready) {
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

  const options =
    service === "kokoro" ? catalog.voice.voices : (listed?.voices ?? []).map((entry) => entry);
  const progress = voicing ? (
    <p className="voice-progress" aria-live="polite">
      Reading line {Math.min(voicing.done + 1, voicing.total)} of {voicing.total}
    </p>
  ) : null;

  if (service !== "kokoro" && listed && !listed.ready) {
    return (
      <div className="voice-offer">
        <p>
          {listed.error ?? `${serviceNames[service]} isn't answering.`} Check your connection, or
          pick another voice in Connections.
        </p>
        <button type="button" className="button-outline" onClick={() => onVoice(null)}>
          No voice
        </button>
      </div>
    );
  }

  if (options.length > rowLimit) {
    return (
      <fieldset className="choice">
        <legend>Voice, from {serviceNames[service]}</legend>
        <select
          className="voice-select"
          value={voice ?? ""}
          onChange={(event) => onVoice(event.target.value || null)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {"detail" in option && option.detail
                ? `${option.name}, ${option.detail}`
                : option.name}
            </option>
          ))}
          <option value="">No voice</option>
        </select>
        <button type="button" className="button-text voice-more" onClick={onMore}>
          More voices
        </button>
        {progress}
      </fieldset>
    );
  }

  return (
    <fieldset className="choice">
      <legend>{service === "kokoro" ? "Voice" : `Voice, from ${serviceNames[service]}`}</legend>
      <div>
        {[...options, { id: "", name: "No voice" }].map((option) => (
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
      <button type="button" className="button-text voice-more" onClick={onMore}>
        More voices
      </button>
      {progress}
    </fieldset>
  );
}
