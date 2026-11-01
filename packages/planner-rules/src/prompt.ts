import type { Aspect, ScriptLine, Vibe } from "@u-cut/schema";
import { seededRng } from "./rng.ts";

export type ReelKind = "trip" | "moment" | "topic";

/** What someone asked for, read from a sentence. Anything they didn't say is left null. */
export interface ReelRequest {
  /** Their own words, when they wrote the script rather than asking for one. */
  ownWords: string | null;
  kind: ReelKind;
  /** What it's about as they said it, such as "my Goa trip". */
  topic: string;
  /** The name to use in a line, such as "Goa". */
  subject: string;
  vibe: Vibe | null;
  aspect: Aspect | null;
  duration: number | null;
}

const shortest = 6;
const longest = 60;
const defaultLength = 20;
/** A comfortable pace for speech, and an average line. */
const wordsPerSecond = 3;
const wordsPerLine = 5.5;
const longestLine = 8;
const shortestLine = 3;
/** Past this much, someone has written the script themselves. */
const ownWordsAfter = 30;

const vibeWords: [Vibe, RegExp][] = [
  ["chill", /\b(chill|calm|relax(ed|ing)?|slow|peaceful|cos[iy]|laid[- ]back|easy)\b/i],
  ["hype", /\b(hype|hyped|energetic|fast|exciting|upbeat|high[- ]energy|fun|loud)\b/i],
  ["cinematic", /\b(cinematic|epic|dramatic|moody|film(ic)?)\b/i],
  ["nostalgic", /\b(nostalgi[ac]+|throwback|memories|retro|vintage)\b/i],
];

const tripWords =
  /\b(trip|vacation|holidays?|travels?|getaway|journey|tour|visit|honeymoon|backpacking)\b/i;
const momentWords =
  /\b(birthday|wedding|anniversary|party|graduation|festival|concert|day|weekend|week|month|year|summer|winter|spring|autumn|memories)\b/i;

const lengthPhrase =
  /\b\d+(\.\d+)?\s*-?\s*(s|secs?|seconds?|mins?|minutes?)\b|\b(half a minute|a minute|one minute)\b/gi;
const reelWords =
  /\b(reels?|videos?|clips?|shorts?|tiktoks?|stor(y|ies)|montages?|edits?|make|create|give|me|please|vibes?|style|mood|feel|tone)\b/gi;
const shapeWords =
  /\b(vertical|tall|portrait|square|wide|landscape|horizontal|widescreen|youtube|instagram)\b/gi;

function lengthIn(text: string): number | null {
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:mins?|minutes?)\b/i);
  const seconds = text.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:s|secs?|seconds?)\b/i);
  const said = minutes
    ? Number(minutes[1]) * 60
    : seconds
      ? Number(seconds[1])
      : /half a minute/i.test(text)
        ? 30
        : /\b(a|one) minute\b/i.test(text)
          ? 60
          : null;
  return said === null ? null : Math.max(shortest, Math.min(longest, Math.round(said)));
}

function vibeIn(text: string): Vibe | null {
  const found = vibeWords
    .map(([vibe, words]) => ({ vibe, at: text.search(words) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at);
  return found[0]?.vibe ?? null;
}

function shapeIn(text: string): Aspect | null {
  if (/\bsquare\b/i.test(text)) return "1:1";
  if (/\b(wide|landscape|horizontal|widescreen|youtube)\b/i.test(text)) return "16:9";
  if (/\b(vertical|tall|portrait)\b/i.test(text)) return "9:16";
  return null;
}

/** What's left of a request once the instructions are taken out. */
function topicIn(text: string): string {
  const named = text.match(/\b(?:about|on|of|for|showing|celebrating)\s+(.+)/i)?.[1] ?? text;
  const [first = ""] = named.split(/[,.;!?]|\s(?:with|using|set to|that|which|in a|in an)\s/i);
  const vibes = vibeWords.map(([, words]) => words);
  let topic = first.replace(lengthPhrase, " ").replace(shapeWords, " ").replace(reelWords, " ");
  for (const words of vibes) topic = topic.replace(new RegExp(words.source, "gi"), " ");
  return topic
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(a|an)\s+/i, "")
    .replace(/\s+(a|an|the)$/i, "");
}

function subjectOf(topic: string): string {
  const bare = topic.replace(/^(my|our|the|their|his|her)\s+/i, "");
  const going = bare.match(
    /\b(?:trip|vacation|holiday|journey|tour|visit|travels?)\s+(?:to|in|around|through)\s+(.+)/i,
  );
  const place = going?.[1] ?? bare.replace(new RegExp(`\\s+${tripWords.source}.*$`, "i"), "");
  return place.split(" ").slice(0, 3).join(" ") || bare;
}

/** Reads a sentence like "a 20-second reel about my Goa trip, chill vibe". */
export function readPrompt(text: string): ReelRequest {
  const clean = text.trim();
  const quoted = clean.match(/["“]([^"”]{8,})["”]/)?.[1] ?? null;
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const wordCount = clean.split(/\s+/).length;
  const ownWords = quoted ?? (wordCount > ownWordsAfter || sentences.length > 2 ? clean : null);
  const topic = topicIn(clean) || "this";
  return {
    ownWords,
    kind: tripWords.test(topic) ? "trip" : momentWords.test(topic) ? "moment" : "topic",
    topic,
    subject: subjectOf(topic),
    vibe: vibeIn(clean),
    aspect: shapeIn(clean),
    duration: lengthIn(clean),
  };
}

type Bank = Record<Vibe, string[]>;

const hooks: Record<ReelKind, Bank> = {
  trip: {
    chill: [
      "Slow days in {subject}.",
      "{Subject}, at an easy pace.",
      "A quiet few days in {subject}.",
    ],
    hype: ["{Subject}. Let's go.", "No plan. Just {subject}.", "{Subject} hit different."],
    cinematic: [
      "It began in {subject}.",
      "Some places stay with you.",
      "We came to {subject} for this.",
    ],
    nostalgic: [
      "Do you remember {subject}?",
      "Back to {subject}, one more time.",
      "We still talk about {subject}.",
    ],
  },
  moment: {
    chill: ["A small look at {topic}.", "Just a good day.", "Here's to {topic}."],
    hype: ["This was {topic}.", "Turn it up for {topic}.", "Nobody was ready for {topic}."],
    cinematic: ["This is {topic}.", "It all led to {topic}.", "Remember this feeling."],
    nostalgic: ["Take me back to {topic}.", "I still think about {topic}.", "Remember {topic}?"],
  },
  topic: {
    chill: ["Let's talk about {topic}.", "A quick word on {topic}."],
    hype: ["Stop scrolling. It's about {topic}.", "Here's the truth about {topic}."],
    cinematic: ["Everything changes with {topic}.", "The story of {topic}."],
    nostalgic: ["We all remember {topic}.", "Let's go back to {topic}."],
  },
};

const closes: Record<ReelKind, Bank> = {
  trip: {
    chill: ["{Subject}, we'll be back soon.", "Some days should last longer."],
    hype: ["{Subject}, you were unreal.", "Already planning the next one."],
    cinematic: ["{Subject} stays with us.", "Some places never really leave."],
    nostalgic: ["Take me back to {subject}.", "Those were the good days."],
  },
  moment: {
    chill: ["Keep days like this close.", "That was a good one."],
    hype: ["Run it back next year.", "That one goes in history."],
    cinematic: ["And that was everything.", "Nothing was the same after."],
    nostalgic: ["Those were the good days.", "I'd do it all again."],
  },
  topic: {
    chill: ["Take your time with it.", "That's really all there is."],
    hype: ["Now go and try it.", "Your turn. Don't wait."],
    cinematic: ["The rest is up to you.", "Now you know the story."],
    nostalgic: ["Some things are worth keeping.", "Pass it on to someone."],
  },
};

const fillers: Record<ReelKind, Bank> = {
  trip: {
    chill: [
      "No rush, no alarm clocks.",
      "Every street had a story.",
      "We stayed a little longer.",
      "The days just drifted by.",
      "Good light, better company.",
      "Nothing on the schedule.",
      "Just enough, and nothing more.",
    ],
    hype: [
      "Every day, something new.",
      "We said yes to everything.",
      "Sleep can wait until later.",
      "Faster, louder, better.",
      "This is what we came for.",
      "No brakes, no regrets.",
      "Best decision all year.",
    ],
    cinematic: [
      "The light changed everything.",
      "Every road led somewhere new.",
      "We stopped and just looked.",
      "It felt bigger than us.",
      "Time moved differently here.",
      "Some moments need no words.",
      "Then everything went quiet.",
    ],
    nostalgic: [
      "We were so young then.",
      "I can still hear the laughter.",
      "It feels like yesterday.",
      "Those long, golden evenings.",
      "We took it all for granted.",
      "Some things never really fade.",
      "I'd go back in a heartbeat.",
    ],
  },
  moment: {
    chill: [
      "Nothing fancy, and that was the point.",
      "Everyone we love in one place.",
      "We stayed a little longer.",
      "Good light, better company.",
      "The time just drifted by.",
      "No rush at all.",
    ],
    hype: [
      "The whole crew showed up.",
      "We said yes to everything.",
      "Nobody wanted to go home.",
      "Louder than it had any right to be.",
      "Best night all year.",
      "No brakes, no regrets.",
    ],
    cinematic: [
      "Everyone stopped for a moment.",
      "It felt bigger than us.",
      "Some moments need no words.",
      "The light changed everything.",
      "Then everything went quiet.",
      "Nobody said a thing.",
    ],
    nostalgic: [
      "It feels like yesterday.",
      "I can still hear the laughter.",
      "We were so young then.",
      "We took it all for granted.",
      "Some things never really fade.",
      "Everyone was still there.",
    ],
  },
  topic: {
    chill: [
      "It's simpler than it looks.",
      "Start with the basics.",
      "Small steps add up fast.",
      "Do one thing at a time.",
      "Then keep it going.",
      "The details make the difference.",
      "Here's what actually matters.",
    ],
    hype: [
      "Most people get this wrong.",
      "Here's what actually matters.",
      "Start today, not next week.",
      "Small steps add up fast.",
      "One thing changes everything.",
      "Do it once, then again.",
      "The details make the difference.",
    ],
    cinematic: [
      "It starts with one small thing.",
      "Most people never notice.",
      "Then it changes everything.",
      "The details make the difference.",
      "Every step leads to the next.",
      "It takes time, and it's worth it.",
      "Nothing happens all at once.",
    ],
    nostalgic: [
      "We used to do this differently.",
      "It starts with something simple.",
      "The old way still works.",
      "Small things stay with you.",
      "The details make the difference.",
      "It takes time, and it's worth it.",
      "Some lessons never get old.",
    ],
  },
};

const sceneFrames: Bank = {
  chill: [
    "All about {thing}.",
    "Nothing but {thing}.",
    "Time slowed down for {thing}.",
    "Easy days and {thing}.",
    "We found {thing}.",
  ],
  hype: [
    "{Thing}, all day.",
    "Straight to {thing}.",
    "{Thing} on repeat.",
    "Then {thing}. No brakes.",
  ],
  cinematic: [
    "And then, {thing}.",
    "We kept chasing {thing}.",
    "{Thing}, as the light changed.",
    "Nothing prepares you for {thing}.",
  ],
  nostalgic: [
    "I still think about {thing}.",
    "Remember {thing}?",
    "{Thing}, just like we remembered.",
    "We had {thing}, back then.",
  ],
};

/** How each scene reads in a sentence. */
const sceneWords: Record<string, string> = {
  cafe: "slow coffee",
  restaurant: "long dinners",
  food: "good food",
  home: "home",
  office: "the daily work",
  gym: "early workouts",
  mountains: "the mountains",
  beach: "the beach",
  lake: "still water",
  forest: "quiet trees",
  desert: "open sand",
  snow: "fresh snow",
  "city-street": "city streets",
  "night-city": "city lights",
  market: "busy markets",
  temple: "old temples",
  museum: "quiet museums",
  flight: "window seats",
  "railway-station": "station platforms",
  train: "long train rides",
  metro: "the metro",
  "road-trip": "open roads",
  bike: "two wheels",
  group: "good people",
  pets: "good company",
  sky: "big skies",
  event: "loud nights",
};

const speeds: Record<Vibe, number> = { chill: 0.95, hype: 1.1, cinematic: 0.9, nostalgic: 0.92 };

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

function fill(template: string, values: Record<string, string>): string {
  const filled = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name.toLowerCase()] ?? "";
    return name.charAt(0) === name.charAt(0).toUpperCase() ? capital(value) : value;
  });
  return capital(filled);
}

/** Hooks are punchy and closes settle, so each line gets its own pace. */
function speedFor(vibe: Vibe, index: number, count: number): number {
  const base = speeds[vibe];
  if (index === count - 1) return Math.round(base * 92) / 100;
  return index === 0 ? Math.round(base * 104) / 100 : base;
}

/** Breaks someone's own writing into lines of three to eight words, at natural pauses. */
export function splitIntoLines(text: string): string[] {
  const lines: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    let words = sentence.trim().split(/\s+/).filter(Boolean);
    while (words.length > longestLine) {
      const pause = words
        .slice(shortestLine - 1, longestLine)
        .findLastIndex((word) => /[,;:]$/.test(word));
      let take = pause >= 0 ? pause + shortestLine : Math.min(6, longestLine);
      if (words.length - take < shortestLine) take = words.length - shortestLine;
      lines.push(words.slice(0, take).join(" "));
      words = words.slice(take);
    }
    if (words.length > 0) lines.push(words.join(" "));
  }
  // A stray word or two joins its neighbour where the line stays short enough.
  return lines.reduce<string[]>((joined, line) => {
    const previous = joined.at(-1);
    const words = line.split(" ").length;
    const room = previous ? previous.split(" ").length + words <= longestLine : false;
    if (previous && room && words < shortestLine) joined[joined.length - 1] = `${previous} ${line}`;
    else joined.push(line);
    return joined;
  }, []);
}

export interface ScriptInput {
  request: ReelRequest;
  /** The scenes in someone's media, in the order the reel should reach them. */
  scenes: string[];
  vibe: Vibe;
  duration: number;
  seed: number;
}

/** Writes a reel's script from fixed patterns, or sets out the words someone wrote themselves. */
export function writeScript(input: ScriptInput): ScriptLine[] {
  const { request, scenes, vibe, seed } = input;
  const rng = seededRng(seed);
  const draw = (bank: string[]) => {
    const index = Math.floor(rng() * bank.length);
    return bank.splice(index, 1)[0] ?? bank[0] ?? "";
  };
  const line = (text: string, scene: string | null, index: number, count: number): ScriptLine => ({
    text,
    scene,
    speed: speedFor(vibe, index, count),
    voice: null,
  });

  if (request.ownWords) {
    const lines = splitIntoLines(request.ownWords);
    return lines.map((text, index) => line(text, null, index, lines.length));
  }

  const { kind } = request;
  const values = { topic: request.topic, subject: request.subject };
  const frames = [...sceneFrames[vibe]];
  const spare = [...fillers[kind][vibe]];
  const known =
    kind === "topic" ? [] : scenes.filter((scene) => sceneWords[scene]).slice(0, frames.length);
  // Every line is different, so a long reel gets longer pauses rather than repeats.
  const wanted = (input.duration * wordsPerSecond * speeds[vibe]) / wordsPerLine;
  const count = Math.max(3, Math.min(2 + known.length + spare.length, Math.round(wanted)));

  const body = Array.from({ length: count - 2 }, (_, index) => {
    const scene = known[index];
    if (!scene) return { text: draw(spare), scene: null };
    return { text: fill(draw(frames), { ...values, thing: sceneWords[scene] ?? "" }), scene };
  });

  return [
    { text: fill(draw([...hooks[kind][vibe]]), values), scene: null },
    ...body,
    { text: fill(draw([...closes[kind][vibe]]), values), scene: null },
  ].map((entry, index) => line(entry.text, entry.scene, index, count));
}

export const defaultReelLength = defaultLength;
export const longestReel = longest;
