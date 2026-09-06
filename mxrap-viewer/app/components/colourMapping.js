// Colour mapping for mXrap point/surface markers.
//
// Turns a "colour marker" definition (one entry from a marker-defs
// markers.json) plus its ramp CSV into:
//   * a NormalizedColourMarker, the single structure the renderer and the
//     legend both read; and
//   * mapColour(value, marker), which turns a value into
//     { r, g, b, a } (0..1) + symbol.
//
// The module is pure: no `three` import, no file IO. The export loader is
// responsible for locating markers.json / the ramp CSV and for supplying the
// data-range bounds when the marker config omits them.
//
// Behaviour follows the customer specification (Matt's email + the real
// files in the sample export):
//
//   * Ramp CSV rows are "segments". Each owns its upper "Up to" bound; the
//     lower bound is the next-lower row's "Up to" (the lowest row's lower
//     bound is the overall minimum). The file lists a blank "Up to" row
//     first, then descending. This module resolves every threshold and
//     re-sorts before deriving anything, so a mis-ordered ramp produces the
//     same result.
//   * "Colour Ramp" is one of none / linear / sqrt / s-curve. `none` uses
//     the start colour only. `sqrt` and `s-curve` are applied per channel to
//     the FINAL RGB after interpolation, with the customer's 8-bit rounding.
//   * "Number of Colours" >= 2 quantises the colour interpolation position.
//     It does NOT quantise alpha.
//   * Transparency / End Transparency give the start/end alpha. Alpha is a
//     plain linear interpolation on the continuous (un-quantised, un-curved)
//     position, and is unaffected by sqrt / s-curve.
//   * Values outside the marker's range are capped before lookup. NaN and
//     Infinity are treated as missing (null colour), never capped.
//
// Any numeric value that could otherwise reach the renderer as NaN/Infinity
// (a bad threshold, a bad colour component, a bad transparency, an
// unresolvable domain) makes the marker `valid: false`. mapColour then
// returns `marker.fallbackColour` (magenta) with no NaN component, and the
// UI is expected to surface the config error.

import { parseCustomerDate } from "./customerDate";

const MAGENTA = Object.freeze({
  r: 1,
  g: 0,
  b: 1,
  a: 1,
  symbol: null,
  isNull: false,
  segmentIndex: -1,
});

const RAMP_CURVES = ["none", "linear", "sqrt", "s-curve"];

// Colour components are meant to be normalised (0..1 for HSV / RGB, and even
// the widest CIE ranges stay well under a few hundred). A component far
// outside that is treated as invalid input, not just the non-finite ones,
// because a very large finite value can still overflow to +/-Infinity during
// interpolation or a colour-space conversion and reach the renderer as NaN.
const MAX_COMPONENT_MAGNITUDE = 1e4;

// ---------------------------------------------------------------------------
// Colour spaces
// ---------------------------------------------------------------------------

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hsvToRgb([h, s, v]) {
  const hue = h - Math.floor(h); // wrap into [0, 1)
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, s, v];
}

// "HSV (Left To Right)": the hue only decreases, wrapping through 0 -> 1.
function interpolateHueLeftToRight(hs, he, t) {
  const delta = he <= hs ? he - hs : he - hs - 1; // always <= 0
  const h = hs + delta * t;
  return h - Math.floor(h);
}

// "HSV (Right To Left)": the hue only increases, wrapping through 1 -> 0.
function interpolateHueRightToLeft(hs, he, t) {
  const delta = he >= hs ? he - hs : he - hs + 1; // always >= 0
  const h = hs + delta * t;
  return h - Math.floor(h);
}

const RGB_SPACE = Object.freeze({
  toRgb: (c) => [c[0], c[1], c[2]],
  fromRgb: (rgb) => [rgb[0], rgb[1], rgb[2]],
  interpolate: (a, b, t) => [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ],
});

const HSV_SPACE = Object.freeze({
  toRgb: hsvToRgb,
  fromRgb: rgbToHsv,
  interpolate: (a, b, t) => [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ],
});

const HSV_LTR_SPACE = Object.freeze({
  toRgb: hsvToRgb,
  fromRgb: rgbToHsv,
  interpolate: (a, b, t) => [
    interpolateHueLeftToRight(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ],
});

const HSV_RTL_SPACE = Object.freeze({
  toRgb: hsvToRgb,
  fromRgb: rgbToHsv,
  interpolate: (a, b, t) => [
    interpolateHueRightToLeft(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ],
});

/**
 * Supported colour spaces for V1. CIE / XYZ spaces are deliberately absent:
 * a marker that references one becomes `valid: false` (see the module
 * header). Adding them later means adding frozen entries here; the public
 * API does not change.
 */
export const COLOUR_SPACES = Object.freeze({
  RGB: RGB_SPACE,
  HSV: HSV_SPACE,
  "HSV (Left To Right)": HSV_LTR_SPACE,
  "HSV (Right To Left)": HSV_RTL_SPACE,
});

const HSV_FAMILY = new Set([
  "HSV",
  "HSV (Left To Right)",
  "HSV (Right To Left)",
]);

function convertEndpoint(components, fromSpace, toSpace) {
  if (fromSpace === toSpace) return [components[0], components[1], components[2]];
  // The three HSV variants share one representation; only the interpolation
  // path differs, so no conversion is needed between them.
  if (HSV_FAMILY.has(fromSpace) && HSV_FAMILY.has(toSpace)) {
    return [components[0], components[1], components[2]];
  }
  const rgb = COLOUR_SPACES[fromSpace].toRgb(components);
  return COLOUR_SPACES[toSpace].fromRgb(rgb);
}

// Matt's per-channel ramp-curve transforms, on the final RGB in 0..1.
// sqrt rounds (`+ 0.5`); s-curve truncates (matching static_cast<unsigned char>).
function applySqrt(x) {
  return Math.min(255, Math.floor(Math.sqrt(clamp01(x)) * 255 + 0.5)) / 255;
}

function applySCurve(x) {
  return (
    Math.min(255, Math.floor(127.5 * (1 + Math.cos((1 - clamp01(x)) * Math.PI)))) /
    255
  );
}

function safeLog10(x) {
  return x > 0 ? Math.log10(x) : NaN;
}

function clampToRange(v, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return v;
  return v < min ? min : v > max ? max : v;
}

// ---------------------------------------------------------------------------
// Ramp CSV parsing
// ---------------------------------------------------------------------------

const REQUIRED_RAMP_COLUMNS = [
  "Up to",
  "Start Colour (H)",
  "Start Colour (S)",
  "Start Colour (V)",
  "End Colour (H)",
  "End Colour (S)",
  "End Colour (V)",
  "Colour Ramp",
  "Colour Space",
];

/** Split one CSV line, honouring simple `"..."` quoting (no embedded newlines). */
function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Parse ramp CSV text into raw segments plus structured issues. Never
 * throws. A row is one segment; column values are kept close to verbatim
 * (colour components that fail to parse are preserved as NaN so
 * normalization can reject the marker rather than silently rendering NaN).
 *
 * @param {string} csvText
 * @returns {{ segments: RampSegmentRaw[], errors: object[], warnings: object[] }}
 */
export function parseColourRampCsv(csvText) {
  const errors = [];
  const warnings = [];

  const lines = String(csvText ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    errors.push({ code: "empty-csv", message: "Ramp CSV is empty." });
    return { segments: [], errors, warnings };
  }

  const header = splitCsvLine(lines[0]).map((name) => name.trim());
  const columnIndex = new Map(header.map((name, i) => [name, i]));

  const missing = REQUIRED_RAMP_COLUMNS.filter((name) => !columnIndex.has(name));
  if (missing.length > 0) {
    for (const column of missing) {
      errors.push({
        code: "missing-column",
        message: `Ramp CSV is missing the "${column}" column.`,
        column,
      });
    }
    return { segments: [], errors, warnings };
  }

  if (lines.length === 1) {
    warnings.push({
      code: "no-segments",
      message: "Ramp CSV has a header but no segment rows.",
    });
    return { segments: [], errors, warnings };
  }

  const segments = [];

  for (let lineNo = 1; lineNo < lines.length; lineNo++) {
    const rowNumber = lineNo + 1; // 1-based line number in the file
    const rowIndex = lineNo - 1; // 0-based index among segment rows
    const cells = splitCsvLine(lines[lineNo]);

    // The ramp format has a fixed 15-column layout. A row with too few *or*
    // too many cells is malformed: an unquoted comma in a field would shift
    // every column after it, so extra cells are not silently accepted.
    if (cells.length !== header.length) {
      errors.push({
        code: "ragged-row",
        message: `Ramp row ${rowNumber} has ${cells.length} cells, expected ${header.length}.`,
        row: rowNumber,
      });
      continue;
    }

    const cell = (name) =>
      columnIndex.has(name) ? String(cells[columnIndex.get(name)] ?? "").trim() : "";

    const numericCell = (name, { allowBlank = false, blankValue = NaN } = {}) => {
      const raw = cell(name);
      if (raw === "") {
        if (allowBlank) return blankValue;
        return NaN;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        warnings.push({
          code: "non-numeric-cell",
          message: `Ramp row ${rowNumber}: "${name}" is "${raw}", not a finite number.`,
          row: rowNumber,
          column: name,
        });
      }
      return n;
    };

    const upTo = cell("Up to") === "" ? null : numericCell("Up to");

    const startTransparency = numericCell("Transparency [0..100]", {
      allowBlank: true,
      blankValue: 0,
    });
    // A blank End Transparency inherits the start value (per Matt's spec).
    const endTransparency =
      cell("End Transparency [0..100]") === ""
        ? startTransparency
        : numericCell("End Transparency [0..100]");

    segments.push({
      upTo,
      symbol: cell("Symbol") || null,
      startColour: [
        numericCell("Start Colour (H)"),
        numericCell("Start Colour (S)"),
        numericCell("Start Colour (V)"),
      ],
      endColour: [
        numericCell("End Colour (H)"),
        numericCell("End Colour (S)"),
        numericCell("End Colour (V)"),
      ],
      startColourSpace: cell("Start Colour Colour Space") || "HSV",
      endColourSpace: cell("End Colour Colour Space") || "HSV",
      interpolationSpace: cell("Colour Space") || "HSV",
      rampCurve: cell("Colour Ramp") || "linear",
      numberOfColoursRaw:
        cell("Number of Colours") === "" ? null : numericCell("Number of Colours"),
      startTransparency,
      endTransparency,
      fileRowIndex: rowIndex,
    });
  }

  return { segments, errors, warnings };
}

// ---------------------------------------------------------------------------
// Domain resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the real value range from the marker's configured bounds and the
 * data bounds (either may be null). `source` reports where the range came
 * from; `"unresolved"` means neither could supply it and `min`/`max` are NaN.
 */
export function resolveDomain({ configuredMin, configuredMax, dataMin, dataMax }) {
  const cMin = Number.isFinite(configuredMin) ? configuredMin : null;
  const cMax = Number.isFinite(configuredMax) ? configuredMax : null;
  const dMin = Number.isFinite(dataMin) ? dataMin : null;
  const dMax = Number.isFinite(dataMax) ? dataMax : null;

  const min = cMin ?? dMin;
  const max = cMax ?? dMax;

  if (min === null || max === null) {
    return { min: NaN, max: NaN, source: "unresolved" };
  }
  if (min > max) {
    return { min, max, source: "inverted" };
  }
  if (min === max) {
    return { min, max, source: "degenerate" };
  }
  if (cMin !== null && cMax !== null) return { min, max, source: "configured" };
  if (cMin === null && cMax === null) return { min, max, source: "data" };
  return { min, max, source: "mixed" };
}

/**
 * 0..1 position of `value` within a domain, honouring log scale and an
 * optional 50%-midpoint. Shared with the (future) size-marker module; not
 * used by mapColour, which works segment-locally.
 */
export function normalisePosition(
  value,
  { transform, interpolationMin, interpolationMax, midpoint, domainMin, domainMax }
) {
  const apply = transform === "log10" ? safeLog10 : (x) => x;
  const v = clampToRange(value, domainMin, domainMax);

  if (midpoint != null && Number.isFinite(midpoint)) {
    if (v <= midpoint) {
      const lo = apply(interpolationMin);
      const mid = apply(midpoint);
      return mid === lo ? 0 : 0.5 * ((apply(v) - lo) / (mid - lo));
    }
    const mid = apply(midpoint);
    const hi = apply(interpolationMax);
    return hi === mid ? 0.5 : 0.5 + 0.5 * ((apply(v) - mid) / (hi - mid));
  }

  const lo = apply(interpolationMin);
  const hi = apply(interpolationMax);
  return hi === lo ? 0 : (apply(v) - lo) / (hi - lo);
}

// ---------------------------------------------------------------------------
// Marker normalization
// ---------------------------------------------------------------------------

function makeCanonical(r, g, b, a, extra = {}) {
  return {
    r: clamp01(r),
    g: clamp01(g),
    b: clamp01(b),
    a: clamp01(a),
    symbol: null,
    isNull: false,
    segmentIndex: -1,
    ...extra,
  };
}

function resolveNullColour(raw, nullSymbol) {
  // markers.json gives a bare 3-tuple with no colour space; read it as RGB.
  const ok =
    Array.isArray(raw) &&
    raw.length === 3 &&
    raw.every((c) => Number.isFinite(c));
  const [r, g, b] = ok ? raw : [0, 0, 0];
  return makeCanonical(r, g, b, 1, {
    symbol: nullSymbol ?? null,
    isNull: true,
    segmentIndex: -1,
  });
}

function validateColourComponents(components, endpoint, fileRowIndex, errors) {
  const ok =
    Array.isArray(components) &&
    components.length === 3 &&
    components.every(
      (c) => Number.isFinite(c) && Math.abs(c) <= MAX_COMPONENT_MAGNITUDE
    );
  if (!ok) {
    errors.push({
      code: "invalid-colour-component",
      message: `${
        endpoint === "start" ? "Start" : "End"
      } colour on ramp row (file index ${fileRowIndex}) has a component that is non-finite or out of range.`,
      context: { fileRowIndex, endpoint, components },
    });
    return null;
  }
  return [components[0], components[1], components[2]];
}

// Guard against a colour-space conversion overflowing to a non-finite
// value even though every input component was finite and in range.
function finiteConverted(components, endpoint, fileRowIndex, errors) {
  if (components && components.every((c) => Number.isFinite(c))) return components;
  errors.push({
    code: "invalid-colour-component",
    message: `${
      endpoint === "start" ? "Start" : "End"
    } colour on ramp row (file index ${fileRowIndex}) is non-finite after colour-space conversion.`,
    context: { fileRowIndex, endpoint, components },
  });
  return null;
}

// Transparency policy: a finite value outside 0..100 is clamped with a
// warning; a non-finite value is an error (the marker becomes invalid).
function resolveAlpha(transparency, endpoint, fileRowIndex, errors, warnings) {
  if (!Number.isFinite(transparency)) {
    errors.push({
      code: "invalid-transparency",
      message: `${
        endpoint === "start" ? "Start" : "End"
      } transparency on ramp row (file index ${fileRowIndex}) is not a finite number.`,
      context: { fileRowIndex, endpoint, transparency },
    });
    return NaN;
  }
  let t = transparency;
  if (t < 0 || t > 100) {
    warnings.push({
      code: "transparency-clamped",
      message: `Transparency ${transparency} on ramp row (file index ${fileRowIndex}) is outside 0..100; clamped.`,
      context: { fileRowIndex, endpoint, original: transparency },
    });
    t = Math.min(100, Math.max(0, t));
  }
  return 1 - t / 100;
}

function normaliseNumberFormat(legendDef) {
  const format = {};
  if (legendDef.numberDisplay) format.mode = legendDef.numberDisplay;
  if (legendDef.numberOfDecimals != null) {
    format.decimals = legendDef.numberOfDecimals;
  }
  if (legendDef.significantDigits != null) {
    format.sigDigits = legendDef.significantDigits;
  }
  return format;
}

function splitTitleAndUnits(title) {
  const match = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(title);
  if (match) return { title: match[1].trim(), units: match[2].trim() };
  return { title, units: null };
}

/**
 * Resolve a marker definition + ramp segments into the structure the renderer
 * and legend both consume. Never throws. Any problem that could put a
 * NaN/Infinity in front of the renderer is recorded in `errors` and sets
 * `valid: false`; recoverable problems are `warnings` and rendering still
 * proceeds.
 *
 * The second argument accepts either the bare `segments` array or the whole
 * `parseColourRampCsv()` result. Pass the whole result so its structural
 * `errors` / `warnings` (missing column, ragged row, non-numeric cell) are
 * folded into the marker rather than being lost.
 *
 * @param {object} markerDef  one parsed markers.json entry
 * @param {RampSegmentRaw[] | { segments: RampSegmentRaw[], errors?: object[], warnings?: object[] }} rampSegments
 * @param {{ dataMin?: number, dataMax?: number, showNullColours?: boolean }} [opts]
 * @returns {NormalizedColourMarker}
 */
export function normalizeColourMarker(markerDef, rampSegments, opts = {}) {
  const errors = [];
  const warnings = [];
  const def = markerDef ?? {};

  const parseResult =
    rampSegments && !Array.isArray(rampSegments) && Array.isArray(rampSegments.segments)
      ? rampSegments
      : { segments: Array.isArray(rampSegments) ? rampSegments : [], errors: [], warnings: [] };
  const rawRows = parseResult.segments;

  const foldIssue = (issue) => ({
    code: issue.code,
    message: issue.message,
    context: { source: "ramp-csv", row: issue.row, column: issue.column },
  });
  for (const issue of parseResult.errors ?? []) errors.push(foldIssue(issue));
  for (const issue of parseResult.warnings ?? []) warnings.push(foldIssue(issue));

  if (def.input == null || def.input === "") {
    errors.push({
      code: "missing-required-field",
      message: 'Marker is missing the "input" column name.',
      context: { field: "input" },
    });
  }
  if (rawRows.length === 0) {
    errors.push({ code: "ramp-empty", message: "Marker has no ramp segments." });
  }

  const scale =
    def.scale === "logarithmic"
      ? "logarithmic"
      : def.scale === "date"
        ? "date"
        : "linear";
  const transform = scale === "logarithmic" ? "log10" : "identity";
  const inputType = def.inputType === "date" ? "date" : "number";

  const configuredMin = Number.isFinite(def.minimum) ? def.minimum : null;
  const configuredMax = Number.isFinite(def.maximum) ? def.maximum : null;
  const dataMin = Number.isFinite(opts.dataMin) ? opts.dataMin : null;
  const dataMax = Number.isFinite(opts.dataMax) ? opts.dataMax : null;

  const domain = resolveDomain({ configuredMin, configuredMax, dataMin, dataMax });
  const domainMin = domain.min;
  const domainMax = domain.max;
  const domainUsable = Number.isFinite(domainMin) && Number.isFinite(domainMax);

  if (domain.source === "unresolved") {
    errors.push({
      code: "domain-unresolved",
      message:
        "Cannot determine a value range: no configured minimum/maximum and no valid data bounds.",
      context: { configuredMin, configuredMax, dataMin, dataMax },
    });
  } else if (domain.source === "inverted") {
    errors.push({
      code: "inverted-range",
      message: `Configured minimum (${domainMin}) is greater than maximum (${domainMax}).`,
      context: { domainMin, domainMax },
    });
  } else if (domain.source === "degenerate") {
    warnings.push({
      code: "degenerate-domain",
      message: `Value range is a single point (${domainMin}); the marker renders one colour.`,
    });
  }
  if (
    (configuredMin === null || configuredMax === null) &&
    (domain.source === "data" || domain.source === "mixed")
  ) {
    warnings.push({
      code: "data-derived-bound",
      message: "One or both domain bounds were taken from the data range.",
    });
  }

  if (transform === "log10" && domainUsable && !(domainMin > 0)) {
    errors.push({
      code: "log-domain-nonpositive",
      message: `Logarithmic scale needs a positive minimum; got ${domainMin}.`,
      context: { domainMin },
    });
  }

  const midpoint = Number.isFinite(def.midpoint) ? def.midpoint : null;
  const thresholdsArePercentages = def.thresholdsArePercentages === true;
  const balanceMinimumAndMaximum = def.balanceMinimumAndMaximum === true;

  let interpolationMin = domainMin;
  let interpolationMax = domainMax;
  let balancingUnverified = false;
  if (domainUsable && midpoint != null && balanceMinimumAndMaximum) {
    const halfSpan = Math.max(midpoint - domainMin, domainMax - midpoint);
    if (Number.isFinite(halfSpan) && halfSpan > 0) {
      interpolationMin = midpoint - halfSpan;
      interpolationMax = midpoint + halfSpan;
    }
    if (thresholdsArePercentages) {
      balancingUnverified = true;
      warnings.push({
        code: "balancing-unverified",
        message:
          "Percentage thresholds + midpoint + balancing are not exercised by any known sample; behaviour follows the spec literally and is unverified.",
      });
    }
  }

  if (def.alphaInput != null) {
    warnings.push({
      code: "alpha-input-unsupported",
      message:
        "alphaInput is not implemented; transparency comes only from the ramp's Transparency columns.",
      context: { alphaInput: def.alphaInput },
    });
  }

  const segments = domainUsable
    ? buildSegments(rawRows, {
        domainMin,
        domainMax,
        interpolationMin,
        interpolationMax,
        thresholdsArePercentages,
        transform,
        errors,
        warnings,
      })
    : [];

  const nullColour = resolveNullColour(def.nullColour, def.nullSymbol);

  const legendDef = def.legend ?? {};
  const { title, units } = splitTitleAndUnits(
    String(legendDef.title ?? def.name ?? "")
  );
  const legend = {
    kind: Array.isArray(legendDef.categories) ? "categorical" : "ramp",
    title,
    units,
    numberFormat: normaliseNumberFormat(legendDef),
    dateFormat: legendDef.format ?? null,
    rangeMin: domainMin,
    rangeMax: domainMax,
    stops: [],
    categories: null,
  };

  const valid = errors.length === 0;

  const marker = {
    name: def.name ?? null,
    input: def.input ?? null,
    inputType,
    scale,
    transform,
    configuredMin,
    configuredMax,
    dataMin,
    dataMax,
    domainMin,
    domainMax,
    interpolationMin,
    interpolationMax,
    midpoint,
    thresholdsArePercentages,
    balanceMinimumAndMaximum,
    balancingUnverified,
    nullColour,
    nullSymbol: def.nullSymbol ?? null,
    showNullColours: opts.showNullColours === true,
    segments,
    legend,
    valid,
    errors,
    warnings,
    fallbackColour: { ...MAGENTA },
  };

  if (valid) {
    marker.legend.stops = buildLegendStops(marker);
    if (Array.isArray(legendDef.categories)) {
      marker.legend.categories = legendDef.categories
        .filter((c) => c && Number.isFinite(c.value))
        .map((c) => {
          const colour = mapColour(c.value, marker);
          return {
            value: c.value,
            description: String(c.description ?? ""),
            colour: { r: colour.r, g: colour.g, b: colour.b, a: colour.a },
            symbol: colour.symbol,
          };
        });
    }
  }

  return marker;
}

function buildSegments(
  rawRows,
  {
    domainMin,
    domainMax,
    interpolationMin,
    interpolationMax,
    thresholdsArePercentages,
    transform,
    errors,
    warnings,
  }
) {
  const apply = transform === "log10" ? safeLog10 : (x) => x;

  // Pass 1: resolve every row's upper threshold to an absolute value.
  const resolved = rawRows.map((row) => {
    let resolvedUpTo;
    if (row.upTo === null) {
      resolvedUpTo = domainMax;
    } else if (!Number.isFinite(row.upTo)) {
      resolvedUpTo = NaN;
      errors.push({
        code: "invalid-threshold",
        message: `Ramp row (file index ${row.fileRowIndex}) has a non-finite "Up to" value.`,
        context: { fileRowIndex: row.fileRowIndex, upTo: row.upTo },
      });
    } else if (thresholdsArePercentages) {
      resolvedUpTo =
        interpolationMin + (row.upTo / 100) * (interpolationMax - interpolationMin);
      if (!Number.isFinite(resolvedUpTo)) {
        errors.push({
          code: "invalid-threshold",
          message: `Ramp row (file index ${row.fileRowIndex}) resolves to a non-finite threshold.`,
          context: { fileRowIndex: row.fileRowIndex, upTo: row.upTo },
        });
      }
    } else {
      resolvedUpTo = row.upTo;
    }
    return { row, resolvedUpTo };
  });

  // The customer writes ramp rows with a blank "Up to" first, then strictly
  // descending. Warn only when the file is not in that order, not merely
  // because this module keeps its segments ascending internally.
  const firstRowIsBlank =
    resolved.length === 0 || resolved[0].row.upTo === null;
  const restIsDescending = resolved.every((entry, i) => {
    if (i === 0) return true;
    const prev = resolved[i - 1].resolvedUpTo;
    const cur = entry.resolvedUpTo;
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) return true;
    return cur < prev;
  });
  const fileIsCanonical = firstRowIsBlank && restIsDescending;
  if (!fileIsCanonical) {
    warnings.push({
      code: "ramp-reordered",
      message:
        'Ramp rows were not in canonical order (blank "Up to" first, then descending); they have been re-sorted.',
    });
  }

  // Sort ascending by resolved threshold (non-finite last), stable by file
  // position, then derive bounds/ownership/indices from the sorted order.
  const sorted = resolved
    .map((entry, originalPos) => ({ ...entry, originalPos }))
    .sort((a, b) => {
      const av = Number.isFinite(a.resolvedUpTo) ? a.resolvedUpTo : Infinity;
      const bv = Number.isFinite(b.resolvedUpTo) ? b.resolvedUpTo : Infinity;
      if (av !== bv) return av - bv;
      return a.row.fileRowIndex - b.row.fileRowIndex;
    });

  for (let i = 1; i < sorted.length; i++) {
    if (
      Number.isFinite(sorted[i].resolvedUpTo) &&
      sorted[i].resolvedUpTo === sorted[i - 1].resolvedUpTo
    ) {
      warnings.push({
        code: "duplicate-threshold",
        message: `Two ramp rows resolve to the same threshold (${sorted[i].resolvedUpTo}); the higher-indexed segment is unreachable.`,
        context: { threshold: sorted[i].resolvedUpTo },
      });
    }
  }

  return sorted.map((entry, i) => {
    const { row } = entry;
    const upperBoundRaw = entry.resolvedUpTo;
    const lowerBoundRaw = i === 0 ? domainMin : sorted[i - 1].resolvedUpTo;

    const startColour = validateColourComponents(
      row.startColour,
      "start",
      row.fileRowIndex,
      errors
    );
    const endColour = validateColourComponents(
      row.endColour,
      "end",
      row.fileRowIndex,
      errors
    );

    const startAlpha = resolveAlpha(
      row.startTransparency,
      "start",
      row.fileRowIndex,
      errors,
      warnings
    );
    const endAlpha = resolveAlpha(
      row.endTransparency,
      "end",
      row.fileRowIndex,
      errors,
      warnings
    );

    const interpolationSpace = String(row.interpolationSpace ?? "HSV").trim();
    const startSpace = String(row.startColourSpace ?? "HSV").trim();
    const endSpace = String(row.endColourSpace ?? "HSV").trim();

    let convertedStart = null;
    let convertedEnd = null;
    if (!COLOUR_SPACES[interpolationSpace]) {
      errors.push({
        code: "unsupported-colour-space",
        message: `Interpolation colour space "${row.interpolationSpace}" is not supported.`,
        context: {
          space: row.interpolationSpace,
          endpoint: "interpolation",
          fileRowIndex: row.fileRowIndex,
        },
      });
    }
    if (!COLOUR_SPACES[startSpace]) {
      errors.push({
        code: "unsupported-colour-space",
        message: `Start colour space "${row.startColourSpace}" is not supported.`,
        context: {
          space: row.startColourSpace,
          endpoint: "start",
          fileRowIndex: row.fileRowIndex,
        },
      });
    }
    if (!COLOUR_SPACES[endSpace]) {
      errors.push({
        code: "unsupported-colour-space",
        message: `End colour space "${row.endColourSpace}" is not supported.`,
        context: {
          space: row.endColourSpace,
          endpoint: "end",
          fileRowIndex: row.fileRowIndex,
        },
      });
    }
    if (COLOUR_SPACES[interpolationSpace] && COLOUR_SPACES[startSpace] && startColour) {
      convertedStart = finiteConverted(
        convertEndpoint(startColour, startSpace, interpolationSpace),
        "start",
        row.fileRowIndex,
        errors
      );
    }
    if (COLOUR_SPACES[interpolationSpace] && COLOUR_SPACES[endSpace] && endColour) {
      convertedEnd = finiteConverted(
        convertEndpoint(endColour, endSpace, interpolationSpace),
        "end",
        row.fileRowIndex,
        errors
      );
    }

    let rampCurve = String(row.rampCurve ?? "linear").toLowerCase().trim();
    if (!RAMP_CURVES.includes(rampCurve)) {
      warnings.push({
        code: "unknown-ramp-curve",
        message: `Unknown "Colour Ramp" value "${row.rampCurve}"; treating as "linear".`,
        context: { fileRowIndex: row.fileRowIndex, value: row.rampCurve },
      });
      rampCurve = "linear";
    }

    let colourResolution;
    let steps = null;
    if (rampCurve === "none") {
      colourResolution = "startOnly";
    } else if (row.numberOfColoursRaw === 1) {
      colourResolution = "startOnly";
    } else if (
      Number.isFinite(row.numberOfColoursRaw) &&
      row.numberOfColoursRaw >= 2
    ) {
      colourResolution = "stepped";
      steps = Math.floor(row.numberOfColoursRaw);
    } else {
      colourResolution = "continuous";
      warnings.push({
        code: "numberOfColours-missing",
        message: `Ramp row (file index ${row.fileRowIndex}) has no usable "Number of Colours"; interpolating continuously.`,
        context: { fileRowIndex: row.fileRowIndex },
      });
    }

    const lowerBoundT = Number.isFinite(lowerBoundRaw) ? apply(lowerBoundRaw) : NaN;
    const upperBoundT = Number.isFinite(upperBoundRaw) ? apply(upperBoundRaw) : NaN;
    if (!Number.isFinite(lowerBoundT) || !Number.isFinite(upperBoundT)) {
      errors.push({
        code: "invalid-threshold",
        message: `Ramp row (file index ${row.fileRowIndex}) has non-finite transformed bounds.`,
        context: { fileRowIndex: row.fileRowIndex, lowerBoundRaw, upperBoundRaw },
      });
    }

    return {
      index: i,
      lowerBoundRaw,
      upperBoundRaw,
      lowerBoundT,
      upperBoundT,
      ownsLowerBound: i === 0,
      ownsUpperBound: true,
      startColour: convertedStart ?? [NaN, NaN, NaN],
      endColour: convertedEnd ?? [NaN, NaN, NaN],
      interpolationSpace,
      rampCurve,
      colourResolution,
      steps,
      startAlpha,
      endAlpha,
      symbol: row.symbol ?? null,
      fileRowIndex: row.fileRowIndex,
    };
  });
}

function buildLegendStops(marker) {
  const stops = [];
  const boundaries = [];
  for (const segment of marker.segments) {
    boundaries.push(segment.lowerBoundRaw);
  }
  if (marker.segments.length > 0) {
    boundaries.push(marker.segments[marker.segments.length - 1].upperBoundRaw);
  }
  for (const value of boundaries) {
    const colour = mapColour(value, marker);
    stops.push({
      value,
      colour: { r: colour.r, g: colour.g, b: colour.b, a: colour.a },
    });
  }
  return stops;
}

// ---------------------------------------------------------------------------
// Value -> colour
// ---------------------------------------------------------------------------

/**
 * Map one input value to a canonical colour. Never throws. Returns
 * `marker.fallbackColour` (magenta, all components finite) when the marker
 * is invalid.
 *
 * @param {number|string|null|undefined} value
 * @param {NormalizedColourMarker} marker
 * @returns {CanonicalColour}
 */
export function mapColour(value, marker) {
  const fallback =
    marker && marker.fallbackColour ? { ...marker.fallbackColour } : { ...MAGENTA };

  if (!marker || marker.valid === false) return fallback;

  const nullResult = () => ({
    r: marker.nullColour.r,
    g: marker.nullColour.g,
    b: marker.nullColour.b,
    a: marker.nullColour.a,
    symbol: marker.nullSymbol ?? marker.nullColour.symbol ?? null,
    isNull: true,
    segmentIndex: -1,
  });

  if (value === null || value === undefined || value === "") return nullResult();

  let numeric = value;
  if (marker.inputType === "date") {
    numeric = parseCustomerDate(value);
    if (numeric === null) return nullResult();
  }

  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return nullResult();

  const v = clampToRange(numeric, marker.domainMin, marker.domainMax);

  const segments = marker.segments;
  if (!segments || segments.length === 0) return fallback;

  let segment = null;
  for (const candidate of segments) {
    if (v <= candidate.upperBoundRaw) {
      segment = candidate;
      break;
    }
  }
  if (segment === null) segment = segments[segments.length - 1];

  const apply = marker.transform === "log10" ? safeLog10 : (x) => x;
  let tRaw;
  if (segment.upperBoundT === segment.lowerBoundT) {
    tRaw = 0;
  } else {
    tRaw =
      (apply(v) - segment.lowerBoundT) /
      (segment.upperBoundT - segment.lowerBoundT);
  }
  tRaw = clamp01(tRaw);

  const space = COLOUR_SPACES[segment.interpolationSpace];
  let rgb;
  if (segment.colourResolution === "startOnly") {
    rgb = space.toRgb(segment.startColour);
  } else {
    let tColour = tRaw;
    if (segment.colourResolution === "stepped" && segment.steps >= 2) {
      tColour = Math.round(tRaw * (segment.steps - 1)) / (segment.steps - 1);
    }
    const interpolated = space.interpolate(
      segment.startColour,
      segment.endColour,
      tColour
    );
    rgb = space.toRgb(interpolated);
  }

  if (segment.rampCurve === "sqrt") {
    rgb = [applySqrt(rgb[0]), applySqrt(rgb[1]), applySqrt(rgb[2])];
  } else if (segment.rampCurve === "s-curve") {
    rgb = [applySCurve(rgb[0]), applySCurve(rgb[1]), applySCurve(rgb[2])];
  }

  // Alpha: continuous position, never quantised, never curved.
  const alpha =
    segment.startAlpha + (segment.endAlpha - segment.startAlpha) * tRaw;

  // Last line of defence: if anything upstream produced a non-finite value
  // despite a "valid" marker, return the fallback (which is a visible signal)
  // rather than clamp it silently to black.
  if (![rgb[0], rgb[1], rgb[2], alpha].every((n) => Number.isFinite(n))) {
    return fallback;
  }

  return {
    r: clamp01(rgb[0]),
    g: clamp01(rgb[1]),
    b: clamp01(rgb[2]),
    a: clamp01(alpha),
    symbol: segment.symbol ?? null,
    isNull: false,
    segmentIndex: segment.index,
  };
}

// ---------------------------------------------------------------------------
// UI helpers (derived views of a CanonicalColour, never stored)
// ---------------------------------------------------------------------------

function toByte(x) {
  return Math.round(clamp01(x) * 255);
}

export function toHex(colour) {
  return (
    "#" +
    [colour.r, colour.g, colour.b]
      .map((c) => toByte(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function toCssRgba(colour) {
  return `rgba(${toByte(colour.r)}, ${toByte(colour.g)}, ${toByte(colour.b)}, ${
    Number.isFinite(colour.a) ? colour.a : 1
  })`;
}
