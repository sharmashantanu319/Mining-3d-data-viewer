import { describe, expect, it } from "vitest";
import { axisFraction, computeTicks, formatTick, padDegenerateRange } from "../chartScale";

describe("axisFraction", () => {
  it("places a linear value between 0 and 1", () => {
    expect(axisFraction(5, { min: 0, max: 10 }, "linear")).toBe(0.5);
    expect(axisFraction(0, { min: 0, max: 10 }, "datetime")).toBe(0);
  });

  it("places a log10 value by decade", () => {
    expect(axisFraction(10, { min: 1, max: 100 }, "log10")).toBeCloseTo(0.5);
  });

  it("returns null for values the axis cannot place", () => {
    expect(axisFraction(0, { min: 1, max: 100 }, "log10")).toBeNull();
    expect(axisFraction(5, { min: 3, max: 3 }, "linear")).toBeNull();
    expect(axisFraction(NaN, { min: 0, max: 1 }, "linear")).toBeNull();
    expect(axisFraction(1, null, "linear")).toBeNull();
  });
});

describe("padDegenerateRange", () => {
  it("widens a flat range and leaves a normal one alone", () => {
    expect(padDegenerateRange({ min: 4, max: 4 })).toEqual({ min: 3.8, max: 4.2 });
    expect(padDegenerateRange({ min: 0, max: 0 })).toEqual({ min: -1, max: 1 });
    expect(padDegenerateRange({ min: 1, max: 2 })).toEqual({ min: 1, max: 2 });
    expect(padDegenerateRange(null)).toBeNull();
  });
});

describe("computeTicks", () => {
  it("picks round linear steps inside the range", () => {
    expect(computeTicks({ min: 0, max: 100 }, "linear", 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("puts log10 ticks on powers of ten", () => {
    expect(computeTicks({ min: 1, max: 10000 }, "log10")).toEqual([1, 10, 100, 1000, 10000]);
    expect(computeTicks({ min: 0, max: 100 }, "log10")).toEqual([]);
  });

  it("puts datetime ticks on whole-day boundaries for a multi-week range", () => {
    const start = Date.UTC(2023, 4, 1);
    const ticks = computeTicks({ min: start, max: start + 31 * 86_400_000 }, "datetime", 6);
    expect(ticks.length).toBeGreaterThan(2);
    for (const tick of ticks) expect(tick % 86_400_000).toBe(0);
  });

  it("returns nothing for an empty range", () => {
    expect(computeTicks({ min: 1, max: 1 }, "linear")).toEqual([]);
    expect(computeTicks(null, "linear")).toEqual([]);
  });
});

describe("formatTick", () => {
  it("formats datetimes as a date, or with the time for sub-day steps", () => {
    const value = Date.UTC(2023, 4, 19, 6, 30);
    expect(formatTick(value, "datetime", 86_400_000)).toBe("2023-05-19");
    expect(formatTick(value, "datetime", 3_600_000)).toBe("05-19 06:30");
  });

  it("keeps enough precision for fractional steps", () => {
    expect(formatTick(0.15, "linear", 0.05)).toBe("0.15");
    expect(formatTick(-1.5, "linear", 0.5)).toBe("-1.5");
    expect(formatTick(400, "linear", 100)).toBe("400");
  });
});
