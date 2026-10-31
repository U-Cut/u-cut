// Trains the scene model from on-device signals, and measures it on places it has never seen.
//
//   pnpm exec tsx scripts/eval-fetch.ts <folder>
//   find <folder> -name '*.jpg' | apps/mac/.build/release/ucut-vision analyze > <folder>/signals.jsonl
//   pnpm train:scenes <folder>/signals.jsonl
import { readFileSync, writeFileSync } from "node:fs";
import { decodePrint, featuresFor, packModel, type SceneModel } from "@u-cut/classify";

interface Entry {
  title: string;
  label: string;
  from: string;
  licence: string;
}

interface Signal {
  path: string;
  print?: string;
  labels?: { id: string; score: number }[];
  error?: string;
}

interface Example {
  label: string;
  source: string;
  print: Float32Array;
  labels: { id: string; score: number }[];
}

const core = [
  "cafe",
  "mountains",
  "home",
  "flight",
  "railway-station",
  "metro",
  "beach",
  "city-street",
  "food",
  "night-city",
];
const heldOutShare = 0.2;
const vocabulary = 400;
const printScale = 12;
const root = new URL("../classifiers/", import.meta.url);

function hash(text: string, seed = 7) {
  let value = seed;
  for (const char of text) value = (Math.imul(value, 131) + (char.codePointAt(0) ?? 0)) >>> 0;
  return value;
}

function fileName(title: string) {
  let value = 0;
  for (const char of title) value = (Math.imul(value, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  return `${value.toString(16)}.jpg`;
}

function load(path: string): Example[] {
  const manifest = JSON.parse(readFileSync(new URL("eval/manifest.json", root), "utf8")) as Entry[];
  const entries = new Map(
    manifest.map((entry) => [`${entry.label}/${fileName(entry.title)}`, entry]),
  );
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .flatMap((line) => {
      const signal = JSON.parse(line) as Signal;
      const entry = entries.get(signal.path.split("/").slice(-2).join("/"));
      if (!entry || !signal.print) return [];
      return [
        {
          label: entry.label,
          source: entry.from,
          print: decodePrint(signal.print),
          labels: signal.labels ?? [],
        },
      ];
    });
}

/** Keeps whole sources out of training, so a place is never in both sets. */
function splitBySource(examples: Example[], seed: number, share: number) {
  const held = new Set<string>();
  for (const category of new Set(examples.map((example) => example.label))) {
    const inCategory = examples.filter((example) => example.label === category);
    const sources = [...new Set(inCategory.map((example) => example.source))].sort(
      (a, b) => hash(a, seed) - hash(b, seed),
    );
    let taken = 0;
    for (const source of sources) {
      if (taken >= inCategory.length * share) break;
      held.add(`${category}|${source}`);
      taken += inCategory.filter((example) => example.source === source).length;
    }
  }
  const isHeld = (example: Example) => held.has(`${example.label}|${example.source}`);
  return { train: examples.filter((e) => !isHeld(e)), test: examples.filter(isHeld) };
}

function chooseLabels(examples: Example[]): string[] {
  const seen = new Map<string, number>();
  for (const example of examples) {
    for (const label of example.labels) seen.set(label.id, (seen.get(label.id) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, vocabulary)
    .map(([id]) => id);
}

interface Options {
  decay: number;
  epochs: number;
}

/** Softmax regression trained with Adam. */
function train(
  examples: Example[],
  categories: string[],
  visionLabels: string[],
  options: Options,
): SceneModel {
  const shape = { visionLabels, printSize: 768, printScale };
  const inputs = examples.map((example) => featuresFor(shape, example));
  const targets = examples.map((example) => categories.indexOf(example.label));
  const columns = inputs[0]?.length ?? 0;
  const rows = categories.length;
  const size = rows * columns;
  const weights = new Float64Array(size);
  const gradient = new Float64Array(size);
  const first = new Float64Array(size);
  const second = new Float64Array(size);
  const logits = new Float64Array(rows);
  const rate = 0.06;

  for (let epoch = 1; epoch <= options.epochs; epoch += 1) {
    gradient.fill(0);
    for (let sample = 0; sample < inputs.length; sample += 1) {
      const x = inputs[sample] as Float32Array;
      let highest = Number.NEGATIVE_INFINITY;
      for (let row = 0; row < rows; row += 1) {
        let sum = 0;
        const offset = row * columns;
        for (let column = 0; column < columns; column += 1) {
          sum += (weights[offset + column] as number) * (x[column] as number);
        }
        logits[row] = sum;
        if (sum > highest) highest = sum;
      }
      let total = 0;
      for (let row = 0; row < rows; row += 1) {
        const value = Math.exp((logits[row] as number) - highest);
        logits[row] = value;
        total += value;
      }
      for (let row = 0; row < rows; row += 1) {
        const error = (logits[row] as number) / total - (row === targets[sample] ? 1 : 0);
        const offset = row * columns;
        for (let column = 0; column < columns; column += 1) {
          gradient[offset + column] =
            (gradient[offset + column] as number) + error * (x[column] as number);
        }
      }
    }
    for (let index = 0; index < size; index += 1) {
      const step =
        (gradient[index] as number) / inputs.length + options.decay * (weights[index] as number);
      first[index] = 0.9 * (first[index] as number) + 0.1 * step;
      second[index] = 0.999 * (second[index] as number) + 0.001 * step * step;
      const unbiasedFirst = (first[index] as number) / (1 - 0.9 ** epoch);
      const unbiasedSecond = (second[index] as number) / (1 - 0.999 ** epoch);
      weights[index] =
        (weights[index] as number) - (rate * unbiasedFirst) / (Math.sqrt(unbiasedSecond) + 1e-8);
    }
  }

  return {
    categories,
    visionLabels,
    printSize: 768,
    printScale,
    threshold: 0,
    weights: categories.map((_, row) =>
      Array.from(weights.subarray(row * columns, (row + 1) * columns)),
    ),
  };
}

function predict(model: SceneModel, example: Example): { id: string; score: number } {
  const x = featuresFor(model, example);
  const logits = model.weights.map((row) =>
    row.reduce((sum, weight, index) => sum + weight * (x[index] ?? 0), 0),
  );
  const highest = Math.max(...logits);
  const values = logits.map((value) => Math.exp(value - highest));
  const total = values.reduce((sum, value) => sum + value, 0);
  const best = values.indexOf(Math.max(...values));
  return { id: model.categories[best] ?? "other", score: (values[best] ?? 0) / total };
}

function accuracy(model: SceneModel, examples: Example[]) {
  const coreExamples = examples.filter((example) => core.includes(example.label));
  const hits = coreExamples.filter(
    (example) => predict(model, example).id === example.label,
  ).length;
  return hits / Math.max(coreExamples.length, 1);
}

const signalsPath = process.argv[2];
if (!signalsPath) throw new Error("Say where signals.jsonl is.");
const examples = load(signalsPath);
const categories = [...new Set(examples.map((example) => example.label))].sort();
const { train: trainingSet, test: heldOut } = splitBySource(examples, 7, heldOutShare);
console.log(
  `${examples.length} photos: ${trainingSet.length} to train on, ${heldOut.length} held out.`,
);

// Settings are chosen on the training places only, so the held-out score stays honest.
const visionLabels = chooseLabels(trainingSet);
let bestDecay = 0;
let bestScore = -1;
for (const decay of [3e-4, 1e-3, 3e-3]) {
  let total = 0;
  for (const seed of [11, 23]) {
    const inner = splitBySource(trainingSet, seed, 0.25);
    total += accuracy(
      train(inner.train, categories, visionLabels, { decay, epochs: 140 }),
      inner.test,
    );
  }
  console.log(`  decay ${decay}: ${((total / 2) * 100).toFixed(1)}% on unseen training places`);
  if (total > bestScore) {
    bestScore = total;
    bestDecay = decay;
  }
}

const model = train(trainingSet, categories, visionLabels, { decay: bestDecay, epochs: 260 });

// Set by checking real phone photos, where the best guess among 27 scenes is often right at 0.3.
// A higher value sent most of a real camera roll to Other.
const threshold = 0.3;
model.threshold = threshold;

const lines: string[] = [];
const report = (line: string) => {
  console.log(line);
  lines.push(line);
};

function row(name: string, items: Example[]) {
  const results = items.map((example) => ({ example, guess: predict(model, example) }));
  const right = results.filter(({ example, guess }) => guess.id === example.label).length;
  const sure = results.filter(({ guess }) => guess.score >= threshold);
  const sureRight = sure.filter(({ example, guess }) => guess.id === example.label).length;
  const percent = (value: number, of: number) => `${((value / Math.max(of, 1)) * 100).toFixed(0)}%`;
  report(
    `| ${name} | ${items.length} | ${percent(right, items.length)} | ${percent(sure.length, items.length)} | ${percent(sureRight, sure.length)} |`,
  );
}

report("# Scene model report");
report("");
report(
  `Measured on ${heldOut.length} photos from places the model never saw in training. Generated by \`pnpm train:scenes\`.`,
);
report("");
report(
  "| Category | Photos | Top-1 accuracy | Answered (rest go to Other) | Accuracy when answered |",
);
report("| --- | --- | --- | --- | --- |");
const heldCore = heldOut.filter((example) => core.includes(example.label));
row("**10 core categories**", heldCore);
for (const category of core)
  row(
    category,
    heldOut.filter((example) => example.label === category),
  );
row("All categories", heldOut);
writeFileSync(new URL("eval/report.md", root), `${lines.join("\n")}\n`);

const confusion = new Map<string, number>();
for (const example of heldCore) {
  const guess = predict(model, example).id;
  if (guess !== example.label) {
    const key = `${example.label} -> ${guess}`;
    confusion.set(key, (confusion.get(key) ?? 0) + 1);
  }
}
console.log(
  [...confusion]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", "),
);

writeFileSync(new URL("scene-model.json", root), `${JSON.stringify(packModel(model))}\n`);

// The held-out photos, reduced to their signals, so CI can re-measure without downloading anything.
const known = new Set(visionLabels);
const fixture = heldOut.map((example) => ({
  label: example.label,
  print: Buffer.from(
    Int8Array.from(example.print, (value) => Math.round(value * 200)).buffer,
  ).toString("base64"),
  labels: example.labels
    .filter((label) => known.has(label.id))
    .map((label) => [label.id, label.score]),
}));
writeFileSync(new URL("eval/fixture.json", root), `${JSON.stringify(fixture)}\n`);
