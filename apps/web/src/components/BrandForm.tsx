import type { Brand, Demo } from "@u-cut/schema";
import { useEffect, useRef, useState } from "react";
import type { SetupPart } from "../api";
import { megabytes, progressText, useSetupPart } from "../setup";

interface Props {
  demo: Demo;
  /** The speech model's status, for offering captions when it's missing. */
  speech: SetupPart | undefined;
  /** Whether this is the Mac running U-Cut, the only place that can download it. */
  local: boolean;
  onBrand(brand: Brand): void;
  onCaptions(on: boolean): void;
  onLogo(file: File): void;
}

const settleMs = 250;

export function BrandForm({ demo, speech, local, onBrand, onCaptions, onLogo }: Props) {
  const { brand } = demo;
  const picker = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(brand.name);
  const [colour, setColour] = useState(brand.colour);

  useEffect(() => {
    setName(brand.name);
    setColour(brand.colour);
  }, [brand.name, brand.colour]);

  // Each change rebuilds the demo, so it waits for a pause rather than every key.
  useEffect(() => {
    if (name === brand.name && colour === brand.colour) return;
    const timer = setTimeout(() => onBrand({ ...brand, name, colour }), settleMs);
    return () => clearTimeout(timer);
  }, [name, colour, brand, onBrand]);

  return (
    <>
      <label className="title-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          placeholder="Your product"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="brand-row">
        <label className="brand-colour">
          <input
            type="color"
            value={colour}
            aria-label="Card colour"
            onChange={(event) => setColour(event.target.value)}
          />
          <span>Colour</span>
        </label>
        <button type="button" className="button-text" onClick={() => picker.current?.click()}>
          {brand.logo ? "Change logo" : "Add a logo"}
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          aria-label="Choose a logo"
          onChange={(event) => {
            const [file] = event.target.files ?? [];
            if (file) onLogo(file);
            event.target.value = "";
          }}
        />
      </div>
      {demo.speech === "heard" ? (
        <label className="brand-switch">
          <input
            type="checkbox"
            checked={demo.captions}
            onChange={(event) => onCaptions(event.target.checked)}
          />
          <span>Show captions</span>
        </label>
      ) : null}
      {demo.speech === "no-model" ? <CaptionsOffer speech={speech} local={local} /> : null}
    </>
  );
}

/** Captions need a one-time download, which this offers right where they're missing. */
function CaptionsOffer({ speech, local }: { speech: SetupPart | undefined; local: boolean }) {
  const { part = speech, problem, start } = useSetupPart(speech);
  if (!part) return null;
  if (part.ready) {
    return (
      <p className="brand-note">
        Captions are ready. Press New reel and add the recording again to caption it.
      </p>
    );
  }
  if (!local) {
    return (
      <p className="brand-note">
        Captions need a download that only the person running U-Cut can add.
      </p>
    );
  }
  const busy = part.state === "working" || part.state === "waiting";
  return (
    <div className="brand-note">
      <p>
        Captions need the speech model, a one-time {megabytes(part.bytes)} download that stays on
        this Mac.
      </p>
      <button type="button" className="button-outline" disabled={busy} onClick={() => void start()}>
        {busy ? progressText(part) : "Add captions"}
      </button>
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}
