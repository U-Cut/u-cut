import type { EditPlan, Vibe } from "@u-cut/schema";

type Shot = EditPlan["shots"][number];

// Where each vibe puts its sound effects. The sounds are U-Cut's own, in library/sfx, and their
// lengths are kept here so planning never has to open a file. A test checks they match.

export const soundEffects = {
  whoosh: { src: "whoosh.m4a", length: 0.7 },
  hit: { src: "hit.m4a", length: 1.2 },
  riser: { src: "riser.m4a", length: 2.4 },
  swell: { src: "swell.m4a", length: 2 },
  shutter: { src: "shutter.m4a", length: 0.35 },
  pop: { src: "pop.m4a", length: 0.18 },
} as const;

type Effect = keyof typeof soundEffects;
type Sound = EditPlan["sfx"][number];

const round = (value: number) => Math.round(value * 1000) / 1000;

interface Moments {
  duration: number;
  /** When the first shot after the hook starts. */
  hookEnd: number | undefined;
  /** When the closing shot starts. */
  closeStart: number | undefined;
  /** Every cut inside the body. */
  bodyCuts: number[];
  /** When each photo in the hook appears. */
  hookPhotos: number[];
  /** When each stop label appears. */
  stops: number[];
}

/** Each vibe's sounds: what plays, when, and how loud next to the music. */
const recipes: Record<Vibe, (moments: Moments) => [Effect, number | undefined, number][]> = {
  chill: ({ closeStart }) => [
    ["swell", 0, 0.45],
    ["whoosh", closeStart === undefined ? undefined : closeStart - 0.35, 0.3],
  ],
  hype: ({ hookEnd, closeStart, bodyCuts }) => [
    ["hit", 0, 0.7],
    ["whoosh", hookEnd === undefined ? undefined : hookEnd - 0.35, 0.55],
    // A whoosh on every fourth cut keeps the energy up without turning into noise.
    ...bodyCuts
      .filter((_, index) => index % 4 === 3)
      .map((cut): [Effect, number, number] => ["whoosh", cut - 0.35, 0.35]),
    ["riser", closeStart === undefined ? undefined : closeStart - 2.4, 0.4],
    ["hit", closeStart, 0.6],
  ],
  cinematic: ({ closeStart }) => [
    ["hit", 0, 0.75],
    ["riser", closeStart === undefined ? undefined : closeStart - 2.4, 0.45],
    ["hit", closeStart, 0.65],
  ],
  nostalgic: ({ hookPhotos, closeStart }) => [
    ...hookPhotos.map((at): [Effect, number, number] => ["shutter", at, 0.5]),
    ["shutter", closeStart, 0.45],
  ],
};

/**
 * The sound effects for a reel: a few, at its turning points, chosen by its vibe. Stop labels get
 * a soft pop. Anything that would start before the reel or run past its end is left out.
 */
export function soundsFor(
  vibe: Vibe,
  shots: Shot[],
  texts: EditPlan["texts"],
  hookCount: number,
  photos: Set<string>,
): Sound[] {
  const duration = shots.at(-1)?.end ?? 0;
  const body = shots.slice(hookCount, -1);
  const moments: Moments = {
    duration,
    hookEnd: shots.length > hookCount + 1 ? shots[hookCount]?.start : undefined,
    closeStart: shots.length > 1 ? shots.at(-1)?.start : undefined,
    bodyCuts: body.slice(1).map((shot) => shot.start),
    hookPhotos: shots
      .slice(0, hookCount)
      .filter((shot) => photos.has(shot.media))
      .map((shot) => shot.start),
    stops: texts.filter((text) => text.style === "stop").map((text) => text.start),
  };
  const wanted = [
    ...recipes[vibe](moments),
    ...moments.stops.map((at): [Effect, number, number] => ["pop", at, 0.4]),
  ];
  const seen = new Set<string>();
  return wanted
    .flatMap(([effect, at, vol]) => {
      if (at === undefined || at < 0) return [];
      const { src, length } = soundEffects[effect];
      const fits = round(Math.min(length, duration - at));
      if (fits < 0.1) return [];
      return [{ src, at: round(at), length: fits, vol }];
    })
    .filter((sound) => {
      const key = `${sound.src}@${sound.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.at - b.at || a.src.localeCompare(b.src));
}
