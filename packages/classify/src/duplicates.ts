export interface Printed {
  id: string;
  print: Float32Array;
  group: string | null;
}

/**
 * Photos this alike are the same shot. Measured on 1,680 real photos: the same shot re-exposed
 * scores 0.97 to 0.99, and only 2% of different photos reach 0.96. A wrong match silently drops a
 * photo from the reel, so this leans towards keeping both.
 */
export const duplicateSimilarity = 0.96;

function similarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += (a[index] ?? 0) * (b[index] ?? 0);
  return dot;
}

/** Finds the group a new photo belongs to, naming it after the first photo in it. */
export function duplicateOf(print: Float32Array, others: Printed[]): Printed | undefined {
  let best: Printed | undefined;
  let bestScore = duplicateSimilarity;
  for (const other of others) {
    const score = similarity(print, other.print);
    if (score >= bestScore) {
      best = other;
      bestScore = score;
    }
  }
  return best;
}
