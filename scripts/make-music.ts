// Synthesises the starter tracks in library/music. Run with: pnpm exec tsx scripts/make-music.ts
// Everything here is generated from this file, so the tracks are dedicated to CC0.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const rate = 44100;
const seconds = 60;

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

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Bus {
  left: Float32Array;
  right: Float32Array;
  constructor(public length: number) {
    this.left = new Float32Array(length);
    this.right = new Float32Array(length);
  }
  add(index: number, value: number, pan = 0) {
    if (index < 0 || index >= this.length) return;
    this.left[index] = (this.left[index] ?? 0) + value * (1 - Math.max(pan, 0));
    this.right[index] = (this.right[index] ?? 0) + value * (1 + Math.min(pan, 0));
  }
  mixInto(target: Bus, gain: (index: number) => number = () => 1) {
    for (let i = 0; i < this.length; i += 1) {
      const g = gain(i);
      target.left[i] = (target.left[i] ?? 0) + (this.left[i] ?? 0) * g;
      target.right[i] = (target.right[i] ?? 0) + (this.right[i] ?? 0) * g;
    }
  }
}

function electricPiano(bus: Bus, at: number, length: number, midi: number, gain: number, pan = 0) {
  const start = Math.floor(at * rate);
  const total = Math.floor((length + 0.5) * rate);
  const f = hz(midi);
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    const envelope = Math.exp(-t * 2.4) * Math.min(1, t * 200) * Math.min(1, (total - i) / 2000);
    const index = 1.6 * Math.exp(-t * 5);
    const value = Math.sin(2 * Math.PI * f * t + index * Math.sin(2 * Math.PI * f * 2 * t));
    bus.add(start + i, value * envelope * gain, pan);
  }
}

function pad(bus: Bus, at: number, length: number, midi: number, gain: number, brightness: number) {
  const start = Math.floor(at * rate);
  const total = Math.floor((length + 0.8) * rate);
  const f = hz(midi);
  const harmonics = Math.round(2 + brightness * 7);
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    const envelope = Math.min(1, t / 0.5) * Math.min(1, (total - i) / (0.8 * rate));
    let value = 0;
    for (const detune of [-0.006, 0, 0.007]) {
      for (let h = 1; h <= harmonics; h += 1) {
        value +=
          Math.sin(2 * Math.PI * f * (1 + detune) * h * t + detune * 90 * h) / (h * h ** 0.6);
      }
    }
    bus.add(start + i, (value / 3) * envelope * gain, Math.sin(t * 0.7) * 0.25);
  }
}

function bass(bus: Bus, at: number, length: number, midi: number, gain: number) {
  const start = Math.floor(at * rate);
  const total = Math.floor(length * rate);
  const f = hz(midi);
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    const envelope = Math.min(1, t * 120) * Math.min(1, (total - i) / 800);
    const value = Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(4 * Math.PI * f * t);
    bus.add(start + i, value * envelope * gain);
  }
}

function pluck(bus: Bus, at: number, midi: number, gain: number, pan: number) {
  const start = Math.floor(at * rate);
  const total = Math.floor(0.9 * rate);
  const f = hz(midi);
  for (let i = 0; i < total; i += 1) {
    const t = i / rate;
    const envelope = Math.exp(-t * 6) * Math.min(1, t * 400);
    const value = Math.sin(
      2 * Math.PI * f * t + Math.exp(-t * 14) * 2 * Math.sin(6 * Math.PI * f * t),
    );
    bus.add(start + i, value * envelope * gain, pan);
  }
}

function kick(bus: Bus, at: number, gain: number) {
  const start = Math.floor(at * rate);
  let phase = 0;
  for (let i = 0; i < 0.35 * rate; i += 1) {
    const t = i / rate;
    phase += (2 * Math.PI * (48 + 110 * Math.exp(-t * 34))) / rate;
    bus.add(start + i, Math.sin(phase) * Math.exp(-t * 9) * gain);
  }
}

function noiseHit(
  bus: Bus,
  at: number,
  gain: number,
  decay: number,
  tone: number,
  random: () => number,
  pan = 0,
) {
  const start = Math.floor(at * rate);
  let last = 0;
  for (let i = 0; i < 0.3 * rate; i += 1) {
    const t = i / rate;
    const white = random() * 2 - 1;
    const bright = white - last;
    last = white;
    const body = tone > 0 ? Math.sin(2 * Math.PI * tone * t) * 0.6 : 0;
    bus.add(start + i, (bright * 0.7 + body) * Math.exp(-t * decay) * gain, pan);
  }
}

/** A small Schroeder reverb, returned as a wet bus. */
function reverb(dry: Bus, amount: number): Bus {
  const wet = new Bus(dry.length);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356];
  for (const [channel, source, target] of [
    [0, dry.left, wet.left],
    [1, dry.right, wet.right],
  ] as const) {
    for (const size of combs) {
      const delay = new Float32Array(size + channel * 23);
      let cursor = 0;
      for (let i = 0; i < dry.length; i += 1) {
        const output = delay[cursor] ?? 0;
        delay[cursor] = (source[i] ?? 0) + output * 0.84;
        cursor = (cursor + 1) % delay.length;
        target[i] = (target[i] ?? 0) + (output * amount) / combs.length;
      }
    }
  }
  return wet;
}

interface Song {
  vibe: string;
  bpm: number;
  seed: number;
  chords: number[][];
  barsPerChord: number;
  scale: number[];
  brightness: number;
  arrange(ctx: {
    song: Song;
    music: Bus;
    drums: Bus;
    bar: number;
    t: number;
    beat: number;
    chord: number[];
    random: () => number;
  }): void;
  sidechain: number;
  vinyl: number;
}

const songs: Song[] = [
  {
    vibe: "chill",
    bpm: 84,
    seed: 11,
    chords: [
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64, 67],
      [48, 55, 59, 64, 67],
      [55, 59, 62, 64, 69],
    ],
    barsPerChord: 1,
    scale: [69, 72, 74, 76, 79, 81],
    brightness: 0.25,
    sidechain: 0.15,
    vinyl: 0,
    arrange({ music, drums, bar, t, beat, chord, song, random }) {
      for (const [i, note] of chord.entries()) {
        electricPiano(music, t + i * 0.012, beat * 3.5, note, 0.075, (i - 2) * 0.16);
      }
      bass(music, t, beat * 1.5, (chord[0] ?? 48) - 12, 0.2);
      bass(music, t + beat * 2.5, beat, (chord[0] ?? 48) - 12, 0.15);
      for (let step = 0; step < 8; step += 1) {
        if (bar > 1 && random() < 0.34) {
          const note = song.scale[Math.floor(random() * song.scale.length)] ?? 72;
          pluck(music, t + (step * beat) / 2, note, 0.06, random() - 0.5);
        }
      }
      if (bar < 2) return;
      kick(drums, t, 0.5);
      kick(drums, t + beat * 2.5, 0.38);
      noiseHit(drums, t + beat, 0.2, 18, 190, random);
      noiseHit(drums, t + beat * 3, 0.2, 18, 190, random);
      for (let step = 0; step < 8; step += 1) {
        const swing = step % 2 === 1 ? beat * 0.06 : 0;
        noiseHit(drums, t + (step * beat) / 2 + swing, 0.05, 60, 0, random, 0.2);
      }
    },
  },
  {
    vibe: "hype",
    bpm: 128,
    seed: 22,
    chords: [
      [57, 60, 64, 69],
      [53, 60, 65, 69],
      [48, 60, 64, 67],
      [55, 59, 62, 67],
    ],
    barsPerChord: 2,
    scale: [69, 72, 76, 79, 81, 84],
    brightness: 0.85,
    sidechain: 0.72,
    vinyl: 0,
    arrange({ music, drums, bar, t, beat, chord, song, random }) {
      for (const note of chord) pad(music, t, beat * 4, note, 0.05, song.brightness);
      for (let step = 0; step < 8; step += 1) {
        const offbeat = step % 2 === 1;
        bass(
          music,
          t + (step * beat) / 2,
          beat * 0.42,
          (chord[0] ?? 48) - (offbeat ? 12 : 24),
          0.22,
        );
        if (bar >= 4 && random() < 0.5) {
          const note = song.scale[(step * 3 + bar) % song.scale.length] ?? 72;
          pluck(music, t + (step * beat) / 2, note, 0.09, offbeat ? 0.4 : -0.4);
        }
      }
      for (let i = 0; i < 4; i += 1) {
        kick(drums, t + i * beat, 0.8);
        if (i % 2 === 1) noiseHit(drums, t + i * beat, 0.34, 16, 0, random);
        noiseHit(drums, t + i * beat + beat / 2, 0.14, 40, 0, random, 0.15);
      }
    },
  },
  {
    vibe: "cinematic",
    bpm: 72,
    seed: 33,
    chords: [
      [50, 57, 62, 65],
      [46, 53, 58, 62],
      [53, 57, 60, 65],
      [48, 55, 60, 64],
    ],
    barsPerChord: 2,
    scale: [74, 77, 79, 81, 84],
    brightness: 0.35,
    sidechain: 0,
    vinyl: 0,
    arrange({ music, drums, bar, t, beat, chord, song, random }) {
      if (bar % 2 === 0) {
        for (const note of chord) pad(music, t, beat * 8, note, 0.085, song.brightness);
        bass(music, t, beat * 7.5, (chord[0] ?? 48) - 12, 0.2);
      }
      for (let step = 0; step < 8; step += 1) {
        const note = (chord[step % chord.length] ?? 60) + 12;
        electricPiano(music, t + (step * beat) / 2, beat, note, 0.05, step % 2 ? 0.3 : -0.3);
      }
      if (bar >= 4 && random() < 0.8) {
        const note = song.scale[Math.floor(random() * song.scale.length)] ?? 72;
        electricPiano(music, t + beat * 2, beat * 4, note, 0.09, 0);
      }
      if (bar >= 2 && bar % 2 === 0) {
        kick(drums, t, 0.62);
        kick(drums, t + beat * 3.5, 0.4);
        noiseHit(drums, t + beat * 2, 0.12, 8, 120, random);
      }
    },
  },
  {
    vibe: "nostalgic",
    bpm: 96,
    seed: 44,
    chords: [
      [48, 55, 59, 64],
      [52, 55, 59, 62],
      [53, 57, 60, 64],
      [55, 59, 62, 65],
    ],
    barsPerChord: 1,
    scale: [72, 74, 76, 79, 81],
    brightness: 0.2,
    sidechain: 0.25,
    vinyl: 0.012,
    arrange({ music, drums, bar, t, beat, chord, song, random }) {
      for (const [i, note] of chord.entries()) {
        const drift = Math.sin(bar * 1.7 + i) * 0.08;
        electricPiano(music, t + i * 0.02, beat * 3, note + drift, 0.08, (i - 1.5) * 0.2);
      }
      bass(music, t, beat * 1.8, (chord[0] ?? 48) - 12, 0.2);
      bass(music, t + beat * 2, beat * 1.8, (chord[2] ?? 48) - 24, 0.16);
      for (let step = 0; step < 4; step += 1) {
        if (bar > 1 && random() < 0.5) {
          const note = song.scale[Math.floor(random() * song.scale.length)] ?? 72;
          pluck(music, t + step * beat + beat / 2, note, 0.07, random() - 0.5);
        }
      }
      if (bar < 1) return;
      kick(drums, t, 0.46);
      kick(drums, t + beat * 1.75, 0.3);
      kick(drums, t + beat * 2.5, 0.34);
      noiseHit(drums, t + beat, 0.17, 20, 170, random);
      noiseHit(drums, t + beat * 3, 0.17, 20, 170, random);
      for (let step = 0; step < 4; step += 1) noiseHit(drums, t + step * beat, 0.05, 50, 0, random);
    },
  },
];

function lowPass(bus: Bus, amount: number) {
  for (const channel of [bus.left, bus.right]) {
    let last = 0;
    for (let i = 0; i < channel.length; i += 1) {
      last += ((channel[i] ?? 0) - last) * amount;
      channel[i] = last;
    }
  }
}

function render(song: Song) {
  const beat = 60 / song.bpm;
  const barLength = beat * 4;
  const bars = Math.round(seconds / barLength);
  const length = Math.floor((bars * barLength + 1) * rate);
  const random = rng(song.seed);
  const music = new Bus(length);
  const drums = new Bus(length);

  for (let bar = 0; bar < bars; bar += 1) {
    const chordIndex = Math.floor(bar / song.barsPerChord) % song.chords.length;
    const chord = song.chords[chordIndex] ?? [];
    song.arrange({ song, music, drums, bar, t: bar * barLength, beat, chord, random });
  }

  const master = new Bus(length);
  const beatSamples = beat * rate;
  const duck = (index: number) =>
    1 - song.sidechain * Math.exp(-((index % beatSamples) / beatSamples) * 6);
  music.mixInto(master, duck);
  reverb(music, 0.5).mixInto(master, duck);
  drums.mixInto(master);
  reverb(drums, 0.12).mixInto(master);

  if (song.vinyl > 0) {
    for (let i = 0; i < length; i += 1) {
      const crackle = random() < 0.0006 ? (random() * 2 - 1) * 0.3 : 0;
      master.add(i, ((random() * 2 - 1) * song.vinyl + crackle) * 0.8);
    }
    lowPass(master, 0.55);
  }

  const fade = Math.floor(rate * 0.6);
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const gain = Math.min(1, (length - i) / fade);
    master.left[i] = (master.left[i] ?? 0) * gain;
    master.right[i] = (master.right[i] ?? 0) * gain;
    peak = Math.max(peak, Math.abs(master.left[i] ?? 0), Math.abs(master.right[i] ?? 0));
  }

  const pcm = Buffer.alloc(length * 4);
  const scale = (0.8 / peak) * 32767;
  for (let i = 0; i < length; i += 1) {
    pcm.writeInt16LE(Math.round((master.left[i] ?? 0) * scale), i * 4);
    pcm.writeInt16LE(Math.round((master.right[i] ?? 0) * scale), i * 4 + 2);
  }
  return { pcm, length: Number((length / rate).toFixed(3)) };
}

const root = new URL("../library/music/", import.meta.url).pathname;
const entries = songs.map((song) => {
  const { pcm, length } = render(song);
  const file = `${song.vibe}.m4a`;
  execFileSync(
    "ffmpeg",
    // biome-ignore format: flags read better in pairs
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(rate), "-ac", "2", "-i", "pipe:0",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", `${root}${file}`],
    { input: pcm, maxBuffer: 2 ** 30 },
  );
  return {
    file,
    licence: "CC0-1.0",
    source: "scripts/make-music.ts",
    vibe: song.vibe,
    bpm: song.bpm,
    length,
  };
});
writeFileSync(`${root}assets.json`, `${JSON.stringify(entries, null, 2)}\n`);
