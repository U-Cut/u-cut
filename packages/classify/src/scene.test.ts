import { describe, expect, it } from "vitest";
import {
  decodePrint,
  encodeModel,
  featuresFor,
  learnedVote,
  type SceneModel,
  sortIntoScenes,
} from "./scene.ts";

function print(hot: number): Float32Array {
  const vector = new Float32Array(4);
  vector[hot] = 1;
  return vector;
}

// Two categories, told apart by the first two print dimensions and one Vision label.
const model: SceneModel = {
  categories: ["beach", "metro"],
  visionLabels: ["ocean"],
  printSize: 4,
  printScale: 2,
  threshold: 0.6,
  weights: [
    [6, -6, 0, 0, 3, 0],
    [-6, 6, 0, 0, -3, 0],
  ],
};

describe("decodePrint", () => {
  it("reads the Float32 vector Vision produces", () => {
    const bytes = Buffer.from(new Float32Array([0.5, -0.25]).buffer).toString("base64");
    expect([...decodePrint(bytes)]).toEqual([0.5, -0.25]);
  });
});

describe("featuresFor", () => {
  it("scales the print and adds Vision label scores and a bias", () => {
    const features = featuresFor(model, { print: print(0), labels: [{ id: "ocean", score: 0.5 }] });
    expect([...features]).toEqual([2, 0, 0, 0, 0.5, 1]);
  });

  it("ignores Vision labels the model doesn't know", () => {
    const features = featuresFor(model, { print: print(1), labels: [{ id: "cat", score: 0.9 }] });
    expect(features[4]).toBe(0);
  });
});

describe("sortIntoScenes", () => {
  it("picks the likely scene", () => {
    const labels = sortIntoScenes(model, { print: print(0), labels: [] });
    expect(labels[0]?.id).toBe("beach");
    expect(labels[0]?.score).toBeGreaterThan(0.9);
  });

  it("returns at most three labels, best first", () => {
    const labels = sortIntoScenes(model, { print: print(1), labels: [] });
    expect(labels.length).toBeLessThanOrEqual(3);
    expect(labels[0]?.id).toBe("metro");
  });

  it("says other rather than guessing when it isn't sure", () => {
    const unsure = sortIntoScenes(model, { print: print(2), labels: [] });
    expect(unsure[0]?.id).toBe("other");
  });

  it("puts screenshots and documents aside", () => {
    const labels = sortIntoScenes(model, {
      print: print(0),
      labels: [{ id: "document", score: 0.9 }],
      utility: true,
    });
    expect(labels[0]?.id).toBe("documents");
  });

  it("files a selfie under People, whatever is behind it", () => {
    const labels = sortIntoScenes(model, { print: print(0), labels: [], faceArea: 0.12 });
    expect(labels[0]?.id).toBe("group");
  });

  it("keeps the scene when the person is small in the frame", () => {
    const labels = sortIntoScenes(model, { print: print(0), labels: [], faceArea: 0.01 });
    expect(labels[0]?.id).toBe("beach");
  });

  it("doesn't call a real scene a document because Vision thought it was dull", () => {
    const labels = sortIntoScenes(model, { print: print(0), labels: [], utility: true });
    expect(labels[0]?.id).toBe("beach");
  });

  it("lets a person's own correction beat the model", () => {
    const learned = [{ label: "metro", print: print(0) }];
    const labels = sortIntoScenes(model, { print: print(0), labels: [] }, learned);
    expect(labels[0]?.id).toBe("metro");
  });
});

describe("learnedVote", () => {
  it("matches only very similar photos", () => {
    const learned = [{ label: "metro", print: print(0) }];
    expect(learnedVote(print(0), learned)?.label).toBe("metro");
    expect(learnedVote(print(1), learned)).toBeUndefined();
  });

  it("does nothing with no corrections", () => {
    expect(learnedVote(print(0), [])).toBeUndefined();
  });
});

describe("encodeModel", () => {
  it("keeps a model small and restores it closely", () => {
    const decoded = encodeModel(model);
    expect(decoded.categories).toEqual(model.categories);
    expect(decoded.weights[0]?.[0]).toBeCloseTo(6, 2);
    expect(decoded.weights[1]?.[4]).toBeCloseTo(-3, 2);
  });
});
