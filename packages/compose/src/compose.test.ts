import type { EditPlan, MediaItem } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import {
  type ComposeInput,
  composeHtml,
  composeParts,
  gradeFilter,
  musicSegments,
} from "./index.ts";

function item(id: string, kind: "photo" | "video"): MediaItem {
  return {
    id,
    path: id,
    kind,
    w: 1080,
    h: 1920,
    orientation: 1,
    quality: { sharpness: null, exposure: null, faces: null, dupGroup: null, score: null },
    focus: null,
    labels: [],
    moment: null,
    ...(kind === "video" ? { duration: 10 } : {}),
  };
}

const plan: EditPlan = {
  schemaVersion: 1,
  template: "travel-montage",
  vibe: "hype",
  aspect: "9:16",
  fps: 30,
  seed: 1,
  duration: 4,
  music: { src: "hype.m4a", bpm: 120, start: 2, length: 60 },
  grade: { temp: 0, contrast: 0.1, sat: 0.1 },
  shots: [
    {
      media: "a",
      in: 0,
      out: 2,
      start: 0,
      end: 2,
      motion: {
        type: "push-in",
        from: { x: 0.5, y: 0.5, scale: 1 },
        to: { x: 0.6, y: 0.5, scale: 1.2 },
      },
      crop: { x: 0, y: 0, w: 1, h: 1 },
      focus: { x: 0.5, y: 0.3 },
    },
    {
      media: "b",
      in: 3,
      out: 5,
      start: 2,
      end: 4,
      motion: {
        type: "none",
        from: { x: 0.5, y: 0.5, scale: 1 },
        to: { x: 0.5, y: 0.5, scale: 1 },
      },
      crop: { x: 0, y: 0, w: 1, h: 1 },
      focus: { x: 0.5, y: 0.3 },
    },
  ],
  texts: [{ text: 'Rock & "roll" <3', start: 0.1, end: 1.9, style: "title" }],
  transitions: [{ type: "fade", at: 3.5, duration: 0.5 }],
  sfx: [],
};

const input: ComposeInput = {
  plan,
  items: { a: item("a", "photo"), b: item("b", "video") },
  templateCss: ".text-title{left:10%}",
  fontCss: "",
  assets: {
    media: (media) => `assets/${media.id}.bin`,
    music: (src) => `assets/${src}`,
  },
};

describe("composeHtml", () => {
  const html = composeHtml(input);

  it("declares the root composition at the plan's size and length", () => {
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('data-duration="4"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
    expect(html).toContain("data-no-timeline");
  });

  it("times a photo with its source and motion", () => {
    expect(html).toContain(
      '<img id="s0" class="clip shot" src="assets/a.bin" data-start="0" data-duration="2"',
    );
    expect(html).toContain("#s0{animation:s0 2s linear both;z-index:1;object-position:50% 30%}");
    expect(html).toContain("@keyframes s0{from{transform:translate(0%,0%) scale(1)}");
    expect(html).toContain("to{transform:translate(-12%,0%) scale(1.2)}");
  });

  it("trims a video and keeps it silent", () => {
    expect(html).toContain('<video id="s1" class="clip shot" src="assets/b.bin"');
    expect(html).toContain('data-media-start="3"');
    expect(html).toContain("muted playsinline");
  });

  it("escapes text", () => {
    expect(html).toContain("Rock &amp; &quot;roll&quot; &lt;3");
  });

  it("adds a fade out", () => {
    expect(html).toContain('id="fade"');
    expect(html).toContain('data-start="3.5"');
  });

  it("marks the music so beats and mixing can find it", () => {
    expect(html).toContain('id="music0"');
    expect(html).toContain('data-timeline-role="music"');
    expect(html).toContain('data-media-start="2"');
  });

  it("uses no GSAP and fetches nothing from the network", () => {
    expect(html).not.toMatch(/gsap/i);
    expect(html).not.toMatch(/https?:/);
  });

  it("sizes other aspects correctly", () => {
    const square = composeParts({ ...input, plan: { ...plan, aspect: "1:1" } });
    expect([square.width, square.height]).toEqual([1080, 1080]);
    const wide = composeParts({ ...input, plan: { ...plan, aspect: "16:9" } });
    expect([wide.width, wide.height]).toEqual([1920, 1080]);
  });

  it("sets a matched reel's words its way", () => {
    const styled = composeHtml({
      ...input,
      plan: { ...plan, textStyle: { position: "lower", case: "upper", sizePx: 96 } },
    });
    expect(styled).toContain(".text-title{top:58%");
    expect(styled).toContain("font-size:calc(96*var(--unit))");
    expect(styled).toContain("text-transform:uppercase");
  });

  it("keeps huge reel text within reason", () => {
    const styled = composeHtml({
      ...input,
      plan: { ...plan, textStyle: { position: "top", case: "sentence", sizePx: 400 } },
    });
    expect(styled).toContain("font-size:calc(150*var(--unit))");
  });

  it("names a missing media item in a plain sentence", () => {
    expect(() => composeHtml({ ...input, items: { a: item("a", "photo") } })).toThrow(
      'The plan uses media "b", which isn\'t in this project.',
    );
  });
});

describe("musicSegments", () => {
  it("plays a long track once from the plan's start", () => {
    expect(musicSegments(plan)).toEqual([{ at: 0, from: 2, length: 4 }]);
  });

  it("loops a track that is shorter than the reel", () => {
    const short = { ...plan, duration: 10, music: { ...plan.music, start: 1, length: 4 } };
    expect(musicSegments(short)).toEqual([
      { at: 0, from: 1, length: 3 },
      { at: 3, from: 0, length: 4 },
      { at: 7, from: 0, length: 3 },
    ]);
  });
});

describe("gradeFilter", () => {
  it("warms with sepia and cools with a hue shift", () => {
    expect(gradeFilter({ temp: 0.5, contrast: 0, sat: 0 })).toContain("sepia(0.3)");
    expect(gradeFilter({ temp: -0.5, contrast: 0, sat: 0 })).toContain("hue-rotate(-10deg)");
  });

  it("is empty for a neutral grade", () => {
    expect(gradeFilter({ temp: 0, contrast: 0, sat: 0 })).toBe("none");
  });
});

describe("screen recordings", () => {
  const recording = { ...item("r", "video"), w: 1920, h: 1080 };
  const shot = plan.shots[0] as EditPlan["shots"][number];
  const demo: EditPlan = {
    ...plan,
    template: "demo",
    music: { ...plan.music, volume: 0.12 },
    shots: [{ ...shot, media: "r", fit: "contain", keepAudio: true }],
    cards: [{ title: "Acme & co", start: 0, end: 1.6, colour: "#7b5cff", logo: "l" }],
  };
  const parts = () =>
    composeParts({
      plan: demo,
      items: { r: recording, l: item("l", "photo") },
      templateCss: "",
      fontCss: "",
      assets: { media: (media) => `/${media.id}`, music: (src) => src },
    });

  it("keeps the recording's sound and shows the whole screen", () => {
    const { root, css } = parts();
    expect(root).toContain('data-has-audio="true"');
    expect(root).not.toContain(" muted");
    expect(css).toContain("object-fit:contain");
  });

  it("holds the push-in before pulling back", () => {
    const { css } = parts();
    expect(css).toMatch(/@keyframes s0\{0%\{.*\}\d+(\.\d+)?%\{.*\}\d+(\.\d+)?%\{.*\}100%\{/);
  });

  it("stays wide until the action", () => {
    const [first] = demo.shots as [EditPlan["shots"][number]];
    const later = { ...demo, shots: [{ ...first, motion: { ...first.motion, at: 1 } }] };
    const { css } = composeParts({
      plan: later,
      items: { r: recording, l: item("l", "photo") },
      templateCss: "",
      fontCss: "",
      assets: { media: (media) => `/${media.id}`, music: (src) => src },
    });
    expect(css).toMatch(/@keyframes s0\{0%\{.*\}50%\{.*\}80%\{/);
  });

  it("keeps music under the voice", () => {
    expect(parts().root).toContain('data-volume="0.12"');
  });

  it("draws cards in the brand's colour, with readable ink", () => {
    const { root } = parts();
    expect(root).toContain("background:#7b5cff;color:#fff");
    expect(root).toContain("Acme &amp; co");
    expect(root).toContain('src="/l"');
  });
});

describe("written reels", () => {
  const written: EditPlan = {
    ...plan,
    template: "explainer",
    shots: [],
    backdrops: [{ start: 0, end: 4, edge: "#0f3b4c", glow: "#3aa6a0" }],
    texts: [{ text: "Slow days & Goa", start: 0.3, end: 3, style: "kinetic" }],
    voice: [{ src: "abc", at: 0.3, vol: 1, text: "Slow days & Goa", length: 2.5 }],
  };
  const parts = (omitAudio = false) =>
    composeParts({
      plan: written,
      items: {},
      templateCss: "",
      fontCss: "",
      omitAudio,
      assets: { media: () => "", music: (src) => src, voice: (src) => `/voice/${src}` },
    });

  it("lands words one at a time, keeping each until the line ends", () => {
    const { root } = parts();
    const starts = [...root.matchAll(/class="clip word" data-start="([\d.]+)"/g)].map(([, start]) =>
      Number(start),
    );
    expect(starts).toHaveLength(4);
    expect(starts[0]).toBe(0.3);
    expect(starts[1]).toBeGreaterThan(starts[0] as number);
    expect(starts[3]).toBeLessThan(3);
    expect(root).toContain("&amp;");
  });

  it("plays the voice in the render, and leaves it to the player in the preview", () => {
    expect(parts().root).toContain('id="voice0" src="/voice/abc" data-start="0.3"');
    expect(parts(true).root).not.toContain("voice0");
  });

  it("draws moving colour behind the words", () => {
    expect(parts().root).toContain("--glow:#3aa6a0");
  });
});
