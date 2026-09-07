// Size mapping for mXrap point markers.
//
// The companion to colourMapping.js. A "size marker" (a `type: "size"` entry
// in a marker-defs markers.json) maps one point attribute to a marker size.
// The series' config.json supplies the output range: `sizeMinimum` is the
// size drawn for the marker's minimum input value, `sizeMaximum` for the
// maximum, and `nullSizes` for a null input. When a series has no
// `sizeMarker`, every point gets the midpoint of sizeMinimum / sizeMaximum
// (per Matt's spec).
//
// The number this produces is `mx_pointSize` for the vertex shader in
// pointsBuilder.js / pointSizing.js; the distance-attenuation stage runs on
// top of it and is unchanged.
//
// Pure: no `three` import, no file IO. Reuses resolveDomain /
// normalisePosition from colourMapping.js for the value -> 0..1 step.
//
// Numeric safety mirrors colourMapping: a non-finite output size, an
// unresolvable domain, or a missing input column makes the marker
// `valid: false`, and mapSize returns an explicit finite fallback rather
// than letting NaN / Infinity reach the point-size attribute.

import { resolveDomain, normalisePosition } from "./colourMapping";
import { parseCustomerDate } from "./customerDate";

const DEFAULT_FALLBACK_SIZE = 1;

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function firstFinite(...candidates) {
  for (const c of candidates) if (Number.isFinite(c)) return c;
  return DEFAULT_FALLBACK_SIZE;
}

/**
 * @param {object|null} markerDef  the `type: "size"` markers.json entry, or
 *   null when the series has no size marker selected
 * @param {object} series  the series config: sizeMarker, sizeMinimum,
 *   sizeMaximum, nullSizes
 * @param {{ dataMin?: number, dataMax?: number }} [opts]  data bounds for the
 *   marker's input column, used when markerDef omits minimum/maximum
 * @returns {NormalizedSizeMarker}
 */
export function normalizeSizeMarker(markerDef, series, opts = {}) {
  const errors = [];
  const warnings = [];
  const s = series ?? {};

  let sizeMinimum = Number.isFinite(s.sizeMinimum) ? s.sizeMinimum : NaN;
  let sizeMaximum = Number.isFinite(s.sizeMaximum) ? s.sizeMaximum : NaN;
  const rawNullSize = Number.isFinite(s.nullSizes) ? s.nullSizes : NaN;

  if (!Number.isFinite(sizeMinimum) || !Number.isFinite(sizeMaximum)) {
    errors.push({
      code: "invalid-output-size",
      message: "sizeMinimum / sizeMaximum must be finite numbers.",
      context: { sizeMinimum: s.sizeMinimum, sizeMaximum: s.sizeMaximum },
    });
  } else if (sizeMinimum > sizeMaximum) {
    warnings.push({
      code: "output-size-reordered",
      message: `sizeMinimum (${sizeMinimum}) is greater than sizeMaximum (${sizeMaximum}); swapped.`,
    });
    [sizeMinimum, sizeMaximum] = [sizeMaximum, sizeMinimum];
  }

  const midpointSize =
    Number.isFinite(sizeMinimum) && Number.isFinite(sizeMaximum)
      ? (sizeMinimum + sizeMaximum) / 2
      : NaN;

  if (!Number.isFinite(rawNullSize)) {
    warnings.push({
      code: "null-size-missing",
      message: "nullSizes is not a finite number; using the size-range midpoint for null inputs.",
    });
  }
  const nullSize = Number.isFinite(rawNullSize) ? rawNullSize : midpointSize;
  const fallbackSize = firstFinite(nullSize, midpointSize, sizeMinimum);

  // No size marker selected: constant size everywhere.
  if (markerDef == null || s.sizeMarker == null) {
    const valid = errors.length === 0 && Number.isFinite(midpointSize);
    return {
      kind: "constant",
      size: Number.isFinite(midpointSize) ? midpointSize : DEFAULT_FALLBACK_SIZE,
      nullSize: Number.isFinite(nullSize) ? nullSize : DEFAULT_FALLBACK_SIZE,
      sizeMinimum,
      sizeMaximum,
      valid,
      errors,
      warnings,
      fallbackSize,
    };
  }

  const def = markerDef;
  const scale =
    def.scale === "logarithmic"
      ? "logarithmic"
      : def.scale === "date"
        ? "date"
        : "linear";
  const transform = scale === "logarithmic" ? "log10" : "identity";
  const inputType = def.inputType === "date" ? "date" : "number";

  if (def.input == null || def.input === "") {
    errors.push({
      code: "missing-required-field",
      message: 'Size marker is missing the "input" column name.',
      context: { field: "input" },
    });
  }

  const domain = resolveDomain({
    configuredMin: Number.isFinite(def.minimum) ? def.minimum : null,
    configuredMax: Number.isFinite(def.maximum) ? def.maximum : null,
    dataMin: Number.isFinite(opts.dataMin) ? opts.dataMin : null,
    dataMax: Number.isFinite(opts.dataMax) ? opts.dataMax : null,
  });

  if (domain.source === "unresolved") {
    errors.push({
      code: "domain-unresolved",
      message:
        "Cannot determine the size marker's value range: no configured minimum/maximum and no valid data bounds.",
      context: { input: def.input },
    });
  } else if (domain.source === "inverted") {
    errors.push({
      code: "inverted-range",
      message: `Size marker minimum (${domain.min}) is greater than maximum (${domain.max}).`,
      context: { min: domain.min, max: domain.max },
    });
  } else if (domain.source === "degenerate") {
    warnings.push({
      code: "degenerate-domain",
      message: `Size marker value range is a single point (${domain.min}); every point gets sizeMinimum.`,
    });
  }

  if (
    transform === "log10" &&
    Number.isFinite(domain.min) &&
    !(domain.min > 0)
  ) {
    errors.push({
      code: "log-domain-nonpositive",
      message: `Logarithmic size scale needs a positive minimum; got ${domain.min}.`,
      context: { domainMin: domain.min },
    });
  }

  return {
    kind: "mapped",
    input: def.input ?? null,
    inputType,
    scale,
    transform,
    domainMin: domain.min,
    domainMax: domain.max,
    sizeMinimum,
    sizeMaximum,
    nullSize: Number.isFinite(nullSize) ? nullSize : midpointSize,
    valid: errors.length === 0,
    errors,
    warnings,
    fallbackSize,
  };
}

/**
 * Map one input value to a marker size (world units). Never throws, never
 * returns a non-finite number. An invalid marker returns `fallbackSize`; a
 * null / unparseable input returns `nullSize`.
 *
 * @param {number|string|null|undefined} value
 * @param {NormalizedSizeMarker} sizeMarker
 * @returns {number}
 */
export function mapSize(value, sizeMarker) {
  const fallback =
    sizeMarker && Number.isFinite(sizeMarker.fallbackSize)
      ? sizeMarker.fallbackSize
      : DEFAULT_FALLBACK_SIZE;

  if (!sizeMarker || sizeMarker.valid === false) return fallback;

  if (sizeMarker.kind === "constant") {
    return Number.isFinite(sizeMarker.size) ? sizeMarker.size : fallback;
  }

  const nullSize = Number.isFinite(sizeMarker.nullSize)
    ? sizeMarker.nullSize
    : fallback;

  if (value === null || value === undefined || value === "") return nullSize;

  let numeric = value;
  if (sizeMarker.inputType === "date") {
    numeric = parseCustomerDate(value);
    if (numeric === null) return nullSize;
  }
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return nullSize;

  const { domainMin, domainMax, sizeMinimum, sizeMaximum, transform } = sizeMarker;
  const position = clamp01(
    normalisePosition(numeric, {
      transform,
      interpolationMin: domainMin,
      interpolationMax: domainMax,
      midpoint: null,
      domainMin,
      domainMax,
    })
  );

  const size = sizeMinimum + position * (sizeMaximum - sizeMinimum);
  return Number.isFinite(size) ? size : fallback;
}
