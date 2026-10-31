import type { MediaItem } from "@u-cut/schema";

const momentGapMinutes = 45;
const momentGapKm = 2;

function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = radians(b.lat - a.lat);
  const longitude = radians(b.lon - a.lon);
  const haversine =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(haversine));
}

const moment = (index: number) => `m-${String(index).padStart(4, "0")}`;

/** A trip or a day out: a new moment starts after a long gap in time or a jump in place. */
export function groupMoments(items: MediaItem[]): MediaItem[] {
  const dated = items
    .filter((item) => item.takenAt)
    .sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.id.localeCompare(b.id));
  const undated = items.filter((item) => !item.takenAt).sort((a, b) => a.id.localeCompare(b.id));

  let index = 0;
  const grouped = dated.map((item, position) => {
    const previous = dated[position - 1];
    const minutes = previous
      ? (Date.parse(item.takenAt ?? "") - Date.parse(previous.takenAt ?? "")) / 60_000
      : Number.POSITIVE_INFINITY;
    const moved =
      previous?.gps && item.gps ? kmBetween(previous.gps, item.gps) > momentGapKm : false;
    if (minutes > momentGapMinutes || moved) index += 1;
    return { ...item, moment: moment(index) };
  });
  if (undated.length > 0) index += 1;
  return [...grouped, ...undated.map((item) => ({ ...item, moment: moment(index) }))];
}
