// Resolves the colours a chart series is drawn with, reusing the 3D points'
// colour-marker pipeline (pointMarkerResolver.js / colourMapping.js) so a
// chart point and the same event in the 3D view share one colour legend.
//
// Pure: takes the parsed chart series, returns CSS colour strings. No canvas.

import { resolveColourMarker } from "./pointMarkerResolver";
import { mapColour, toCssRgba } from "./colourMapping";

export const DEFAULT_CHART_POINT_COLOUR = "rgb(120, 144, 156)";
export const DEFAULT_CHART_LINE_COLOUR = "rgb(0, 0, 127)";

/**
 * One CSS colour per plotted point of the series (same order as
 * `series.points.x`), or null when the series has no usable colour marker
 * (the caller then draws every point in a single default colour).
 * Points with a null input value follow the marker's own null colour; they
 * are dropped (colour "transparent") when the series hides null colours.
 *
 * @param {object} series  a parsed chart series
 * @returns {string[]|null}
 */
export function resolveChartPointColours(series) {
  const rows = series?.points?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || !series.colourMarker) return null;
  if (!Array.isArray(series.markerDefinitions) || series.markerDefinitions.length === 0) return null;

  const marker = resolveColourMarker({
    markerDefinitions: series.markerDefinitions,
    colourMarker: series.colourMarker,
    points: rows,
    showNullColours: series.showNullColours === true,
  });
  if (!marker?.valid) return null;

  return rows.map((row) => {
    const colour = mapColour(row?.[marker.input], marker);
    if (colour.isNull && series.showNullColours !== true) return "transparent";
    return toCssRgba(colour);
  });
}

/**
 * The colour a series' line is drawn with: the export's fixed override
 * colour when it gives one, otherwise the default line colour.
 *
 * @param {object} series
 * @returns {string}
 */
export function resolveChartLineColour(series) {
  const override = series?.lineOverrideColour;
  return typeof override === "string" && override.trim() !== ""
    ? override
    : DEFAULT_CHART_LINE_COLOUR;
}
