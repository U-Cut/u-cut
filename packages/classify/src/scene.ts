/** A small linear model over Apple's on-device signals. It's trained by scripts/train-scenes.ts. */
export interface SceneModel {
  categories: string[];
  /** The Vision labels used as inputs, after the print. */
  visionLabels: string[];
  printSize: number;
  printScale: number;
  /** Below this confidence, a photo goes to Other instead of being guessed at. */
  threshold: number;
  /** One row per category: print weights, Vision label weights, then a bias. */
  weights: number[][];
}

export interface StoredModel extends Omit<SceneModel, "weights"> {
  scale: number;
  /** Int16 weights, base64 encoded, row after row. */
  data: string;
}

export interface Signals {
  print: Float32Array;
  labels: { id: string; score: number }[];
  utility?: boolean;
  /** The share of the frame taken up by the largest face. */
  faceArea?: number;
}

export interface LearnedExample {
  label: string;
  print: Float32Array;
}

export interface SceneLabel {
  id: string;
  score: number;
}

/** A face this big is a selfie or a portrait. It's about the person, not the place behind them. */
const portraitFaceArea = 0.05;
const documentLabels = new Set(["document", "screenshot", "text", "handwriting", "receipt"]);
/** Two prints this close are effectively the same scene. */
const learnedSimilarity = 0.9;

export function decodePrint(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

export function featuresFor(
  model: Pick<SceneModel, "visionLabels" | "printSize" | "printScale">,
  signals: Pick<Signals, "print" | "labels">,
): Float32Array {
  const features = new Float32Array(model.printSize + model.visionLabels.length + 1);
  for (let index = 0; index < model.printSize; index += 1) {
    features[index] = (signals.print[index] ?? 0) * model.printScale;
  }
  const scores = new Map(signals.labels.map((label) => [label.id, label.score]));
  model.visionLabels.forEach((label, index) => {
    features[model.printSize + index] = scores.get(label) ?? 0;
  });
  features[features.length - 1] = 1;
  return features;
}

function softmax(values: number[]): number[] {
  const highest = Math.max(...values);
  const exponents = values.map((value) => Math.exp(value - highest));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return exponents.map((value) => value / total);
}

export function probabilities(model: SceneModel, signals: Signals): number[] {
  const features = featuresFor(model, signals);
  return softmax(
    model.weights.map((row) =>
      row.reduce((sum, weight, index) => sum + weight * (features[index] ?? 0), 0),
    ),
  );
}

function similarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += (a[index] ?? 0) * (b[index] ?? 0);
  return dot;
}

/** Finds a correction made on a nearly identical photo. */
export function learnedVote(
  print: Float32Array,
  learned: LearnedExample[],
): LearnedExample | undefined {
  let best: LearnedExample | undefined;
  let bestScore = learnedSimilarity;
  for (const example of learned) {
    const score = similarity(print, example.print);
    if (score >= bestScore) {
      best = example;
      bestScore = score;
    }
  }
  return best;
}

export function sortIntoScenes(
  model: SceneModel,
  signals: Signals,
  learned: LearnedExample[] = [],
): SceneLabel[] {
  const corrected = learnedVote(signals.print, learned);
  if (corrected) return [{ id: corrected.label, score: 1 }];

  const isDocument =
    signals.utility === true && signals.labels.some((label) => documentLabels.has(label.id));
  if (isDocument) return [{ id: "documents", score: 1 }];
  if ((signals.faceArea ?? 0) >= portraitFaceArea) return [{ id: "group", score: 1 }];

  const ranked = probabilities(model, signals)
    .map((score, index) => ({ id: model.categories[index] ?? "other", score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((label) => ({ id: label.id, score: Number(label.score.toFixed(3)) }));
  const top = ranked[0];
  if (!top || top.score < model.threshold) {
    return [
      { id: "other", score: Number((1 - (top?.score ?? 0)).toFixed(3)) },
      ...ranked.slice(0, 2),
    ];
  }
  return ranked;
}

/** Stores weights as 16-bit integers, which keeps the model around 100 KB. */
export function packModel(model: SceneModel): StoredModel {
  const { weights, ...rest } = model;
  const largest = Math.max(...weights.flat().map(Math.abs), 1e-9);
  const scale = 32000 / largest;
  const values = new Int16Array(weights.flat().map((weight) => Math.round(weight * scale)));
  const bytes = new Uint8Array(values.buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { ...rest, scale, data: btoa(binary) };
}

export function unpackModel(stored: StoredModel): SceneModel {
  const { data, scale, ...rest } = stored;
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const values = new Int16Array(bytes.buffer);
  const columns = stored.printSize + stored.visionLabels.length + 1;
  const weights = stored.categories.map((_, row) =>
    Array.from(values.subarray(row * columns, (row + 1) * columns), (value) => value / scale),
  );
  return { ...rest, weights };
}

export const encodeModel = (model: SceneModel) => unpackModel(packModel(model));
