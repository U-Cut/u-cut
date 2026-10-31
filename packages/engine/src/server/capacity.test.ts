import { afterEach, describe, expect, it } from "vitest";
import { measureCapacity, workersFor } from "./capacity.ts";

const gigabytes = (count: number) => count * 1024 ** 3;

describe("measureCapacity", () => {
  afterEach(() => {
    delete process.env.UCUT_RENDER_SLOTS;
  });

  it("uses three slots on a 6-core laptop with room", () => {
    expect(measureCapacity(6, gigabytes(2)).renderSlots).toBe(3);
  });

  it("backs off when memory is tight", () => {
    expect(measureCapacity(6, gigabytes(1)).renderSlots).toBe(2);
  });

  it("uses a large machine", () => {
    expect(measureCapacity(16, gigabytes(48)).renderSlots).toBe(8);
  });

  it("always keeps one slot", () => {
    expect(measureCapacity(2, gigabytes(0.2)).renderSlots).toBe(1);
  });

  it("lets the owner override the slots", () => {
    process.env.UCUT_RENDER_SLOTS = "5";
    expect(measureCapacity(6, gigabytes(1)).renderSlots).toBe(5);
  });
});

describe("workersFor", () => {
  const capacity = { renderSlots: 3, totalWorkers: 3, analysisSlots: 4 };

  it("gives one person every worker", () => {
    expect(workersFor(capacity, 1, 0)).toBe(3);
  });

  it("shares workers when a queue builds", () => {
    expect(workersFor(capacity, 2, 0)).toBe(1);
    expect(workersFor(capacity, 1, 15)).toBe(1);
  });
});
