// Marker Style choices for chart series: which colour and size markers a
// chart series can use, and the series as drawn once the user's choices are
// applied.
//
// At the final check-in before handover the client found the chart's points
// all drawn in one colour and asked to colour them by a field (for example
// Trigger ID). The sidebar's "Colour by" only ever drove the 3D point series,
// so a chart could not be recoloured. A chart series carries the same marker
// menu a 3D series does (parseExportFile.js loads its markerDefinitions), so
// the same choices and the same selection shape (markerSelection.js) apply.
// The only difference is where the rows are: a chart series keeps them in
// `points.rows` (chartData.js), a 3D series in `points`.
//
// Pure: no React, no canvas.

import { applyMarkerSelections, getMarkerChoices } from "./markerSelection";

function chartRows(series) {
  return Array.isArray(series?.points?.rows) ? series.points.rows : [];
}

/**
 * The colour and size markers a chart series can be drawn with, checked
 * against the rows the series plots (markerSelection.js's getMarkerChoices).
 *
 * @param {object} series a parsed chart series
 * @param {{colour?: string, size?: string}} [current] the markers selected now
 * @returns {{colour: {name: string, input: string|null}[], size: {name: string, input: string|null}[]}}
 */
export function getChartMarkerChoices(series, current = {}) {
  if (!series) return { colour: [], size: [] };
  return getMarkerChoices(
    {
      markerDefinitions: series.markerDefinitions,
      colourMarker: series.colourMarker,
      sizeMarker: series.sizeMarker,
      points: chartRows(series),
    },
    current
  );
}

/**
 * Each chart series with its Marker Style choices applied: colour marker,
 * size marker, size range and invert (as for 3D points), plus whether points
 * with no value for the colour are drawn (`showNullColours`).
 *
 * @param {object[]} seriesList the chart's series
 * @param {Record<number, object>} selections `{ [seriesIndex]: selection }`
 * @returns {object[]}
 */
export function applyChartSelections(seriesList, selections) {
  const applied = applyMarkerSelections(seriesList, selections);
  return applied.map((series, index) => {
    const selection = selections?.[index];
    if (typeof selection?.showNullColours !== "boolean") return series;
    return { ...series, showNullColours: selection.showNullColours };
  });
}

/**
 * The value a Marker Style setting has for one chart series: the user's
 * choice when they made one, otherwise the export's.
 *
 * @param {object} series a parsed chart series
 * @param {object} selection that series' selection
 * @param {"colourMarker"|"sizeMarker"} key
 * @returns {string} the marker name, or "" for none
 */
export function chartMarkerValue(series, selection, key) {
  if (selection && Object.hasOwn(selection, key)) return selection[key] ?? "";
  return series?.[key] ?? "";
}

/**
 * How many points the chart draws now: the series whose Points switch is on.
 *
 * @param {object[]} seriesList
 * @param {Record<string, boolean>} toggles `{ "<index>:points": on }`
 */
export function countDrawnChartPoints(seriesList, toggles) {
  return (Array.isArray(seriesList) ? seriesList : []).reduce(
    (total, series, index) =>
      total + (series?.enablePoints && toggles?.[`${index}:points`] ? series.points?.x?.length ?? 0 : 0),
    0
  );
}

/**
 * Each series' Points / Lines switches as the export sets them.
 *
 * @param {object} chart a parsed chart
 * @returns {Record<string, boolean>} `{ "<index>:points": on, "<index>:lines": on }`
 */
export function initialChartToggles(chart) {
  const toggles = {};
  (chart?.series ?? []).forEach((series, index) => {
    toggles[`${index}:points`] = series.pointsVisible;
    toggles[`${index}:lines`] = series.linesVisible;
  });
  return toggles;
}
