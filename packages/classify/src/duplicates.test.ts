import { describe, expect, it } from "vitest";
import { duplicateOf } from "./duplicates.ts";

const vector = (...values: number[]) => new Float32Array(values);

describe("duplicateOf", () => {
  const others = [
    { id: "a", print: vector(1, 0), group: null },
    { id: "b", print: vector(0, 1), group: "g" },
  ];

  it("finds a near-identical photo", () => {
    expect(duplicateOf(vector(0.99, 0.14), others)?.id).toBe("a");
  });

  it("leaves different photos alone", () => {
    expect(duplicateOf(vector(0.7, 0.7), others)).toBeUndefined();
  });

  it("handles the first photo", () => {
    expect(duplicateOf(vector(1, 0), [])).toBeUndefined();
  });
});
