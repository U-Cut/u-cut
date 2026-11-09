import type { EditPlan, MediaItem } from "@u-cut/schema";
import { clockTime, shortestLabelled } from "./labels.ts";
import { PlanError } from "./plan.ts";

const titleStart = 0.12;
const titleEnd = 2.4;
const round = (value: number) => Math.round(value * 1000) / 1000;

/** Small edits keep the cut exactly as it is, so they never disturb what someone likes. */
export function setTitle(plan: EditPlan, title: string): EditPlan {
  const text = title.trim();
  const others = plan.texts.filter((entry) => entry.style !== "title");
  if (!text) return { ...plan, texts: others };
  const current = plan.texts.find((entry) => entry.style === "title");
  const entry = current ?? {
    start: titleStart,
    end: round(Math.min(titleEnd, plan.duration - 0.1)),
    style: "title",
  };
  return { ...plan, texts: [{ ...entry, text }, ...others] };
}

function cutFrom(shot: EditPlan["shots"][number], item: MediaItem): EditPlan["shots"][number] {
  const length = round(shot.end - shot.start);
  const focus = item.focus ?? { x: 0.5, y: 0.5 };
  if (item.kind === "photo") return { ...shot, media: item.id, in: 0, out: length, focus };
  const available = item.duration ?? 0;
  if (available < length) {
    throw new PlanError("That clip is shorter than this shot. Pick a photo or a longer clip.");
  }
  const clipIn = round((available - length) / 2);
  return { ...shot, media: item.id, in: clipIn, out: round(clipIn + length), focus };
}

/** A shot's time stamp follows its photo, so a swapped or replaced shot shows its own time. */
function restamp(plan: EditPlan, index: number, item: MediaItem): EditPlan {
  const shot = plan.shots[index];
  if (!shot || !plan.texts.some((text) => text.style === "stamp")) return plan;
  const others = plan.texts.filter(
    (text) => !(text.style === "stamp" && text.start === shot.start),
  );
  const stamp =
    item.takenAt && shot.end - shot.start >= shortestLabelled
      ? [{ text: clockTime(item.takenAt), start: shot.start, end: shot.end, style: "stamp" }]
      : [];
  return { ...plan, texts: [...others, ...stamp] };
}

export function replaceShot(plan: EditPlan, index: number, item: MediaItem): EditPlan {
  const shots = plan.shots.map((shot, position) =>
    position === index ? cutFrom(shot, item) : shot,
  );
  return restamp({ ...plan, shots }, index, item);
}

export function swapShots(
  plan: EditPlan,
  first: number,
  second: number,
  items: Record<string, MediaItem>,
): EditPlan {
  const a = plan.shots[first];
  const b = plan.shots[second];
  if (first === second || !a || !b) return plan;
  const itemA = items[a.media];
  const itemB = items[b.media];
  if (!itemA || !itemB) return plan;
  const shots = plan.shots.map((shot, position) => {
    if (position === first) return cutFrom(shot, itemB);
    if (position === second) return cutFrom(shot, itemA);
    return shot;
  });
  return restamp(restamp({ ...plan, shots }, first, itemB), second, itemA);
}
