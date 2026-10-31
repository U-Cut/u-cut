import { existsSync, readFileSync } from "node:fs";
import { type StoredModel, sortIntoScenes, unpackModel } from "@u-cut/classify";
import { describe, expect, it } from "vitest";

const modelFile = new URL("../classifiers/scene-model.json", import.meta.url);
const fixtureFile = new URL("../classifiers/eval/fixture.json", import.meta.url);
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
/** The model scores 65% on places it never saw. Raise this when the model improves. */
const floor = 0.62;

interface Case {
  label: string;
  print: string;
  labels: [string, number][];
}

describe.runIf(existsSync(fixtureFile))("scene model", () => {
  const model = unpackModel(JSON.parse(readFileSync(modelFile, "utf8")) as StoredModel);
  const cases = JSON.parse(readFileSync(fixtureFile, "utf8")) as Case[];
  const guess = (entry: Case) => {
    const bytes = Buffer.from(entry.print, "base64");
    const print = Float32Array.from(
      new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length),
      (value) => value / 200,
    );
    const labels = entry.labels.map(([id, score]) => ({ id, score }));
    return sortIntoScenes({ ...model, threshold: 0 }, { print, labels })[0]?.id;
  };

  it("holds its accuracy on places it has never seen", () => {
    const held = cases.filter((entry) => core.includes(entry.label));
    const right = held.filter((entry) => guess(entry) === entry.label).length;
    expect(held.length).toBeGreaterThanOrEqual(150);
    expect(right / held.length).toBeGreaterThanOrEqual(floor);
  });
});
