import { describe, it, expect } from "vitest";
import { normalizeSizeMarker, mapSize } from "../sizeMapping";

// A markers.json `type: "size"` entry, matching marker-defs/events/markers.json.
const ML_SIZE_MARKER = {
  name: "ML",
  type: "size",
  input: "ML",
  inputType: "number",
  scale: "linear",
  minimum: -2,
  maximum: 2,
};

// The series-level output-size settings from config.json.
const SERIES = {
  sizeMarker: "ML",
  sizeMinimum: 1,
  sizeMaximum: 25,
  nullSizes: 4,
};

describe("normalizeSizeMarker", () => {
  it("no size marker -> constant size at the range midpoint", () => {
    const m = normalizeSizeMarker(null, { ...SERIES, sizeMarker: null });
    expect(m.kind).toBe("constant");
    expect(m.size).toBe(13); // (1 + 25) / 2
    expect(m.valid).toBe(true);
  });

  it("with a size marker -> a mapped marker", () => {
    const m = normalizeSizeMarker(ML_SIZE_MARKER, SERIES);
    expect(m.kind).toBe("mapped");
    expect(m.transform).toBe("identity");
    expect(m.domainMin).toBe(-2);
    expect(m.domainMax).toBe(2);
    expect(m.sizeMinimum).toBe(1);
    expect(m.sizeMaximum).toBe(25);
    expect(m.nullSize).toBe(4);
    expect(m.valid).toBe(true);
  });

  it("a logarithmic size scale sets the log10 transform", () => {
    const m = normalizeSizeMarker(
      { ...ML_SIZE_MARKER, scale: "logarithmic", minimum: 1e5, maximum: 1e13 },
      SERIES
    );
    expect(m.transform).toBe("log10");
    expect(m.valid).toBe(true);
  });

  it("a logarithmic scale with a non-positive minimum is an error", () => {
    const m = normalizeSizeMarker(
      { ...ML_SIZE_MARKER, scale: "logarithmic", minimum: -1, maximum: 10 },
      SERIES
    );
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("log-domain-nonpositive");
  });

  it("non-finite sizeMinimum / sizeMaximum is an error", () => {
    const m = normalizeSizeMarker(ML_SIZE_MARKER, { ...SERIES, sizeMaximum: NaN });
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("invalid-output-size");
  });

  it("preserves an inverted output size range", () => {
  const m = normalizeSizeMarker(ML_SIZE_MARKER, {
    ...SERIES,
    sizeMinimum: 25,
    sizeMaximum: 1,
  });

  expect(m.warnings.map((w) => w.code)).not.toContain(
    "output-size-reordered"
  );
  expect(m.sizeMinimum).toBe(25);
  expect(m.sizeMaximum).toBe(1);
  expect(m.valid).toBe(true);
});

  it("a missing nullSizes warns and falls back to the midpoint", () => {
    const m = normalizeSizeMarker(ML_SIZE_MARKER, { ...SERIES, nullSizes: undefined });
    expect(m.warnings.map((w) => w.code)).toContain("null-size-missing");
    expect(m.nullSize).toBe(13);
  });

  it("an unresolvable domain is an error", () => {
    const m = normalizeSizeMarker(
      { ...ML_SIZE_MARKER, minimum: undefined, maximum: undefined },
      SERIES
    );
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("domain-unresolved");
  });

  it("maps an inverted output range without reordering it", () => {
  const m = normalizeSizeMarker(ML_SIZE_MARKER, {
    ...SERIES,
    sizeMinimum: 25,
    sizeMaximum: 1,
  });

  expect(mapSize(-2, m)).toBeCloseTo(25);
  expect(mapSize(2, m)).toBeCloseTo(1);
  expect(mapSize(0, m)).toBeCloseTo(13);
});

  it("an unresolved domain resolves from data bounds when supplied", () => {
    const m = normalizeSizeMarker(
      { ...ML_SIZE_MARKER, minimum: undefined, maximum: undefined },
      SERIES,
      { dataMin: -3, dataMax: 3 }
    );
    expect(m.valid).toBe(true);
    expect(m.domainMin).toBe(-3);
    expect(m.domainMax).toBe(3);
  });

  it("a missing input column is an error", () => {
    const m = normalizeSizeMarker({ ...ML_SIZE_MARKER, input: "" }, SERIES);
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("missing-required-field");
  });

  it("a degenerate size domain warns", () => {
    const m = normalizeSizeMarker(
      { ...ML_SIZE_MARKER, minimum: 5, maximum: 5 },
      SERIES
    );
    expect(m.warnings.map((w) => w.code)).toContain("degenerate-domain");
  });
});

describe("mapSize", () => {
  const mapped = () => normalizeSizeMarker(ML_SIZE_MARKER, SERIES);

  it("maps the domain endpoints to sizeMinimum / sizeMaximum", () => {
    const m = mapped();
    expect(mapSize(-2, m)).toBeCloseTo(1);
    expect(mapSize(2, m)).toBeCloseTo(25);
    expect(mapSize(0, m)).toBeCloseTo(13); // midpoint of the value range -> midpoint of the size range
  });

  it("caps finite out-of-range values", () => {
    const m = mapped();
    expect(mapSize(100, m)).toBeCloseTo(25);
    expect(mapSize(-100, m)).toBeCloseTo(1);
  });

  it("null / empty / NaN / Infinity input -> nullSize", () => {
    const m = mapped();
    for (const v of [null, undefined, "", NaN, Infinity, -Infinity, "abc"]) {
      expect(mapSize(v, m)).toBe(4);
    }
  });

  it("a constant marker ignores the value", () => {
    const m = normalizeSizeMarker(null, { ...SERIES, sizeMarker: null });
    expect(mapSize(0, m)).toBe(13);
    expect(mapSize(null, m)).toBe(13);
    expect(mapSize("anything", m)).toBe(13);
  });

  it("an invalid marker returns a finite fallback size", () => {
    const m = normalizeSizeMarker(ML_SIZE_MARKER, { ...SERIES, sizeMaximum: NaN });
    const size = mapSize(0, m);
    expect(Number.isFinite(size)).toBe(true);
  });

  it("a logarithmic marker maps in log space", () => {
    const m = normalizeSizeMarker(
      { ...ML_SIZE_MARKER, scale: "logarithmic", minimum: 1, maximum: 100 },
      { ...SERIES, sizeMinimum: 0, sizeMaximum: 10 }
    );
    // value 10 -> log10(10) = 1 is halfway between log10(1) and log10(100)
    expect(mapSize(10, m)).toBeCloseTo(5);
  });

  it("a date marker parses the value, or falls to nullSize", () => {
    const m = normalizeSizeMarker(
      {
        ...ML_SIZE_MARKER,
        input: "DateTime",
        inputType: "date",
        scale: "date",
        minimum: Date.UTC(2023, 4, 1),
        maximum: Date.UTC(2023, 4, 3),
      },
      SERIES
    );
    expect(mapSize("2023-05-02 00:00:00", m)).toBeCloseTo(13); // midway -> mid size
    expect(mapSize("not a date", m)).toBe(4);
  });

  it("never returns a non-finite size for any input on a valid marker", () => {
    const m = mapped();
    for (const v of [null, "", NaN, Infinity, -5, 0, 1.3, 5, "2023-01-01"]) {
      expect(Number.isFinite(mapSize(v, m))).toBe(true);
    }
  });
});
