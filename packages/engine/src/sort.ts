import { decodePrint, duplicateOf, groupMoments, type Printed } from "@u-cut/classify";
import type { MediaItem } from "@u-cut/schema";
import { applySignals, firstPrint, loadLearned, readSignals } from "./analyse.ts";
import { deriveForSorting } from "./derive.ts";
import { vision } from "./vision.ts";

const atOnce = 4;

/**
 * Sorts a pile of media into scenes and moments. Without Apple's on-device helper, such as on
 * Linux, media still gets its moments and everything else carries on unsorted.
 */
export async function sortMedia(
  items: MediaItem[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<MediaItem[]> {
  if (!vision()) return groupMoments(items);
  const learned = await loadLearned();
  const queue = [...items];
  const sorted = new Map<string, MediaItem>();
  const prints: Printed[] = [];
  let done = 0;

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      let result = item;
      try {
        await deriveForSorting(item);
        const frames = await readSignals(item);
        if (frames) {
          result = applySignals(item, frames, learned);
          const print = firstPrint(frames);
          if (print) prints.push({ id: item.id, print: decodePrint(print), group: null });
        }
      } catch {
        // A file that can't be analysed still belongs in the reel, just unsorted.
      }
      sorted.set(item.id, result);
      done += 1;
      onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: atOnce }, worker));

  // Comparing in a fixed order keeps the plan identical however the workers finished.
  const ordered = [...prints].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((entry, index) => {
    const match = duplicateOf(entry.print, ordered.slice(0, index));
    if (!match) return;
    match.group = match.group ?? match.id;
    entry.group = match.group;
  });
  for (const { id, group } of ordered) {
    const item = sorted.get(id);
    if (item && group) sorted.set(id, { ...item, quality: { ...item.quality, dupGroup: group } });
  }
  return groupMoments([...sorted.values()]);
}
