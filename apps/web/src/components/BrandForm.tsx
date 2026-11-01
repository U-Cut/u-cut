import type { Brand, Demo } from "@u-cut/schema";
import { useEffect, useRef, useState } from "react";

interface Props {
  demo: Demo;
  onBrand(brand: Brand): void;
  onCaptions(on: boolean): void;
  onLogo(file: File): void;
}

const settleMs = 250;

export function BrandForm({ demo, onBrand, onCaptions, onLogo }: Props) {
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
      {demo.speech === "no-model" ? (
        <p className="brand-note">
          Captions need the speech model. Run <code>ucut setup --speech</code>, then add the
          recording again.
        </p>
      ) : null}
    </>
  );
}
