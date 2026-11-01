import { type DemoWord, EditPlan, type Moment, validate } from "@u-cut/schema";
import { describe, expect, it } from "vitest";
import { captionLines, findMoments, planDemo, spreadWords } from "./demo.ts";

const say = (text: string, start: number, wordLength = 0.3): DemoWord[] =>
  text.split(" ").map((word, index) => ({
    text: word,
    start: start + index * wordLength,
    end: start + (index + 1) * wordLength,
  }));

const words = [
  ...say("Welcome to our app.", 0.5),
  ...say("First press the big button.", 4),
  ...say("Now your report appears here.", 9),
];

const windows = [
  { start: 5, end: 5.3, what: ["change r1c2,r1c3"] },
  { start: 10, end: 10.4, what: ["appear r2c0,r2c1,r3c0,r3c1"] },
];

const input = { duration: 14, words, windows, grid: { cols: 4, rows: 4 } };

describe("findMoments", () => {
  it("makes one moment per spoken sentence", () => {
    const moments = findMoments(input);
    expect(moments).toHaveLength(3);
    expect(moments[1]?.quote).toBe("First press the big button.");
  });

  it("cuts the silence between sentences", () => {
    const moments = findMoments(input);
    expect(moments[0]?.out).toBeLessThan(2.2);
    expect(moments[1]?.in).toBeGreaterThan(3.5);
  });

  it("keeps a little breath around speech, inside the recording", () => {
    const moments = findMoments(input);
    expect(moments[0]?.in).toBeGreaterThanOrEqual(0);
    expect(moments[0]?.in).toBeLessThan(0.5);
    expect(moments.at(-1)?.out).toBeLessThanOrEqual(14);
  });

  it("never plays the same words twice when sentences run together", () => {
    const close = [...say("One two.", 0), ...say("Three four.", 0.7)];
    const [first, second] = findMoments({ ...input, words: close, windows: [] });
    expect(first?.out).toBeLessThanOrEqual(second?.in ?? 0);
  });

  it("aims the camera at what changed during a sentence", () => {
    const moment = findMoments(input)[1] as Moment;
    expect(moment.focus?.x).toBeCloseTo(0.75, 1);
    expect(moment.focus?.y).toBeCloseTo(0.375, 1);
    expect(moment.zoom).toBeGreaterThan(1.5);
  });

  it("doesn't zoom when the whole screen changes", () => {
    const whole = {
      ...input,
      windows: [
        {
          start: 5,
          end: 5.2,
          what: [
            "cut",
            "change r0c0,r0c1,r0c2,r0c3,r1c0,r1c1,r1c2,r1c3,r2c0,r2c1,r2c2,r2c3,r3c0,r3c1,r3c2,r3c3",
          ],
        },
      ],
    };
    expect(findMoments(whole)[1]?.zoom).toBe(1);
  });

  it("says why it picked a moment", () => {
    const [intro, action] = findMoments(input);
    expect(intro?.why).toBe("You introduce it");
    expect(action?.why).toBe("Something happens on screen as you explain it");
  });

  it("works on a silent recording, from what happens on screen", () => {
    const moments = findMoments({ ...input, words: [] });
    expect(moments).toHaveLength(2);
    expect(moments[0]?.in).toBeLessThan(5);
    expect(moments[0]?.out).toBeGreaterThan(5.3);
    expect(moments[0]?.quote).toBe("");
    expect(moments[0]?.why).toBe("Something changes on screen");
  });

  it("joins bursts of activity that run together", () => {
    const busy = [
      { start: 2, end: 2.2, what: ["change r1c1"] },
      { start: 2.8, end: 3, what: ["change r1c2"] },
    ];
    expect(findMoments({ ...input, words: [], windows: busy })).toHaveLength(1);
  });

  it("offers the whole recording when nothing can be found", () => {
    const moments = findMoments({ ...input, words: [], windows: [] });
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ in: 0, out: 14 });
  });

  it("splits a very long sentence without punctuation", () => {
    const rambling = say(Array.from({ length: 60 }, () => "word").join(" "), 0);
    const moments = findMoments({ ...input, duration: 20, words: rambling, windows: [] });
    expect(moments.length).toBeGreaterThan(1);
    for (const moment of moments) expect(moment.out - moment.in).toBeLessThan(9);
  });
});

describe("captionLines", () => {
  it("breaks speech into short lines", () => {
    const lines = captionLines(say("one two three four five six seven eight nine", 0), 5);
    expect(lines.map((line) => line.text)).toEqual([
      "one two three four five",
      "six seven eight nine",
    ]);
    expect(lines[1]?.start).toBeCloseTo(1.5);
  });

  it("breaks after the end of a sentence", () => {
    const lines = captionLines(say("Press it. Then wait here", 0), 6);
    expect(lines.map((line) => line.text)).toEqual(["Press it.", "Then wait here"]);
  });
});

describe("spreadWords", () => {
  it("shares the time evenly", () => {
    expect(spreadWords("one two", 1, 2)).toEqual([
      { text: "one", start: 1, end: 1.5 },
      { text: "two", start: 1.5, end: 2 },
    ]);
  });
});

describe("planDemo", () => {
  const brand = { name: "Acme", colour: "#7b5cff" };
  const options = {
    source: { id: "rec", w: 1920, h: 1080, sound: true },
    words,
    moments: findMoments(input),
    brand,
  };
  const music = { src: "chill.m4a", length: 60, bpm: 84 };
  const plan = planDemo({ ...options, aspect: "16:9", music });

  it("produces a plan the schema accepts", () => {
    expect(validate(EditPlan, plan, "plan")).toMatchObject({ ok: true });
  });

  it("opens and closes on a card with the name", () => {
    expect(plan.cards?.map((card) => card.title)).toEqual(["Acme", "Acme"]);
    expect(plan.cards?.[0]?.start).toBe(0);
    expect(plan.cards?.at(-1)?.end).toBe(plan.duration);
    expect(plan.shots[0]?.start).toBe(plan.cards?.[0]?.end);
  });

  it("uses only the chosen moments, in order, with no gaps", () => {
    const [first, , third] = options.moments as [Moment, Moment, Moment];
    const chosen = [{ ...first }, { ...third }];
    const short = planDemo({ ...options, moments: chosen, aspect: "16:9", music });
    expect(short.shots).toHaveLength(2);
    expect(short.shots[1]?.start).toBe(short.shots[0]?.end);
    expect(short.shots[1]?.in).toBe(third.in);
  });

  it("establishes the screen before pushing in", () => {
    const [opening, action] = plan.shots;
    expect(opening?.motion.type).toBe("none");
    expect(action?.motion.type).toBe("push-in");
    expect(action?.motion.to.scale).toBeGreaterThan(1.5);
  });

  it("keeps the recording's sound and shows the whole screen", () => {
    for (const shot of plan.shots) {
      expect(shot.keepAudio).toBe(true);
      expect(shot.fit).toBe("contain");
    }
    expect(plan.music.volume).toBeLessThan(0.3);
  });

  it("doesn't ask for sound from a recording that has none", () => {
    const silent = { ...options.source, sound: false };
    const quiet = planDemo({ ...options, source: silent, aspect: "16:9", music });
    expect(quiet.shots[0]?.keepAudio).toBeUndefined();
  });

  it("times captions to the edited reel, not the recording", () => {
    const captions = plan.texts.filter((text) => text.style === "caption");
    expect(captions.some((text) => text.text.includes("big button"))).toBe(true);
    const line = captions.find((text) => text.text.includes("First"));
    const shot = plan.shots[1];
    expect(line?.start).toBeCloseTo(shot?.start ?? 0, 0);
  });

  it("keeps a last word that runs past the end of the recording", () => {
    const [first] = options.moments as [Moment];
    const cut = { ...first, out: first.out - 0.3 };
    const late = planDemo({ ...options, moments: [cut], aspect: "16:9", music });
    expect(late.texts.map((text) => text.text).join(" ")).toContain("app.");
  });

  it("drops captions for moments left out", () => {
    const [first] = options.moments as [Moment];
    const short = planDemo({ ...options, moments: [first], aspect: "16:9", music });
    expect(JSON.stringify(short.texts)).not.toContain("report");
  });

  it("frames the action inside the screen on a tall reel", () => {
    const tall = planDemo({ ...options, aspect: "9:16", music });
    const action = tall.shots[2];
    // The wide screen fills only the middle of a tall frame, so its focus is nearer the centre.
    expect(Math.abs((action?.motion.to.y ?? 0) - 0.5)).toBeLessThan(0.2);
  });

  it("is byte-identical for the same input", () => {
    const again = planDemo({ ...options, aspect: "16:9", music });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });

  it("keeps the camera on the screen when the action is in a corner", () => {
    const corner = { in: 0, out: 3, quote: "", why: "x", focus: { x: 1, y: 1 }, zoom: 2 };
    const [first] = options.moments as [Moment];
    const framed = planDemo({ ...options, moments: [first, corner], aspect: "16:9", music });
    expect(framed.shots[1]?.motion.to).toMatchObject({ x: 0.75, y: 0.75 });
  });

  it("uses corrected words at the same moment", () => {
    const [first, second] = options.moments as [Moment, Moment];
    const fixed = { ...second, caption: "Press the bright button" };
    const edited = planDemo({ ...options, moments: [first, fixed], aspect: "16:9", music });
    expect(edited.texts.map((text) => text.text)).toContain("Press the bright button");
    expect(edited.texts.map((text) => text.text)).not.toContain("First press the big button.");
  });

  it("can leave the words out but keep the voice", () => {
    const quiet = planDemo({ ...options, captions: false, aspect: "16:9", music });
    expect(quiet.texts).toHaveLength(0);
    expect(quiet.shots[0]?.keepAudio).toBe(true);
  });

  it("explains an empty selection", () => {
    expect(() => planDemo({ ...options, moments: [], aspect: "16:9", music })).toThrow(
      "Keep at least one moment",
    );
  });
});
