// Synthesises the sound effects in library/sfx. Run with: pnpm exec tsx scripts/make-sfx.ts
// Everything here is generated from this file, so the effects are dedicated to CC0.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rate = 48000;
const folder = fileURLToPath(new URL("../library/sfx/", import.meta.url));

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A band-pass filter whose centre can move every sample. */
class BandPass {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  run(input: number, centre: number, q: number): number {
    const w = (2 * Math.PI * Math.min(centre, rate * 0.45)) / rate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w)) / a0;
    const a2 = (1 - alpha) / a0;
    const output = b0 * input + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

/** A one-pole low-pass, for softening noise. */
function lowPass(cutoff: number) {
  const k = Math.exp((-2 * Math.PI * cutoff) / rate);
  let last = 0;
  return (input: number) => {
    last = (1 - k) * input + k * last;
    return last;
  };
}

interface Sound {
  file: string;
  /** What it's for, shown to template authors. */
  use: string;
  seconds: number;
  render(left: Float32Array, right: Float32Array): void;
}

const sounds: Sound[] = [
  {
    file: "whoosh.m4a",
    use: "A cut between sections",
    seconds: 0.7,
    render(left, right) {
      const noise = rng(11);
      const filter = new BandPass();
      for (let i = 0; i < left.length; i += 1) {
        const t = i / left.length;
        const centre = 400 * (t < 0.55 ? 9 ** (t / 0.55) : 9 * (1 / 3) ** ((t - 0.55) / 0.45));
        const envelope = t < 0.55 ? (t / 0.55) ** 2.2 : (1 - (t - 0.55) / 0.45) ** 1.6;
        const value = filter.run(noise() * 2 - 1, centre, 1.4) * envelope * 3.2;
        const pan = -0.6 + 1.2 * t;
        left[i] = value * (1 - Math.max(pan, 0));
        right[i] = value * (1 + Math.min(pan, 0));
      }
    },
  },
  {
    file: "hit.m4a",
    use: "The first beat, or the closing shot landing",
    seconds: 1.2,
    render(left, right) {
      const noise = rng(23);
      const soften = lowPass(1800);
      let phase = 0;
      for (let i = 0; i < left.length; i += 1) {
        const t = i / rate;
        const pitch = 42 + 68 * Math.exp(-t / 0.08);
        phase += (2 * Math.PI * pitch) / rate;
        const body = Math.sin(phase) * Math.exp(-t / 0.35);
        const click = soften(noise() * 2 - 1) * Math.exp(-t / 0.012) * 1.4;
        const value = Math.tanh((body + click) * 1.6) * 0.9;
        left[i] = value;
        right[i] = value;
      }
    },
  },
  {
    file: "riser.m4a",
    use: "Building into the closing shot",
    seconds: 2.4,
    render(left, right) {
      const noise = rng(37);
      const filter = new BandPass();
      let phaseA = 0;
      let phaseB = 0;
      for (let i = 0; i < left.length; i += 1) {
        const t = i / left.length;
        const pitch = 220 * 4 ** t;
        phaseA += (2 * Math.PI * pitch) / rate;
        phaseB += (2 * Math.PI * pitch * 1.007) / rate;
        const tone = (Math.sin(phaseA) + 0.5 * Math.sin(2 * phaseA) + Math.sin(phaseB)) / 2.5;
        const air = filter.run(noise() * 2 - 1, 300 * 20 ** t, 0.9) * 2.2;
        const tail = Math.min(1, (left.length - i) / (rate * 0.02));
        const value = (tone * 0.5 + air) * t ** 2 * tail;
        left[i] = value;
        right[i] = value * 0.94;
      }
    },
  },
  {
    file: "swell.m4a",
    use: "A soft opening",
    seconds: 2,
    render(left, right) {
      const noise = rng(41);
      // Two gentle filters in a row, so the breath under the chord is soft rather than hissy.
      const breathA = lowPass(600);
      const breathB = lowPass(600);
      const notes = [57, 61, 64, 68].map((midi) => 440 * 2 ** ((midi - 69) / 12));
      for (let i = 0; i < left.length; i += 1) {
        const t = i / rate;
        const envelope = Math.min(1, (t / 1.4) ** 1.5) * Math.min(1, (2 - t) / 0.6);
        let chord = 0;
        notes.forEach((frequency, index) => {
          chord += Math.sin(2 * Math.PI * frequency * t + index) * 0.25;
          chord += Math.sin(4 * Math.PI * frequency * t) * 0.06;
        });
        const air = breathB(breathA(noise() * 2 - 1)) * 0.6;
        left[i] = (chord + air) * envelope;
        right[i] = (chord * 0.96 + air * 1.04) * envelope;
      }
    },
  },
  {
    file: "shutter.m4a",
    use: "A photo appearing, for nostalgic reels",
    seconds: 0.35,
    render(left, right) {
      const noise = rng(53);
      const filter = new BandPass();
      const click = (t: number, at: number, level: number) => {
        if (t < at) return 0;
        const since = t - at;
        return (
          filter.run(noise() * 2 - 1, 3200, 2.5) * Math.exp(-since / 0.006) * level * 4 +
          Math.sin(2 * Math.PI * 2200 * since) * Math.exp(-since / 0.01) * level * 0.4
        );
      };
      for (let i = 0; i < left.length; i += 1) {
        const t = i / rate;
        const value = click(t, 0, 1) + click(t, 0.09, 0.55);
        left[i] = value;
        right[i] = value;
      }
    },
  },
  {
    file: "pop.m4a",
    use: "A label appearing",
    seconds: 0.18,
    render(left, right) {
      let phase = 0;
      for (let i = 0; i < left.length; i += 1) {
        const t = i / rate;
        phase += (2 * Math.PI * (450 + 450 * Math.exp(-t / 0.03))) / rate;
        const value = Math.sin(phase) * Math.exp(-t / 0.045) * Math.min(1, t / 0.002);
        left[i] = value;
        right[i] = value;
      }
    },
  },
];

function wav(left: Float32Array, right: Float32Array): Buffer {
  let peak = 1e-9;
  for (let i = 0; i < left.length; i += 1) {
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0));
  }
  // Every effect peaks at -3 dBFS, so their levels in a plan mean the same thing.
  const gain = 0.708 / peak;
  const data = Buffer.alloc(left.length * 4);
  for (let i = 0; i < left.length; i += 1) {
    data.writeInt16LE(Math.round((left[i] ?? 0) * gain * 32767), i * 4);
    data.writeInt16LE(Math.round((right[i] ?? 0) * gain * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const work = mkdtempSync(join(tmpdir(), "ucut-sfx-"));
const entries = sounds.map((sound) => {
  const length = Math.round(sound.seconds * rate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  sound.render(left, right);
  const raw = join(work, `${sound.file}.wav`);
  writeFileSync(raw, wav(left, right));
  execFileSync("ffmpeg", [
    ...["-hide_banner", "-loglevel", "error", "-y", "-i", raw],
    ...["-c:a", "aac", "-b:a", "160k", "-map_metadata", "-1", join(folder, sound.file)],
  ]);
  return {
    file: sound.file,
    licence: "CC0-1.0",
    source: "scripts/make-sfx.ts",
    use: sound.use,
    length: sound.seconds,
  };
});
rmSync(work, { recursive: true, force: true });
writeFileSync(join(folder, "assets.json"), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} sound effects to ${folder}`);
