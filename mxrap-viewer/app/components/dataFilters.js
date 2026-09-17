// Data-series filters for mXrap point series.
//
// A "filter" narrows which points of a series count as visible, based on one
// attribute (a column from the series' per-point marker data — magnitude,
// date, material, etc; the same properties buildPointCloud/mapColour already
// read off each point object). Two kinds are supported:
//
//   * range    — numeric or date attribute; a point passes when its value
//     falls within [min, max] (inclusive). Either bound may be omitted to
//     leave that side unbounded. Date values are read through
//     parseCustomerDate first, same as colourMapping's date handling, so a
//     filter's min/max may be given as epoch milliseconds or as a customer
//     timestamp string.
//   * category — string attribute; a point passes when its value is one of
//     `allowedValues` (compared as strings).
//
// The module is pure: no `three` import, no file IO, no React. Filters are
// created with createRangeFilter/createCategoryFilter, which validate the
// descriptor up front (mirroring colourMapping's normalize-then-apply
// shape) and never throw — a malformed descriptor comes back `valid: false`
// and is treated as inert (matches every point) rather than crashing the
// caller. A value missing from the point, or a date string that fails to
// parse, is treated as "unknown" and excluded unless `includeMissing` is
// set, per customerDate.js's "null == missing" convention.

import { parseCustomerDate } from "./customerDate";

const NON_ANALYTICAL_FIELDS = new Set(["id", "index", "uuid", "guid", "sourceindex"]);

function resolveBound(value, inputType) {
  if (value === null || value === undefined) return null;
  if (inputType === "date") return parseCustomerDate(value);
  return Number.isFinite(value) ? value : null;
}

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

/**
 * @param {object} def
 * @param {string} def.input - point attribute name to read
 * @param {number|string} [def.min] - inclusive lower bound (epoch ms or a
 *   customer date string when inputType is "date")
 * @param {number|string} [def.max] - inclusive upper bound
 * @param {"number"|"date"} [def.inputType]
 * @param {boolean} [def.includeMissing] - whether a missing/unparseable
 *   point value passes the filter (default false)
 * @param {boolean} [def.enabled] - default true; a disabled filter is inert
 * @returns {RangeFilter}
 */
export function createRangeFilter({
  input,
  min,
  max,
  inputType = "number",
  includeMissing = false,
  enabled = true,
} = {}) {
  const errors = [];
  const resolvedInputType = inputType === "date" ? "date" : "number";

  if (!input || typeof input !== "string") {
    errors.push({ code: "missing-input", message: "Range filter is missing the point attribute name." });
  }

  const resolvedMin = resolveBound(min, resolvedInputType);
  const resolvedMax = resolveBound(max, resolvedInputType);

  if (min != null && resolvedMin === null) {
    errors.push({ code: "invalid-bound", message: `Range filter "min" (${min}) could not be resolved.` });
  }
  if (max != null && resolvedMax === null) {
    errors.push({ code: "invalid-bound", message: `Range filter "max" (${max}) could not be resolved.` });
  }
  if (resolvedMin === null && resolvedMax === null) {
    errors.push({ code: "no-bounds", message: "Range filter needs at least one finite bound." });
  }
  if (resolvedMin !== null && resolvedMax !== null && resolvedMin > resolvedMax) {
    errors.push({ code: "inverted-range", message: `min (${resolvedMin}) is greater than max (${resolvedMax}).` });
  }

  return {
    kind: "range",
    input,
    inputType: resolvedInputType,
    min: resolvedMin,
    max: resolvedMax,
    includeMissing,
    enabled,
    valid: errors.length === 0,
    errors,
  };
}

/**
 * @param {object} def
 * @param {string} def.input - point attribute name to read
 * @param {Array<string|number>} def.allowedValues - values (compared as
 *   strings) that pass the filter
 * @param {boolean} [def.includeMissing]
 * @param {boolean} [def.enabled]
 * @returns {CategoryFilter}
 */
export function createCategoryFilter({ input, allowedValues, includeMissing = false, enabled = true } = {}) {
  const errors = [];

  if (!input || typeof input !== "string") {
    errors.push({ code: "missing-input", message: "Category filter is missing the point attribute name." });
  }
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
    errors.push({ code: "no-allowed-values", message: "Category filter needs at least one allowed value." });
  }

  const allowedSet = new Set((Array.isArray(allowedValues) ? allowedValues : []).map(String));

  return {
    kind: "category",
    input,
    allowedValues: allowedSet,
    includeMissing,
    enabled,
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Scan `points` for the min/max of one attribute, for seeding a range
 * filter's bounds from whatever data is actually loaded (mock or real).
 *
 * @param {object[]} points
 * @param {string} input
 * @param {{ inputType?: "number"|"date" }} [opts]
 * @returns {{ min: number, max: number, sampleCount: number }} min/max are
 *   NaN when no point had a usable value for this attribute.
 */
export function getAttributeDomain(points, input, { inputType = "number" } = {}) {
  const resolvedInputType = inputType === "date" ? "date" : "number";
  let min = Infinity;
  let max = -Infinity;
  let sampleCount = 0;

  for (const point of Array.isArray(points) ? points : []) {
    if (!point || typeof point !== "object") continue;
    const value = resolveBound(point[input], resolvedInputType);
    if (value === null) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    sampleCount += 1;
  }

  return sampleCount === 0 ? { min: NaN, max: NaN, sampleCount: 0 } : { min, max, sampleCount };
}

function pointMatchesRangeFilter(point, filter) {
  const raw = point ? point[filter.input] : undefined;
  const value = resolveBound(raw, filter.inputType);
  if (value === null) return filter.includeMissing;
  if (filter.min !== null && value < filter.min) return false;
  if (filter.max !== null && value > filter.max) return false;
  return true;
}

function pointMatchesCategoryFilter(point, filter) {
  const raw = point ? point[filter.input] : undefined;
  if (raw === null || raw === undefined) return filter.includeMissing;
  return filter.allowedValues.has(String(raw));
}

/**
 * Whether one point passes one filter. An invalid or disabled filter is
 * inert (always passes) rather than rejecting every point, so a bad filter
 * degrades to "no filtering" instead of hiding all data.
 *
 * @param {object} point
 * @param {RangeFilter|CategoryFilter} filter
 * @returns {boolean}
 */
export function pointMatchesFilter(point, filter) {
  if (!filter || filter.valid === false || filter.enabled === false) return true;
  if (filter.kind === "range") return pointMatchesRangeFilter(point, filter);
  if (filter.kind === "category") return pointMatchesCategoryFilter(point, filter);
  return true;
}

/**
 * Whether one point passes every filter in `filters` (logical AND).
 *
 * @param {object} point
 * @param {Array<RangeFilter|CategoryFilter>} filters
 * @returns {boolean}
 */
export function pointMatchesFilters(point, filters) {
  if (!Array.isArray(filters) || filters.length === 0) return true;
  return filters.every((filter) => pointMatchesFilter(point, filter));
}

/**
 * Partition a point series by a set of filters.
 *
 * @param {object[]} points
 * @param {Array<RangeFilter|CategoryFilter>} filters
 * @returns {{ included: object[], excluded: object[], totalCount: number, includedCount: number, excludedCount: number }}
 */
export function applyFilters(points, filters) {
  if (!Array.isArray(points)) {
    console.warn("applyFilters: `points` is missing or not an array; returning no points.");
    return { included: [], excluded: [], totalCount: 0, includedCount: 0, excludedCount: 0 };
  }

  const included = [];
  const excluded = [];
  for (const point of points) {
    if (pointMatchesFilters(point, filters)) included.push(point);
    else excluded.push(point);
  }

  return {
    included,
    excluded,
    totalCount: points.length,
    includedCount: included.length,
    excludedCount: excluded.length,
  };
}

/**
 * Apply filters while retaining source indices and deterministic exclusion
 * statistics for the UI. Invalid values take precedence over missing values
 * when a row fails more than one active criterion.
 */
export function applyFiltersWithStats(points, filters) {
  if (!Array.isArray(points)) {
    return {
      included: [],
      sourceIndices: [],
      totalCount: 0,
      visibleCount: 0,
      missingCount: 0,
      invalidCount: 0,
      mismatchCount: 0,
    };
  }

  const activeFilters = (Array.isArray(filters) ? filters : []).filter(
    (filter) => filter?.valid !== false && filter?.enabled !== false
  );
  const included = [];
  const sourceIndices = [];
  let missingCount = 0;
  let invalidCount = 0;
  let mismatchCount = 0;

  points.forEach((point, sourceIndex) => {
    let hasMissing = false;
    let hasInvalid = false;
    let hasMismatch = false;

    for (const filter of activeFilters) {
      const raw = point?.[filter.input];
      if (isMissing(raw)) {
        if (!filter.includeMissing) hasMissing = true;
        continue;
      }

      if (filter.kind === "range") {
        const value = resolveBound(raw, filter.inputType);
        if (value === null) {
          hasInvalid = true;
        } else if (
          (filter.min !== null && value < filter.min) ||
          (filter.max !== null && value > filter.max)
        ) {
          hasMismatch = true;
        }
      } else if (filter.kind === "category" && !filter.allowedValues.has(String(raw))) {
        hasMismatch = true;
      }
    }

    if (!hasInvalid && !hasMissing && !hasMismatch) {
      included.push(point);
      sourceIndices.push(sourceIndex);
    } else if (hasInvalid) {
      invalidCount += 1;
    } else if (hasMissing) {
      missingCount += 1;
    } else {
      mismatchCount += 1;
    }
  });

  return {
    included,
    sourceIndices,
    totalCount: points.length,
    visibleCount: included.length,
    missingCount,
    invalidCount,
    mismatchCount,
  };
}

/** Exclude null marker inputs while retaining filter statistics and indices. */
export function applyNullVisibility(result, markerInput, showNullValues) {
  if (showNullValues || !markerInput) return result;

  const included = [];
  const sourceIndices = [];
  let hiddenNulls = 0;
  result.included.forEach((point, index) => {
    const value = point?.[markerInput];
    if (isMissing(value)) {
      hiddenNulls += 1;
    } else {
      included.push(point);
      sourceIndices.push(result.sourceIndices[index]);
    }
  });

  return {
    ...result,
    included,
    sourceIndices,
    visibleCount: included.length,
    missingCount: result.missingCount + hiddenNulls,
  };
}

/**
 * Infer useful filter controls from one point series. Coordinates and private
 * fields are excluded because they describe geometry rather than attributes.
 */
export function inferFilterFields(points, { maxCategories = 20 } = {}) {
  const rows = Array.isArray(points) ? points.filter((point) => point && typeof point === "object") : [];
  const names = new Set();
  rows.forEach((point) => Object.keys(point).forEach((name) => names.add(name)));

  return [...names]
    .filter((name) => {
      const normalized = name.replace(/[\s_-]/g, "").toLowerCase();
      return (
        !["x", "y", "z"].includes(normalized) &&
        !name.startsWith("_") &&
        !NON_ANALYTICAL_FIELDS.has(normalized)
      );
    })
    .map((input) => {
      const present = rows.map((point) => point[input]).filter((value) => !isMissing(value));
      if (present.length === 0) return null;

      const numericValues = present.filter(Number.isFinite);
      if (numericValues.length > 0 && numericValues.length >= present.length / 2) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        return {
          input,
          label: input,
          kind: "range",
          inputType: "number",
          min,
          max,
          validCount: numericValues.length,
          missingCount: rows.length - present.length,
          invalidCount: present.length - numericValues.length,
        };
      }

      const dateLikeName = /date|time|timestamp/i.test(input);
      const dateValues = dateLikeName
        ? present.map(parseCustomerDate).filter(Number.isFinite)
        : [];
      if (dateValues.length > 0) {
        return {
          input,
          label: input,
          kind: "range",
          inputType: "date",
          min: Math.min(...dateValues),
          max: Math.max(...dateValues),
          validCount: dateValues.length,
          missingCount: rows.length - present.length,
          invalidCount: present.length - dateValues.length,
        };
      }

      const values = [...new Set(present.map(String))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      if (values.length <= maxCategories) {
        return {
          input,
          label: input,
          kind: "category",
          values,
          validCount: present.length,
          missingCount: rows.length - present.length,
          invalidCount: 0,
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}
