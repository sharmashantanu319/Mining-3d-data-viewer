// Pure data-shaping for a chart series: join a series' primary CSV rows
// with its "data-additional" CSVs by ID, keep only the rows selected by the
// series' filter column, order/group the result for line drawing, and
// resolve each axis' plotted range.
//
// No file IO and no rendering here — parseExportFile.js loads the CSVs
// (readCsv, via the zip), and the chart view turns this into pixels. This
// mirrors dataFilters.js/colourMapping.js: pure functions the parser and
// the UI both call, testable without a browser or a zip.

import { parseCustomerDate } from "./customerDate";

/**
 * Joins a series' primary rows with each of its "data-additional" row sets
 * by "ID", merging every additional set's columns onto the matching primary
 * row. A primary row with no match in a given additional set keeps its
 * existing columns for that set rather than failing the whole join — the
 * export's own convention (see chart-module-scoping.md) is that IDs line up
 * exactly, but one gap in an extra file shouldn't drop real data.
 *
 * @param {object[]} primaryRows
 * @param {object[][]} additionalRowSets
 * @returns {object[]}
 */
export function joinChartRows(primaryRows, additionalRowSets) {
  const primary = Array.isArray(primaryRows) ? primaryRows : [];
  const sets = Array.isArray(additionalRowSets) ? additionalRowSets : [];
  if (sets.length === 0) return primary;

  const indexes = sets.map((rows) => {
    const byId = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && row.ID !== undefined && row.ID !== null) byId.set(row.ID, row);
    }
    return byId;
  });

  return primary.map((row) => {
    let merged = row;
    for (const byId of indexes) {
      const extra = byId.get(row?.ID);
      if (extra) merged = { ...merged, ...extra };
    }
    return merged;
  });
}

/**
 * Keeps rows whose `filterColumn` reads as 1 — the export's own convention
 * for "this row belongs to this series" (see s1-events-mag-time.csv's
 * AboveThreshold/BelowThreshold columns). No filter column means every row
 * belongs to the series.
 *
 * @param {object[]} rows
 * @param {string|null} filterColumn
 * @returns {object[]}
 */
export function filterChartRows(rows, filterColumn) {
  const source = Array.isArray(rows) ? rows : [];
  if (!filterColumn) return source;
  return source.filter((row) => Number(row?.[filterColumn]) === 1);
}

/**
 * Reads one row's value for an axis column, converting to epoch
 * milliseconds when the axis scale is "datetime". Returns null for a
 * missing/unparseable value so the caller can drop the row instead of
 * plotting a wrong point.
 *
 * @param {object} row
 * @param {string} column
 * @param {"datetime"|"linear"|"log10"} scale
 * @returns {number|null}
 */
export function readAxisValue(row, column, scale) {
  const raw = row?.[column];
  if (scale === "datetime") return parseCustomerDate(raw);
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extracts one series' plotted rows into parallel X/Y column arrays (plus
 * the source row each point came from, for ordering/grouping), dropping any
 * row whose X or Y value doesn't resolve for the axis it's plotted against.
 * Columns, not row objects, so a large series stays cheap to hold.
 *
 * @param {object[]} rows
 * @param {{axisX: {side: string, column: string}, axisY: {side: string, column: string}}} series
 * @param {Record<string, {scale: string}>} axes
 * @returns {{x: number[], y: number[], rows: object[]}}
 */
export function buildChartSeriesColumns(rows, series, axes) {
  const xScale = axes?.[series.axisX.side]?.scale ?? "linear";
  const yScale = axes?.[series.axisY.side]?.scale ?? "linear";

  const x = [];
  const y = [];
  const sourceRows = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const xValue = readAxisValue(row, series.axisX.column, xScale);
    const yValue = readAxisValue(row, series.axisY.column, yScale);
    if (xValue === null || yValue === null) continue;
    x.push(xValue);
    y.push(yValue);
    sourceRows.push(row);
  }

  return { x, y, rows: sourceRows };
}

/**
 * Orders a series' columns for line drawing: ascending by X by default, or
 * by the values of `orderColumn` (the series' `linePlotOrder`) when given.
 * Returns new column arrays; does not mutate the input.
 *
 * @param {{x: number[], y: number[], rows: object[]}} columns
 * @param {string|null} [orderColumn]
 * @returns {{x: number[], y: number[], rows: object[]}}
 */
export function orderChartColumns(columns, orderColumn) {
  const indices = columns.x.map((_, i) => i);

  if (orderColumn) {
    indices.sort((a, b) => {
      const av = columns.rows[a]?.[orderColumn];
      const bv = columns.rows[b]?.[orderColumn];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return av < bv ? -1 : 1;
    });
  } else {
    indices.sort((a, b) => columns.x[a] - columns.x[b]);
  }

  return {
    x: indices.map((i) => columns.x[i]),
    y: indices.map((i) => columns.y[i]),
    rows: indices.map((i) => columns.rows[i]),
  };
}

/**
 * Splits an ordered set of columns into one or more lines by the values of
 * `groupByColumns`. No columns to group by returns the whole set as a
 * single line with a null key, matching the sample export's ungrouped
 * cumulative-events series.
 *
 * @param {{x: number[], y: number[], rows: object[]}} columns
 * @param {string[]} groupByColumns
 * @returns {{key: string|null, x: number[], y: number[], rows: object[]}[]}
 */
export function groupChartColumns(columns, groupByColumns) {
  if (!Array.isArray(groupByColumns) || groupByColumns.length === 0) {
    return [{ key: null, x: columns.x, y: columns.y, rows: columns.rows }];
  }

  const groups = new Map();
  columns.rows.forEach((row, i) => {
    const key = groupByColumns.map((column) => row?.[column]).join("\u0000");
    if (!groups.has(key)) groups.set(key, { key, x: [], y: [], rows: [] });
    const group = groups.get(key);
    group.x.push(columns.x[i]);
    group.y.push(columns.y[i]);
    group.rows.push(row);
  });
  return [...groups.values()];
}

/**
 * The value range one or more series' columns cover for a given axis scale.
 * `log10` drops non-positive values, the same way a log axis has to, and
 * returns null when nothing usable remains.
 *
 * @param {number[][]} valueArrays
 * @param {"datetime"|"linear"|"log10"} scale
 * @returns {{min: number, max: number}|null}
 */
export function computeAxisExtent(valueArrays, scale) {
  let min = Infinity;
  let max = -Infinity;
  for (const values of Array.isArray(valueArrays) ? valueArrays : []) {
    for (const value of Array.isArray(values) ? values : []) {
      if (!Number.isFinite(value)) continue;
      if (scale === "log10" && value <= 0) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/**
 * Resolves every enabled axis' final [min, max] range: the config's fixed
 * minimum/maximum where set, filled in from the data actually plotted
 * against that axis side otherwise. A disabled axis, or an enabled one with
 * no fixed bounds and no data, resolves to null (nothing to plot on it).
 *
 * @param {Record<string, {enabled: boolean, scale: string, minimum: number|null, maximum: number|null}>} axes
 * @param {{axisX: {side: string}, axisY: {side: string}, points: {x: number[], y: number[]}}[]} seriesList
 * @returns {Record<string, {min: number, max: number}|null>}
 */
export function computeChartAxisRanges(axes, seriesList) {
  const ranges = {};
  const series = Array.isArray(seriesList) ? seriesList : [];

  for (const [side, axis] of Object.entries(axes ?? {})) {
    if (!axis?.enabled) {
      ranges[side] = null;
      continue;
    }

    const valueArrays = [];
    for (const s of series) {
      if (s.axisX?.side === side) valueArrays.push(s.points?.x ?? []);
      if (s.axisY?.side === side) valueArrays.push(s.points?.y ?? []);
    }
    const dataExtent = computeAxisExtent(valueArrays, axis.scale);

    const min = Number.isFinite(axis.minimum) ? axis.minimum : dataExtent?.min ?? null;
    const max = Number.isFinite(axis.maximum) ? axis.maximum : dataExtent?.max ?? null;
    ranges[side] = min === null && max === null ? null : { min, max };
  }

  return ranges;
}

/**
 * Axis ranges for what a chart is drawing now, as the client showed mXrap
 * doing in the 24 September meeting:
 * - each axis fits the series currently drawn against it, so turning a
 *   series off lets the axis close in on the rest (a nice-to-have);
 * - an axis none of whose series is drawn is hidden (null): with the
 *   cumulative events line off, its right-hand axis "disappears completely",
 *   fixed bounds or not.
 * A fixed minimum or maximum from the export always stays, and an axis whose
 * drawn series have no usable values keeps its full range.
 *
 * @param {Record<string, {enabled: boolean, scale: string, minimum: number|null, maximum: number|null}>} axes
 * @param {object[]} seriesList every series of the chart
 * @param {boolean[]} drawn whether each series is drawn now
 * @param {Record<string, {min: number, max: number}|null>} fullRanges the
 *   ranges with every series (the chart's axisRanges)
 * @returns {Record<string, {min: number, max: number}|null>} null for a
 *   disabled or hidden axis
 */
export function computeVisibleAxisRanges(axes, seriesList, drawn, fullRanges) {
  const series = (Array.isArray(seriesList) ? seriesList : []).filter((_, index) => drawn?.[index] === true);
  const ranges = computeChartAxisRanges(axes, series);
  for (const side of Object.keys(ranges)) {
    const inUse = series.some((s) => s.axisX?.side === side || s.axisY?.side === side);
    if (!inUse) {
      ranges[side] = null;
      continue;
    }
    const range = ranges[side];
    if (!Number.isFinite(range?.min) || !Number.isFinite(range?.max)) ranges[side] = fullRanges?.[side] ?? null;
  }
  return ranges;
}

// Share of an axis' span left free beyond the data at each end the data
// sets, so the points at the very top or bottom of a chart are drawn whole
// instead of being cut in half by the edge of the plot.
export const CHART_DATA_MARGIN = 0.05;

/**
 * An axis range with a little room beyond the data. Each end that comes from
 * the data moves out by `fraction` of the span (on a log10 axis, by that
 * fraction of the span in powers of ten). An end fixed in the export stays
 * exactly where it is, and a flat or missing range is returned unchanged.
 *
 * @param {{min: number, max: number}|null} range
 * @param {{scale?: string, minimum?: number|null, maximum?: number|null}} axis
 * @param {number} [fraction]
 * @returns {{min: number, max: number}|null}
 */
export function addDataMargins(range, axis, fraction = CHART_DATA_MARGIN) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || !(range.max > range.min)) return range;
  const padMin = !Number.isFinite(axis?.minimum);
  const padMax = !Number.isFinite(axis?.maximum);
  if (axis?.scale === "log10") {
    if (!(range.min > 0)) return range;
    const factor = (range.max / range.min) ** fraction;
    return { min: padMin ? range.min / factor : range.min, max: padMax ? range.max * factor : range.max };
  }
  const pad = (range.max - range.min) * fraction;
  return { min: padMin ? range.min - pad : range.min, max: padMax ? range.max + pad : range.max };
}
