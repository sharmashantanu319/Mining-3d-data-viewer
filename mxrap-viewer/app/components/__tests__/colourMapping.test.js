import { describe, it, expect } from "vitest";
import {
  parseColourRampCsv,
  resolveDomain,
  normalisePosition,
  normalizeColourMarker,
  mapColour,
  toHex,
  toCssRgba,
  COLOUR_SPACES,
} from "../colourMapping";
import { RAMP_HEADER, rampRow, rampCsv, eightSegmentRamp } from "./fixtures/ramps";

// These are deterministic unit tests of pure functions. They do not render
// anything; the shader / real-browser checks are separate.

// ---------------------------------------------------------------------------

function markerFor(defOverrides, csv, opts) {
  // Pass the whole parse result so structural CSV issues fold into the marker.
  return normalizeColourMarker(
    { input: "x", minimum: -4, maximum: 4, ...defOverrides },
    parseColourRampCsv(csv),
    opts ?? {}
  );
}

// One segment spanning [domainMin, domainMax], for the mapColour numerics.
function oneSegment({
  domainMin = 0,
  domainMax = 4,
  start = [1, 0, 0],
  end = [0, 0, 1],
  space = "RGB",
  curve = "linear",
  numberOfColours = "",
  transparency = "",
  endTransparency = "",
  symbol = "",
  scale,
  inputType,
} = {}) {
  const csv = rampCsv([
    rampRow({
      upTo: "",
      start,
      end,
      space,
      startSpace: space,
      endSpace: space,
      curve,
      numberOfColours,
      transparency,
      endTransparency,
      symbol,
    }),
  ]);
  return normalizeColourMarker(
    { input: "x", minimum: domainMin, maximum: domainMax, scale, inputType },
    parseColourRampCsv(csv),
    {}
  );
}

// ===========================================================================
// parseColourRampCsv
// ===========================================================================

describe("parseColourRampCsv", () => {
  it("P1 parses a well-formed 8-segment ramp", () => {
    const { segments, errors } = parseColourRampCsv(eightSegmentRamp());
    expect(segments).toHaveLength(8);
    expect(errors).toEqual([]);
  });

  it("P2 keeps a blank first Up to as null", () => {
    const { segments } = parseColourRampCsv(eightSegmentRamp());
    expect(segments[0].upTo).toBeNull();
    expect(segments[1].upTo).toBe(3);
  });

  it("P3 keeps distinct start/end colour spaces", () => {
    const csv = rampCsv([
      rampRow({ upTo: "", startSpace: "HSV", endSpace: "RGB", space: "HSV" }),
    ]);
    const { segments } = parseColourRampCsv(csv);
    expect(segments[0].startColourSpace).toBe("HSV");
    expect(segments[0].endColourSpace).toBe("RGB");
  });

  it("P4 stores H = -1 verbatim (no wrapping at parse time)", () => {
    const csv = rampCsv([rampRow({ upTo: "", start: [-1, 0, 0.6] })]);
    const { segments } = parseColourRampCsv(csv);
    expect(segments[0].startColour[0]).toBe(-1);
  });

  it("P5 treats CRLF the same as LF", () => {
    const lf = eightSegmentRamp();
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(parseColourRampCsv(crlf).segments).toEqual(
      parseColourRampCsv(lf).segments
    );
  });

  it("P6 parses scientific notation in Up to", () => {
    const csv = rampCsv([
      rampRow({ upTo: "" }),
      rampRow({ upTo: "1e+11" }),
    ]);
    const { segments } = parseColourRampCsv(csv);
    expect(segments[1].upTo).toBe(1e11);
  });

  it("P7 reports a missing required column and returns no segments", () => {
    const header = RAMP_HEADER.replace(",Colour Ramp", ",Something Else");
    const csv = [header, rampRow({ upTo: "" })].join("\n");
    const { segments, errors } = parseColourRampCsv(csv);
    expect(segments).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({ code: "missing-column", column: "Colour Ramp" }),
    ]);
  });

  it("P8 preserves a non-numeric colour cell as NaN and warns", () => {
    const row = rampRow({ upTo: "" }).split(",");
    row[3] = "abc"; // Start Colour (S)
    const csv = [RAMP_HEADER, row.join(",")].join("\n");
    const { segments, warnings } = parseColourRampCsv(csv);
    expect(Number.isNaN(segments[0].startColour[1])).toBe(true);
    expect(warnings).toEqual([
      expect.objectContaining({ code: "non-numeric-cell", column: "Start Colour (S)" }),
    ]);
  });

  it("P9 warns when there is a header but no rows", () => {
    const { segments, warnings } = parseColourRampCsv(RAMP_HEADER);
    expect(segments).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({ code: "no-segments" }),
    ]);
  });

  it("P10 ignores trailing blank lines", () => {
    const csv = eightSegmentRamp() + "\n\n  \n";
    expect(parseColourRampCsv(csv).segments).toHaveLength(8);
  });

  it("P11 reports a ragged row (too few cells)", () => {
    const csv = [RAMP_HEADER, "1,2,3"].join("\n");
    const { errors } = parseColourRampCsv(csv);
    expect(errors).toEqual([
      expect.objectContaining({ code: "ragged-row", row: 2 }),
    ]);
  });

  it("P11b reports a ragged row (too many cells)", () => {
    const csv = [RAMP_HEADER, rampRow({ upTo: "" }) + ",extra"].join("\n");
    const { segments, errors } = parseColourRampCsv(csv);
    expect(segments).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({ code: "ragged-row", row: 2 }),
    ]);
  });

  it("P12 keeps a blank Number of Colours as null", () => {
    const { segments } = parseColourRampCsv(eightSegmentRamp());
    expect(segments[0].numberOfColoursRaw).toBeNull();
  });

  it("P13 falls back End Transparency to Start Transparency when blank", () => {
    const csv = rampCsv([rampRow({ upTo: "", transparency: "40" })]);
    const { segments } = parseColourRampCsv(csv);
    expect(segments[0].startTransparency).toBe(40);
    expect(segments[0].endTransparency).toBe(40);
  });

  it("empty input is an error, not a throw", () => {
    expect(parseColourRampCsv("").errors[0].code).toBe("empty-csv");
    expect(parseColourRampCsv(null).errors[0].code).toBe("empty-csv");
  });
});

// ===========================================================================
// resolveDomain
// ===========================================================================

describe("resolveDomain", () => {
  it("D1 uses configured bounds", () => {
    expect(resolveDomain({ configuredMin: -4, configuredMax: 4, dataMin: -1, dataMax: 1 })).toEqual(
      { min: -4, max: 4, source: "configured" }
    );
  });
  it("D2 falls back to data bounds", () => {
    expect(resolveDomain({ configuredMin: null, configuredMax: null, dataMin: 1e5, dataMax: 1e13 })).toEqual(
      { min: 1e5, max: 1e13, source: "data" }
    );
  });
  it("D3 mixes a configured bound with a data bound", () => {
    expect(resolveDomain({ configuredMin: -4, configuredMax: null, dataMin: -1, dataMax: 9 })).toEqual(
      { min: -4, max: 9, source: "mixed" }
    );
  });
  it("D4 flags a single-point range", () => {
    expect(resolveDomain({ configuredMin: null, configuredMax: null, dataMin: 7, dataMax: 7 })).toEqual(
      { min: 7, max: 7, source: "degenerate" }
    );
  });
  it("D5 flags an inverted configured range", () => {
    expect(resolveDomain({ configuredMin: 8, configuredMax: 4, dataMin: null, dataMax: null }).source).toBe(
      "inverted"
    );
  });
  it("D6 reports unresolved when nothing supplies a bound", () => {
    const r = resolveDomain({ configuredMin: null, configuredMax: null, dataMin: null, dataMax: NaN });
    expect(r.source).toBe("unresolved");
    expect(Number.isNaN(r.min)).toBe(true);
  });
});

// ===========================================================================
// Colour spaces
// ===========================================================================

describe("COLOUR_SPACES", () => {
  it("HSV <-> RGB round-trips a saturated colour", () => {
    const rgb = COLOUR_SPACES.HSV.toRgb([1 / 3, 1, 1]); // green
    expect(rgb[0]).toBeCloseTo(0);
    expect(rgb[1]).toBeCloseTo(1);
    expect(rgb[2]).toBeCloseTo(0);
    const back = COLOUR_SPACES.HSV.fromRgb(rgb);
    expect(back[0]).toBeCloseTo(1 / 3);
  });

  it("HSV treats S = 0 as achromatic regardless of hue (incl. -1)", () => {
    expect(COLOUR_SPACES.HSV.toRgb([-1, 0, 0.5])).toEqual([0.5, 0.5, 0.5]);
    expect(COLOUR_SPACES.HSV.toRgb([0.42, 0, 0.5])).toEqual([0.5, 0.5, 0.5]);
  });

  it('"HSV (Left To Right)" decreases hue through 0 -> 1', () => {
    const [h] = COLOUR_SPACES["HSV (Left To Right)"].interpolate([0.1, 1, 1], [0.9, 1, 1], 0.5);
    expect(h).toBeCloseTo(0);
  });

  it('"HSV (Right To Left)" increases hue through 1 -> 0', () => {
    const [h] = COLOUR_SPACES["HSV (Right To Left)"].interpolate([0.9, 1, 1], [0.1, 1, 1], 0.5);
    expect(h).toBeCloseTo(0);
  });

  it("plain HSV interpolates the hue value directly (no wrap)", () => {
    const [h] = COLOUR_SPACES.HSV.interpolate([0.1, 1, 1], [0.9, 1, 1], 0.5);
    expect(h).toBeCloseTo(0.5);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(COLOUR_SPACES)).toBe(true);
  });
});

// ===========================================================================
// normalizeColourMarker
// ===========================================================================

describe("normalizeColourMarker", () => {
  it("N1 linear scale -> identity transform", () => {
    const m = markerFor({ scale: "linear" }, eightSegmentRamp());
    expect(m.transform).toBe("identity");
    expect(m.valid).toBe(true);
  });

  it("N2 logarithmic scale -> log10 transform with log-space bounds", () => {
    const csv = rampCsv([rampRow({ upTo: "" }), rampRow({ upTo: 1e8 })]);
    const m = markerFor(
      { scale: "logarithmic", minimum: 1e5, maximum: 1e13 },
      csv
    );
    expect(m.transform).toBe("log10");
    const seg = m.segments.find((s) => s.upperBoundRaw === 1e8);
    expect(seg.upperBoundT).toBeCloseTo(Math.log10(1e8));
  });

  it("N3 log scale with a non-positive domain is an error", () => {
    const m = markerFor({ scale: "logarithmic", minimum: -1, maximum: 1 }, eightSegmentRamp());
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("log-domain-nonpositive");
  });

  it("N4 resolves a percentage threshold against the domain", () => {
    const csv = rampCsv([rampRow({ upTo: "" }), rampRow({ upTo: 50 })]);
    const m = markerFor(
      { minimum: 4, maximum: 8, thresholdsArePercentages: true },
      csv
    );
    const seg = m.segments.find((s) => s.upperBoundRaw !== 8);
    expect(seg.upperBoundRaw).toBeCloseTo(6);
  });

  it("N6 balancing widens only the interpolation range, not the domain", () => {
    const csv = rampCsv([rampRow({ upTo: "" }), rampRow({ upTo: 25 })]);
    const m = markerFor(
      {
        minimum: 4,
        maximum: 7,
        midpoint: 6,
        thresholdsArePercentages: true,
        balanceMinimumAndMaximum: true,
      },
      csv
    );
    expect(m.domainMin).toBe(4);
    expect(m.domainMax).toBe(7);
    expect(m.interpolationMin).toBe(4);
    expect(m.interpolationMax).toBe(8);
    expect(m.balancingUnverified).toBe(true);
    expect(m.warnings.map((w) => w.code)).toContain("balancing-unverified");
  });

  it("N7 an unsupported interpolation space is an error", () => {
    const csv = rampCsv([rampRow({ upTo: "", space: "CIELAB" })]);
    const m = markerFor({}, csv);
    expect(m.valid).toBe(false);
    expect(m.errors[0]).toMatchObject({
      code: "unsupported-colour-space",
      context: { space: "CIELAB" },
    });
  });

  it("N8 an unsupported endpoint space is an error", () => {
    const csv = rampCsv([rampRow({ upTo: "", startSpace: "XYZ" })]);
    const m = markerFor({}, csv);
    expect(m.valid).toBe(false);
    expect(m.errors.some((e) => e.code === "unsupported-colour-space" && e.context.endpoint === "start")).toBe(true);
  });

  it("N9 an unknown ramp curve is a warning, treated as linear", () => {
    const csv = rampCsv([rampRow({ upTo: "", curve: "wiggle" })]);
    const m = markerFor({}, csv);
    expect(m.valid).toBe(true);
    expect(m.warnings.map((w) => w.code)).toContain("unknown-ramp-curve");
    expect(m.segments[0].rampCurve).toBe("linear");
  });

  it("N10/N11 rampCurve none and numberOfColours 1 both give startOnly", () => {
    const noneM = markerFor({}, rampCsv([rampRow({ upTo: "", curve: "none" })]));
    expect(noneM.segments[0].colourResolution).toBe("startOnly");
    const oneM = markerFor({}, rampCsv([rampRow({ upTo: "", numberOfColours: "1" })]));
    expect(oneM.segments[0].colourResolution).toBe("startOnly");
  });

  it("N12 numberOfColours >= 2 gives stepped", () => {
    const m = markerFor({}, rampCsv([rampRow({ upTo: "", numberOfColours: "10" })]));
    expect(m.segments[0].colourResolution).toBe("stepped");
    expect(m.segments[0].steps).toBe(10);
  });

  it("N13 a missing numberOfColours is continuous + warning", () => {
    const m = markerFor({}, rampCsv([rampRow({ upTo: "" })]));
    expect(m.segments[0].colourResolution).toBe("continuous");
    expect(m.warnings.map((w) => w.code)).toContain("numberOfColours-missing");
  });

  it("N14 a ramp not in canonical order is re-sorted with a warning", () => {
    const scrambled = rampCsv([
      rampRow({ upTo: "" }), // -> 4
      rampRow({ upTo: 1 }),
      rampRow({ upTo: -3 }),
      rampRow({ upTo: -1 }),
    ]);
    const m = markerFor({ minimum: -4, maximum: 4 }, scrambled);
    expect(m.warnings.map((w) => w.code)).toContain("ramp-reordered");
    expect(m.segments.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(m.segments.map((s) => s.upperBoundRaw)).toEqual([-3, -1, 1, 4]);
    expect(m.segments.map((s) => s.lowerBoundRaw)).toEqual([-4, -3, -1, 1]);
  });

  it("N14b a canonical (blank-first, descending) ramp is not flagged", () => {
    const m = markerFor({ minimum: -4, maximum: 4 }, eightSegmentRamp());
    expect(m.warnings.map((w) => w.code)).not.toContain("ramp-reordered");
  });

  it("N14c a numeric first row (blank Up to not first) is flagged even if thresholds descend", () => {
    const csv = rampCsv([
      rampRow({ upTo: 2 }),
      rampRow({ upTo: 1 }),
      rampRow({ upTo: "" }), // -> 4, but not first
    ]);
    const m = markerFor({ minimum: -4, maximum: 4 }, csv);
    expect(m.warnings.map((w) => w.code)).toContain("ramp-reordered");
  });

  it("N15 a non-null alphaInput is a warning", () => {
    const m = markerFor({ alphaInput: "Something" }, eightSegmentRamp());
    expect(m.warnings.map((w) => w.code)).toContain("alpha-input-unsupported");
  });

  it("N16 nullColour is read as RGB", () => {
    const m = markerFor({ nullColour: [0, 0, 1] }, eightSegmentRamp());
    expect(m.nullColour).toMatchObject({ r: 0, g: 0, b: 1, a: 1 });
  });

  it("N17 a categories legend reuses the ramp lookup for colour + symbol", () => {
    const m = markerFor(
      { minimum: -4, maximum: 4, legend: { title: "Config", categories: [{ value: 3, description: "Triaxial" }] } },
      eightSegmentRamp()
    );
    expect(m.legend.kind).toBe("categorical");
    const cat = m.legend.categories[0];
    const direct = mapColour(3, m);
    expect(cat.description).toBe("Triaxial");
    expect(cat.colour).toEqual({ r: direct.r, g: direct.g, b: direct.b, a: direct.a });
  });

  it("N18 a ramp legend has stops covering every boundary", () => {
    const m = markerFor({ minimum: -4, maximum: 4 }, eightSegmentRamp());
    expect(m.legend.kind).toBe("ramp");
    expect(m.legend.stops).toHaveLength(m.segments.length + 1);
    expect(m.legend.rangeMin).toBe(-4);
    expect(m.legend.rangeMax).toBe(4);
  });

  it("N19 maps the legend number-format options through", () => {
    const m = markerFor(
      { legend: { title: "Seismic Moment [Nm]", numberDisplay: "automaticExponential", significantDigits: 2 } },
      eightSegmentRamp()
    );
    expect(m.legend.numberFormat).toEqual({ mode: "automaticExponential", sigDigits: 2 });
    expect(m.legend.title).toBe("Seismic Moment");
    expect(m.legend.units).toBe("Nm");
  });

  it("N20 a valid marker has magenta as its fallback", () => {
    const m = markerFor({}, eightSegmentRamp());
    expect(m.valid).toBe(true);
    expect(m.errors).toEqual([]);
    expect(m.fallbackColour).toMatchObject({ r: 1, g: 0, b: 1, a: 1 });
  });

  it("N22 a shuffled ramp normalizes identically (except fileRowIndex)", () => {
    const rows = [
      rampRow({ upTo: "", start: [0, 0, 0.5], end: [0, 0, 0.5], curve: "none" }),
      rampRow({ upTo: 3, start: [0.1, 1, 1], end: [0, 1, 0.7] }),
      rampRow({ upTo: 2, start: [0.17, 1, 1], end: [0, 1, 0.7] }),
      rampRow({ upTo: 1, start: [0.33, 1, 1], end: [0.17, 1, 1] }),
      rampRow({ upTo: 0, start: [0.51, 0.35, 1], end: [0.33, 1, 1] }),
    ];
    const canonical = markerFor({ minimum: -4, maximum: 4 }, rampCsv(rows));
    const shuffled = markerFor(
      { minimum: -4, maximum: 4 },
      rampCsv([rows[3], rows[0], rows[4], rows[1], rows[2]])
    );

    const strip = (m) =>
      m.segments.map(({ fileRowIndex, ...rest }) => rest);
    expect(strip(shuffled)).toEqual(strip(canonical));

    for (let v = -5; v <= 5; v += 0.13) {
      const a = mapColour(v, canonical);
      const b = mapColour(v, shuffled);
      expect(b.segmentIndex).toBe(a.segmentIndex);
      expect(b.r).toBeCloseTo(a.r, 10);
      expect(b.g).toBeCloseTo(a.g, 10);
      expect(b.b).toBeCloseTo(a.b, 10);
    }
  });

  it("N23 two rows resolving to the same threshold warn and the later one is unreachable", () => {
    const csv = rampCsv([
      rampRow({ upTo: "" }),
      rampRow({ upTo: 0 }),
      rampRow({ upTo: 0 }),
    ]);
    const m = markerFor({ minimum: -4, maximum: 4 }, csv);
    expect(m.warnings.map((w) => w.code)).toContain("duplicate-threshold");
    // sorted: [ (upTo 0, idx 0), (upTo 0, idx 1 -> degenerate), (upTo 4, idx 2) ]
    const hits = new Set();
    for (let v = -4; v <= 4; v += 0.05) hits.add(mapColour(v, m).segmentIndex);
    expect(hits.has(1)).toBe(false); // the degenerate duplicate is unreachable
    expect(hits.has(0)).toBe(true);
    expect(hits.has(2)).toBe(true);
  });
});

// ===========================================================================
// Mandatory numeric validation
// ===========================================================================

describe("numeric validation keeps NaN/Infinity out of rendering", () => {
  it("a non-finite colour component makes the marker invalid; mapColour returns finite magenta", () => {
    const row = rampRow({ upTo: "" }).split(",");
    row[4] = "abc"; // Start Colour (V)
    const m = markerFor({}, [RAMP_HEADER, row.join(",")].join("\n"));
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("invalid-colour-component");

    const c = mapColour(1.5, m);
    expect(c).toMatchObject({ r: 1, g: 0, b: 1, a: 1 });
    for (const k of ["r", "g", "b", "a"]) expect(Number.isFinite(c[k])).toBe(true);
  });

  it("a non-finite Up to is an error", () => {
    const row = rampRow({ upTo: "" }).split(",");
    row[0] = "Infinity";
    const m = markerFor({}, [RAMP_HEADER, rampRow({ upTo: "" }), row.join(",")].join("\n"));
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("invalid-threshold");
  });

  it("a non-finite transparency is an error", () => {
    const row = rampRow({ upTo: "" }).split(",");
    row[10] = "abc"; // Transparency [0..100]
    const m = markerFor({}, [RAMP_HEADER, row.join(",")].join("\n"));
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("invalid-transparency");
  });

  it("a finite transparency outside 0..100 is clamped with a warning", () => {
    const high = markerFor({}, rampCsv([rampRow({ upTo: "", transparency: "150" })]));
    expect(high.valid).toBe(true);
    expect(high.warnings.map((w) => w.code)).toContain("transparency-clamped");
    expect(high.segments[0].startAlpha).toBe(0); // 100% transparent

    const low = markerFor({}, rampCsv([rampRow({ upTo: "", transparency: "-20" })]));
    expect(low.segments[0].startAlpha).toBe(1); // 0% transparent
    expect(low.warnings.map((w) => w.code)).toContain("transparency-clamped");
  });

  it("an unresolvable domain is an error; mapColour returns magenta", () => {
    const { segments } = parseColourRampCsv(eightSegmentRamp());
    const m = normalizeColourMarker({ input: "x" }, segments, {}); // no min/max, no data bounds
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("domain-unresolved");
    expect(mapColour(0, m)).toMatchObject({ r: 1, g: 0, b: 1 });
  });

  it("an unresolved domain resolves from data bounds when supplied", () => {
    const { segments } = parseColourRampCsv(eightSegmentRamp());
    const m = normalizeColourMarker({ input: "x" }, segments, { dataMin: -4, dataMax: 4 });
    expect(m.valid).toBe(true);
    expect(m.domainMin).toBe(-4);
    expect(m.warnings.map((w) => w.code)).toContain("data-derived-bound");
  });

  it("a huge but finite colour component (would overflow interpolation) is rejected", () => {
    const m = markerFor({}, rampCsv([rampRow({ upTo: "", start: [1e308, 0.5, 0.5], end: [-1e308, 0.5, 0.5] })]));
    expect(m.valid).toBe(false);
    expect(m.errors.map((e) => e.code)).toContain("invalid-colour-component");
    const c = mapColour(0, m);
    for (const k of ["r", "g", "b", "a"]) expect(Number.isFinite(c[k])).toBe(true);
  });

  it("a component just inside the magnitude bound still normalizes and maps finite", () => {
    const m = markerFor({}, rampCsv([rampRow({ upTo: "", space: "RGB", startSpace: "RGB", endSpace: "RGB", start: [0, 0, 0], end: [1, 1, 1] })]));
    expect(m.valid).toBe(true);
    const c = mapColour(0, m);
    for (const k of ["r", "g", "b", "a"]) expect(Number.isFinite(c[k])).toBe(true);
  });

  it("a ragged CSV row folded from the parse result makes the marker invalid", () => {
    const csv = [RAMP_HEADER, rampRow({ upTo: "" }), "1,2,3"].join("\n");
    const m = normalizeColourMarker({ input: "x", minimum: -4, maximum: 4 }, parseColourRampCsv(csv), {});
    expect(m.valid).toBe(false);
    expect(m.errors.some((e) => e.code === "ragged-row" && e.context.source === "ramp-csv")).toBe(true);
  });

  it("parse warnings (non-numeric cell) are also folded into the marker", () => {
    const row = rampRow({ upTo: "" }).split(",");
    row[3] = "abc";
    const csv = [RAMP_HEADER, row.join(",")].join("\n");
    const m = normalizeColourMarker({ input: "x", minimum: -4, maximum: 4 }, parseColourRampCsv(csv), {});
    expect(m.warnings.some((w) => w.code === "non-numeric-cell")).toBe(true);
    expect(m.valid).toBe(false); // NaN component also triggers invalid-colour-component
  });
});

// ===========================================================================
// mapColour
// ===========================================================================

describe("mapColour", () => {
  const M = () =>
    markerFor(
      { minimum: -4, maximum: 4 },
      rampCsv([
        rampRow({ upTo: "", start: [0.1, 1, 1], end: [0, 1, 1] }),
        rampRow({ upTo: 0, start: [0.5, 1, 1], end: [0.2, 1, 1] }),
        rampRow({ upTo: -2, start: [0.7, 1, 1], end: [0.6, 1, 1] }),
      ])
    );

  it("M1 null-ish input -> null colour", () => {
    const m = M();
    for (const v of [null, undefined, ""]) {
      const c = mapColour(v, m);
      expect(c).toMatchObject({ isNull: true, segmentIndex: -1 });
    }
  });

  it("M2-M5 NaN / Infinity / -Infinity / non-numeric string -> null colour", () => {
    const m = M();
    for (const v of [NaN, Infinity, -Infinity, "3"]) {
      expect(mapColour(v, m).isNull).toBe(true);
    }
  });

  it("M6/M7 finite out-of-range values are capped", () => {
    const m = M();
    const hi = mapColour(10, m);
    const atMax = mapColour(4, m);
    expect(hi).toEqual(atMax);
    const lo = mapColour(-9, m);
    const atMin = mapColour(-4, m);
    expect(lo).toEqual(atMin);
  });

  it("M8/M9 domain endpoints land in the right segments", () => {
    const m = M();
    expect(mapColour(4, m).segmentIndex).toBe(2); // highest segment
    expect(mapColour(-4, m).segmentIndex).toBe(0); // lowest segment
  });

  it("M10/M11 a value equal to a threshold is owned by the segment whose upper bound it is", () => {
    const m = M();
    // segments after sort: [-4,-2], [-2,0], [0,4] -> indices 0,1,2
    expect(mapColour(-2, m).segmentIndex).toBe(0);
    expect(mapColour(-2 + 1e-9, m).segmentIndex).toBe(1);
    expect(mapColour(0, m).segmentIndex).toBe(1);
  });

  it("M12 log-scale position is computed in log space", () => {
    const m = markerFor(
      { scale: "logarithmic", minimum: 1, maximum: 100 },
      rampCsv([rampRow({ upTo: "", start: [1, 0, 0], end: [0, 0, 1], space: "RGB", startSpace: "RGB", endSpace: "RGB" })])
    );
    // value 10 -> log10(10)=1 is halfway between log10(1)=0 and log10(100)=2
    const c = mapColour(10, m);
    expect(c.r).toBeCloseTo(0.5);
    expect(c.b).toBeCloseTo(0.5);
  });

  it("M14 linear RGB interpolation, no curve", () => {
    const m = oneSegment({ curve: "linear", start: [1, 0, 0], end: [0, 0, 1] });
    const c = mapColour(1, m); // tRaw = 0.25 over [0,4]
    expect(c.r).toBeCloseTo(0.75);
    expect(c.g).toBeCloseTo(0);
    expect(c.b).toBeCloseTo(0.25);
  });

  it("M15 sqrt is applied per final RGB channel with 8-bit rounding", () => {
    const m = oneSegment({ curve: "sqrt", start: [1, 0, 0], end: [0, 0, 1] });
    const c = mapColour(1, m); // interp (0.75, 0, 0.25)
    expect(c.r).toBeCloseTo(221 / 255, 10);
    expect(c.g).toBeCloseTo(0, 10);
    expect(c.b).toBeCloseTo(128 / 255, 10);
  });

  it("M16 s-curve is applied per final RGB channel (truncation, no +0.5)", () => {
    const m = oneSegment({ curve: "s-curve", start: [1, 0, 0], end: [0, 0, 1] });
    const c = mapColour(1, m); // interp (0.75, 0, 0.25)
    expect(c.r).toBeCloseTo(217 / 255, 10);
    expect(c.g).toBeCloseTo(0, 10);
    expect(c.b).toBeCloseTo(37 / 255, 10);
  });

  it("M17-M19 the three curves differ on a coloured HSV interpolation", () => {
    const endpoints = { space: "HSV", start: [0, 1, 1], end: [0, 0, 1] }; // red -> white
    const lin = mapColour(1, oneSegment({ ...endpoints, curve: "linear" }));
    const sq = mapColour(1, oneSegment({ ...endpoints, curve: "sqrt" }));
    const sc = mapColour(1, oneSegment({ ...endpoints, curve: "s-curve" }));

    expect([lin.r, lin.g, lin.b]).toEqual([
      expect.closeTo(1), expect.closeTo(0.25), expect.closeTo(0.25),
    ]);
    expect(sq.g).toBeCloseTo(128 / 255, 10);
    expect(sc.g).toBeCloseTo(37 / 255, 10);
    expect(sq.g).not.toBeCloseTo(lin.g, 5);
    expect(sc.g).not.toBeCloseTo(lin.g, 5);
    expect(sq.g).not.toBeCloseTo(sc.g, 5);
  });

  it("M20/M21 Number of Colours quantises the colour position", () => {
    const m = oneSegment({ curve: "linear", numberOfColours: "4", start: [0, 0, 0], end: [1, 1, 1], space: "RGB" });
    // tRaw 0.3 -> round(0.9)/3 = 1/3 ; tRaw 0.5 -> round(1.5)/3 = 2/3
    expect(mapColour(1.2, m).r).toBeCloseTo(1 / 3, 10);
    expect(mapColour(2, m).r).toBeCloseTo(2 / 3, 10);
  });

  it("M22/M23 HSV directional interpolation via mapColour", () => {
    const ltr = oneSegment({ space: "HSV (Left To Right)", start: [0.1, 1, 1], end: [0.9, 1, 1] });
    // at tRaw 0.5 hue wraps to 0.0 -> red
    const c = mapColour(2, ltr);
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBeCloseTo(0);
    expect(c.b).toBeCloseTo(0);
  });

  it("M24 alpha ignores the ramp curve", () => {
    for (const curve of ["linear", "sqrt", "s-curve"]) {
      const m = oneSegment({ curve, transparency: "0", endTransparency: "50" });
      expect(mapColour(1, m).a).toBeCloseTo(0.875, 10); // 1 + (0.5-1)*0.25
    }
  });

  it("M25 Number of Colours does not quantise alpha", () => {
    const m = oneSegment({ numberOfColours: "4", transparency: "0", endTransparency: "100" });
    const c = mapColour(1.2, m); // colour tColour = 1/3, alpha uses tRaw = 0.3
    expect(c.a).toBeCloseTo(0.7, 10);
  });

  it("M26 rampCurve none keeps the start colour but still varies alpha with tRaw", () => {
    const m = oneSegment({ curve: "none", space: "HSV", start: [0, 1, 1], end: [0.5, 1, 1], transparency: "0", endTransparency: "100" });
    const c = mapColour(2.4, m); // tRaw = 0.6
    expect(c.r).toBeCloseTo(1); // start colour red, unchanged
    expect(c.g).toBeCloseTo(0);
    expect(c.b).toBeCloseTo(0);
    expect(c.a).toBeCloseTo(0.4, 10); // 1 + (0-1)*0.6
  });

  it("M27 achromatic endpoint (S=0, any hue) renders grey", () => {
    const m = oneSegment({ space: "HSV", start: [-1, 0, 0.5], end: [-1, 0, 0.5], curve: "none" });
    const c = mapColour(1, m);
    expect(c.r).toBeCloseTo(0.5);
    expect(c.g).toBeCloseTo(0.5);
    expect(c.b).toBeCloseTo(0.5);
  });

  it("M28 an invalid marker returns finite magenta", () => {
    const m = markerFor({}, rampCsv([rampRow({ upTo: "", space: "CIELUV" })]));
    const c = mapColour(0, m);
    expect(c).toMatchObject({ r: 1, g: 0, b: 1, a: 1, segmentIndex: -1 });
  });

  it("M29/M30 date marker parses the value, or falls to null", () => {
    const m = markerFor(
      { input: "t", inputType: "date", scale: "date", minimum: Date.UTC(2023, 4, 1), maximum: Date.UTC(2023, 4, 3) },
      rampCsv([rampRow({ upTo: "", start: [1, 0, 0], end: [0, 0, 1], space: "RGB", startSpace: "RGB", endSpace: "RGB" })])
    );
    expect(mapColour("2023-05-02 00:00:00", m).isNull).toBe(false);
    expect(mapColour("garbage", m).isNull).toBe(true);
  });

  it("M32/M33 symbol comes from the segment, or the null symbol", () => {
    const withSymbol = oneSegment({ symbol: "foo.png" });
    expect(mapColour(1, withSymbol).symbol).toBe("foo.png");

    const m = markerFor({ nullSymbol: "q.png" }, eightSegmentRamp());
    expect(mapColour(null, m).symbol).toBe("q.png");
  });

  it("never returns a NaN component for any input on a valid marker", () => {
    const m = M();
    for (const v of [null, "", NaN, Infinity, -50, 0, 3.5, 50, "2023-01-01"]) {
      const c = mapColour(v, m);
      for (const k of ["r", "g", "b", "a"]) expect(Number.isFinite(c[k])).toBe(true);
    }
  });
});

// ===========================================================================
// normalisePosition
// ===========================================================================

describe("normalisePosition", () => {
  const base = {
    transform: "identity",
    interpolationMin: 0,
    interpolationMax: 10,
    midpoint: null,
    domainMin: 0,
    domainMax: 10,
  };

  it("maps linearly with no midpoint", () => {
    expect(normalisePosition(2.5, base)).toBeCloseTo(0.25);
    expect(normalisePosition(-5, base)).toBeCloseTo(0); // clamped
    expect(normalisePosition(15, base)).toBeCloseTo(1); // clamped
  });

  it("anchors a midpoint at 0.5", () => {
    const cfg = { ...base, midpoint: 2, interpolationMin: 0, interpolationMax: 10 };
    expect(normalisePosition(2, cfg)).toBeCloseTo(0.5);
    expect(normalisePosition(1, cfg)).toBeCloseTo(0.25);
    expect(normalisePosition(6, cfg)).toBeCloseTo(0.75);
  });

  it("works in log space", () => {
    const cfg = { ...base, transform: "log10", interpolationMin: 1, interpolationMax: 100, domainMin: 1, domainMax: 100 };
    expect(normalisePosition(10, cfg)).toBeCloseTo(0.5);
  });
});

// ===========================================================================
// UI helpers
// ===========================================================================

describe("toHex / toCssRgba", () => {
  it("formats a canonical colour", () => {
    const c = { r: 1, g: 0.5, b: 0, a: 0.25 };
    expect(toHex(c)).toBe("#ff8000");
    expect(toCssRgba(c)).toBe("rgba(255, 128, 0, 0.25)");
  });

  it("clamps out-of-range components", () => {
    expect(toHex({ r: 2, g: -1, b: 0.5 })).toBe("#ff0080");
  });
});
