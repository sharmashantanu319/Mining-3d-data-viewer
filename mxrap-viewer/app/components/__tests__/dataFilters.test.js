import { describe, it, expect } from "vitest";
import {
  createRangeFilter,
  createCategoryFilter,
  getAttributeDomain,
  pointMatchesFilter,
  pointMatchesFilters,
  applyFilters,
} from "../dataFilters";

// These are deterministic unit tests of pure functions. They do not render
// anything or touch buildPointCloud/ThreeScene.

const points = [
  { id: 1, ml: -2.4, material: "ore" },
  { id: 2, ml: -0.8, material: "waste" },
  { id: 3, ml: 0.5, material: "ore" },
  { id: 4, ml: 1.9, material: "waste" },
  { id: 5, ml: 2.8, material: null },
  { id: 6 }, // no ml, no material
];

describe("createRangeFilter", () => {
  it("R1 is valid with only a min, or only a max", () => {
    expect(createRangeFilter({ input: "ml", min: 0 }).valid).toBe(true);
    expect(createRangeFilter({ input: "ml", max: 0 }).valid).toBe(true);
  });

  it("R2 is invalid with neither bound", () => {
    const filter = createRangeFilter({ input: "ml" });
    expect(filter.valid).toBe(false);
    expect(filter.errors[0].code).toBe("no-bounds");
  });

  it("R3 is invalid when min > max", () => {
    const filter = createRangeFilter({ input: "ml", min: 5, max: 1 });
    expect(filter.valid).toBe(false);
    expect(filter.errors[0].code).toBe("inverted-range");
  });

  it("R4 is invalid without an input name", () => {
    expect(createRangeFilter({ min: 0, max: 1 }).valid).toBe(false);
  });

  it("R5 resolves date bounds via parseCustomerDate", () => {
    const filter = createRangeFilter({
      input: "date",
      min: "2023-01-01",
      max: "2023-12-31",
      inputType: "date",
    });
    expect(filter.valid).toBe(true);
    expect(filter.min).toBe(Date.UTC(2023, 0, 1));
    expect(filter.max).toBe(Date.UTC(2023, 11, 31));
  });

  it("R6 is invalid when a date bound fails to parse", () => {
    const filter = createRangeFilter({ input: "date", min: "not-a-date", inputType: "date" });
    expect(filter.valid).toBe(false);
    expect(filter.errors[0].code).toBe("invalid-bound");
  });
});

describe("createCategoryFilter", () => {
  it("C1 is invalid with an empty allowedValues", () => {
    expect(createCategoryFilter({ input: "material", allowedValues: [] }).valid).toBe(false);
  });

  it("C2 is invalid without an input name", () => {
    expect(createCategoryFilter({ allowedValues: ["ore"] }).valid).toBe(false);
  });

  it("C3 compares allowed values as strings", () => {
    const filter = createCategoryFilter({ input: "grade", allowedValues: [1, 2] });
    expect(pointMatchesFilter({ grade: "1" }, filter)).toBe(true);
    expect(pointMatchesFilter({ grade: 3 }, filter)).toBe(false);
  });
});

describe("getAttributeDomain", () => {
  it("D1 finds min/max across finite values, skipping missing/non-finite ones", () => {
    const domain = getAttributeDomain(points, "ml");
    expect(domain).toEqual({ min: -2.4, max: 2.8, sampleCount: 5 });
  });

  it("D2 returns NaN bounds when no point has the attribute", () => {
    const domain = getAttributeDomain(points, "nope");
    expect(domain.sampleCount).toBe(0);
    expect(Number.isNaN(domain.min)).toBe(true);
    expect(Number.isNaN(domain.max)).toBe(true);
  });

  it("D3 handles a non-array input without throwing", () => {
    expect(getAttributeDomain(null, "ml")).toEqual({ min: NaN, max: NaN, sampleCount: 0 });
  });
});

describe("pointMatchesFilter", () => {
  it("M1 range filter passes points inside [min, max] inclusive", () => {
    const filter = createRangeFilter({ input: "ml", min: -1, max: 1 });
    expect(pointMatchesFilter({ ml: -1 }, filter)).toBe(true);
    expect(pointMatchesFilter({ ml: 1 }, filter)).toBe(true);
    expect(pointMatchesFilter({ ml: -1.01 }, filter)).toBe(false);
    expect(pointMatchesFilter({ ml: 1.01 }, filter)).toBe(false);
  });

  it("M2 excludes a missing value by default, includes it with includeMissing", () => {
    const filter = createRangeFilter({ input: "ml", min: -1, max: 1 });
    expect(pointMatchesFilter({}, filter)).toBe(false);
    const lenient = createRangeFilter({ input: "ml", min: -1, max: 1, includeMissing: true });
    expect(pointMatchesFilter({}, lenient)).toBe(true);
  });

  it("M3 an invalid or disabled filter is inert", () => {
    const invalid = createRangeFilter({ input: "ml" });
    expect(pointMatchesFilter({ ml: 999 }, invalid)).toBe(true);
    const disabled = createRangeFilter({ input: "ml", min: 0, max: 1, enabled: false });
    expect(pointMatchesFilter({ ml: 999 }, disabled)).toBe(true);
  });

  it("M4 category filter passes only allowed values, excludes missing by default", () => {
    const filter = createCategoryFilter({ input: "material", allowedValues: ["ore"] });
    expect(pointMatchesFilter({ material: "ore" }, filter)).toBe(true);
    expect(pointMatchesFilter({ material: "waste" }, filter)).toBe(false);
    expect(pointMatchesFilter({ material: null }, filter)).toBe(false);
  });
});

describe("pointMatchesFilters", () => {
  it("F1 ANDs multiple filters together", () => {
    const filters = [
      createRangeFilter({ input: "ml", min: 0, max: 10 }),
      createCategoryFilter({ input: "material", allowedValues: ["ore"] }),
    ];
    expect(pointMatchesFilters({ ml: 0.5, material: "ore" }, filters)).toBe(true);
    expect(pointMatchesFilters({ ml: 0.5, material: "waste" }, filters)).toBe(false);
    expect(pointMatchesFilters({ ml: -1, material: "ore" }, filters)).toBe(false);
  });

  it("F2 an empty or missing filter list matches everything", () => {
    expect(pointMatchesFilters({ ml: -999 }, [])).toBe(true);
    expect(pointMatchesFilters({ ml: -999 }, undefined)).toBe(true);
  });
});

describe("applyFilters", () => {
  it("A1 partitions points into included/excluded and reports counts", () => {
    const filter = createRangeFilter({ input: "ml", min: 0, max: 10 });
    const result = applyFilters(points, [filter]);
    expect(result.includedCount).toBe(3); // ids 3, 4, 5
    expect(result.excludedCount).toBe(3);
    expect(result.totalCount).toBe(6);
    expect(result.included.map((p) => p.id)).toEqual([3, 4, 5]);
  });

  it("A2 handles a non-array `points` without throwing", () => {
    const filter = createRangeFilter({ input: "ml", min: 0, max: 10 });
    const result = applyFilters(undefined, [filter]);
    expect(result).toEqual({ included: [], excluded: [], totalCount: 0, includedCount: 0, excludedCount: 0 });
  });

  it("A3 with no filters, includes every point", () => {
    const result = applyFilters(points, []);
    expect(result.includedCount).toBe(points.length);
    expect(result.excludedCount).toBe(0);
  });
});
