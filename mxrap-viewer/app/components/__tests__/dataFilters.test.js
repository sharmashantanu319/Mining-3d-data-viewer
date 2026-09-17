import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import Papa from "papaparse";
import {
  createRangeFilter,
  createCategoryFilter,
  getAttributeDomain,
  pointMatchesFilter,
  pointMatchesFilters,
  applyFilters,
  applyFiltersWithStats,
  applyNullVisibility,
  inferFilterFields,
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

describe("applyFiltersWithStats", () => {
  it("reports visible rows, source indices, missing, invalid, and mismatches", () => {
    const rows = [
      { value: 2 },
      { value: null },
      { value: Number.NaN },
      { value: 20 },
    ];
    const filter = createRangeFilter({ input: "value", min: 0, max: 10 });
    const result = applyFiltersWithStats(rows, [filter]);

    expect(result.included).toEqual([rows[0]]);
    expect(result.sourceIndices).toEqual([0]);
    expect(result).toMatchObject({
      totalCount: 4,
      visibleCount: 1,
      missingCount: 1,
      invalidCount: 1,
      mismatchCount: 1,
    });
  });

  it("uses invalid over missing precedence independently of filter order", () => {
    const row = { value: null, date: "bad" };
    const missing = createRangeFilter({ input: "value", min: 0 });
    const invalid = createRangeFilter({ input: "date", min: "2023-01-01", inputType: "date" });

    const first = applyFiltersWithStats([row], [missing, invalid]);
    const second = applyFiltersWithStats([row], [invalid, missing]);
    expect(first).toEqual(second);
    expect(first.invalidCount).toBe(1);
    expect(first.missingCount).toBe(0);
  });

  it("keeps all source indices when no filters are active", () => {
    const result = applyFiltersWithStats(points, []);
    expect(result.visibleCount).toBe(points.length);
    expect(result.sourceIndices).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("applyNullVisibility", () => {
  it("removes null marker values and preserves matching source indices", () => {
    const rows = [{ ml: 1 }, { ml: null }, { ml: 3 }, {}];
    const filtered = applyFiltersWithStats(rows, []);
    const result = applyNullVisibility(filtered, "ml", false);

    expect(result.included).toEqual([rows[0], rows[2]]);
    expect(result.sourceIndices).toEqual([0, 2]);
    expect(result.visibleCount).toBe(2);
    expect(result.missingCount).toBe(2);
  });

  it("returns the existing result when null values are visible", () => {
    const result = applyFiltersWithStats(points, []);
    expect(applyNullVisibility(result, "ml", true)).toBe(result);
  });
});

describe("inferFilterFields", () => {
  it("infers numeric, date, and compact categorical attributes", () => {
    const rows = [
      { id: 1, x: 1, grade: 2, DateTime: "2023-01-01", material: "ore" },
      { id: 2, x: 2, grade: 5, DateTime: "2023-01-02", material: "waste" },
      { id: 3, x: 3, grade: null, DateTime: "bad", material: "ore" },
    ];
    const fields = inferFilterFields(rows);

    expect(fields.find((field) => field.input === "x")).toBeUndefined();
    expect(fields.find((field) => field.input === "id")).toBeUndefined();
    expect(fields.find((field) => field.input === "grade")).toMatchObject({
      kind: "range",
      inputType: "number",
      min: 2,
      max: 5,
      missingCount: 1,
    });
    expect(fields.find((field) => field.input === "DateTime")).toMatchObject({
      kind: "range",
      inputType: "date",
      invalidCount: 1,
    });
    expect(fields.find((field) => field.input === "material")).toMatchObject({
      kind: "category",
      values: ["ore", "waste"],
    });
  });

  it("does not offer high-cardinality text as a category filter", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({ label: `item-${index}` }));
    expect(inferFilterFields(rows)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The synthetic tests above check the filter logic in isolation. These
// exercise the same functions against real course data (the seismic events
// and sensors tables from the visualiser-export-2 demo export), so the
// distributions, attribute names, and CSV quirks (e.g. a multi-line quoted
// header) are the real ones rather than hand-picked values.

describe("dataFilters (real event/sensor data from visualiser-export-2)", () => {
  let events;
  let sensors;

  beforeAll(async () => {
    const zipPath = fileURLToPath(
      new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
    );
    const zip = await JSZip.loadAsync(readFileSync(zipPath));

    const parseCsv = async (path) => {
      const text = await zip.file(path).async("text");
      return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
    };

    events = await parseCsv("data/s1-events.csv");
    sensors = await parseCsv("data/s1-sensors.csv");
  });

  it("computes the ML domain across all 5,903 seismic events", () => {
    expect(getAttributeDomain(events, "ML")).toEqual({ min: -2.41, max: 2.8, sampleCount: 5903 });
  });

  it("filters events by the report's own ML >= -1 threshold", () => {
    // The demo export's mag-time-chart footer describes an "AboveThreshold"
    // series as events with M_L >= -1; this checks the same split.
    const filter = createRangeFilter({ input: "ML", min: -1 });
    const result = applyFilters(events, [filter]);
    expect(result.totalCount).toBe(5903);
    expect(result.includedCount).toBe(678);
    expect(result.excludedCount).toBe(5225);
  });

  it("filters sensors by a real categorical attribute (Configuration)", () => {
    const filter = createCategoryFilter({ input: "Configuration", allowedValues: [1] });
    const result = applyFilters(sensors, [filter]);
    expect(result.totalCount).toBe(71);
    expect(result.includedCount).toBe(45);
  });

  it("ANDs two real categorical filters together (Configuration + Type)", () => {
    const filters = [
      createCategoryFilter({ input: "Configuration", allowedValues: [1] }),
      createCategoryFilter({ input: "Type", allowedValues: ["G"] }),
    ];
    const result = applyFilters(sensors, filters);
    expect(result.includedCount).toBe(6);
  });

  it("handles a real CSV column whose header spans multiple quoted lines", () => {
    // The sensors CSV header for natural frequency is a quoted multi-line
    // field ("Natural\r\nFrequency\r\n[Hz]"); the parsed attribute name
    // carries the embedded line breaks verbatim, and filtering by it still
    // works.
    const freqKey = Object.keys(sensors[0]).find((k) => k.includes("Frequency"));
    expect(getAttributeDomain(sensors, freqKey)).toEqual({ min: 15, max: 50, sampleCount: 71 });

    const filter = createRangeFilter({ input: freqKey, min: 20 });
    const result = applyFilters(sensors, [filter]);
    expect(result.includedCount).toBe(39);
  });
});
