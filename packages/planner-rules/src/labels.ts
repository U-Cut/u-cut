import type { EditPlan, MediaItem, TemplateManifest } from "@u-cut/schema";

type Shot = EditPlan["shots"][number];

// Words a template asks for on the shots themselves, worked out from when each photo was taken.

type Overlay = EditPlan["texts"][number];
type Labels = NonNullable<TemplateManifest["labels"]>;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A shot shorter than this flashes past too quickly to read a label on. */
export const shortestLabelled = 0.8;
/** A gap this long between two photos means the next one is somewhere new. */
export const stopGapMinutes = 30;
/** How long a stop's name stays up. */
const stopLabelSeconds = 1.8;

/** "7:42 am", on the clock of the computer making the reel, which is where the photos were read. */
export function clockTime(takenAt: string): string {
  const date = new Date(takenAt);
  const hours = date.getHours();
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

function timeLabels(shots: Shot[], takenAt: (shot: Shot) => string | undefined): Overlay[] {
  return shots.flatMap((shot) => {
    const when = takenAt(shot);
    if (!when || shot.end - shot.start < shortestLabelled) return [];
    return [
      { text: clockTime(when), start: round(shot.start), end: round(shot.end), style: "stamp" },
    ];
  });
}

/** Numbers each stop of the day, starting a new one after a long gap between photos. */
function stopLabels(
  shots: Shot[],
  takenAt: (shot: Shot) => string | undefined,
  titleEnd: number,
): Overlay[] {
  const stops: Shot[][] = [];
  let last: number | undefined;
  for (const shot of shots) {
    const when = takenAt(shot);
    const time = when ? new Date(when).getTime() : undefined;
    const gap = time !== undefined && last !== undefined ? (time - last) / 60_000 : 0;
    if (stops.length === 0 || gap >= stopGapMinutes) stops.push([]);
    stops.at(-1)?.push(shot);
    if (time !== undefined) last = time;
  }
  // One stop is just the day, so there's nothing to number.
  if (stops.length < 2) return [];
  return stops.flatMap((stop, index) => {
    const first = stop[0];
    const lastShot = stop.at(-1);
    if (!first || !lastShot) return [];
    // The first stop waits for the title, so the two never sit on screen together.
    const start = index === 0 ? Math.max(first.start, titleEnd) : first.start;
    const end = Math.min(start + stopLabelSeconds, lastShot.end);
    if (end - start < shortestLabelled) return [];
    return [{ text: `Stop ${index + 1}`, start: round(start), end: round(end), style: "stop" }];
  });
}

/** The labels a template asks for, or none. */
export function shotLabels(
  labels: Labels | undefined,
  shots: Shot[],
  items: MediaItem[],
  titleEnd: number,
): Overlay[] {
  if (!labels) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const takenAt = (shot: Shot) => byId.get(shot.media)?.takenAt;
  return labels === "time" ? timeLabels(shots, takenAt) : stopLabels(shots, takenAt, titleEnd);
}
