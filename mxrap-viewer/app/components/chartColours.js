// Resolves the colours and point sizes a chart series is drawn with, reusing
// the 3D points' marker pipeline (pointMarkerResolver.js / colourMapping.js /
// sizeMapping.js) so a chart point and the same event in the 3D view share
// one legend.
//
// Pure: takes the parsed chart series, returns CSS colours and pixel sizes.
// No canvas.

import { resolveColourMarker, resolveSizeMarker } from "./pointMarkerResolver";
import { mapColour, toCssRgba } from "./colourMapping";
import { mapSize } from "./sizeMapping";
import { isSingleColourDefinition, parseRgbColour } from "./markerSymbols";
import { findMarkerDefinition } from "./markerLookup";

export const DEFAULT_CHART_POINT_COLOUR = "rgb(120, 144, 156)";
export const DEFAULT_CHART_LINE_COLOUR = "rgb(0, 0, 127)";

// Points are drawn this many pixels across when the series has no size
// marker. The 3D view's midpoint-of-the-size-range rule is not applied here:
// the sample export's Magnitude-Time chart gives 10..20 without a size
// marker, and there is no mXrap picture of that chart to say it should have
// 15 px points.
export const DEFAULT_CHART_POINT_DIAMETER = 5;
const MAX_CHART_POINT_DIAMETER = 40;

// mXrap draws charts on white, the viewer on near-black. A black or
// near-black grey line ("rgb(0,0,0)" in the client's response charts) would
// disappear, so it is drawn light grey instead: the same contrast it has in
// mXrap. Coloured lines such as the sample's navy keep their colour.
export const DARK_PLOT_NEUTRAL_LINE_COLOUR = "rgba(201, 209, 207, 0.7)";

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

  // A single-colour marker ("Cross/Grey", "Cross/Green") paints every point
  // its one colour, as it does in the 3D view. It reads no column, so
  // resolveColourMarker has no ramp for it, and the chart used to fall back
  // to the default colour: the sample's grey crosses came out blue-grey.
  const definition = findMarkerDefinition(series.markerDefinitions, series.colourMarker, "colour");
  if (isSingleColourDefinition(definition)) {
    const rgb = parseRgbColour(definition.colour);
    if (!rgb) return null;
    const colour = toCssRgba({ ...rgb, a: 1 });
    return rows.map(() => colour);
  }

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
  if (typeof override !== "string" || override.trim() === "") return DEFAULT_CHART_LINE_COLOUR;
  const rgb = parseRgbColour(override);
  if (rgb) {
    const brightest = Math.max(rgb.r, rgb.g, rgb.b);
    const spread = brightest - Math.min(rgb.r, rgb.g, rgb.b);
    if (brightest < 0.2 && spread < 0.06) return DARK_PLOT_NEUTRAL_LINE_COLOUR;
  }
  return override;
}

/**
 * One diameter in CSS pixels per plotted point (same order as
 * `series.points.x`) from the series' size marker, or null when it has no
 * usable size marker (the caller then draws every point
 * DEFAULT_CHART_POINT_DIAMETER across). The size range is read as pixels
 * across, which matches the client's slide-3 reference picture: its
 * "Event ML" dots (sizes 2 to 15) are about 3 to 15 pixels across.
 *
 * @param {object} series  a parsed chart series
 * @returns {number[]|null}
 */
export function resolveChartPointSizes(series) {
  const rows = series?.points?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || !series.sizeMarker) return null;
  const marker = resolveSizeMarker({ ...series, points: rows });
  if (!marker?.valid || marker.kind !== "mapped") return null;
  return rows.map((row) => Math.min(Math.max(mapSize(row?.[marker.input], marker), 1), MAX_CHART_POINT_DIAMETER));
}

/**
 * Everything the chart canvas colours and sizes each series with: point
 * colours and sizes, the line colour, and each line's own colours when it
 * follows the colour marker (no fixed override colour). ChartView draws with
 * exactly this, so the drawing tests can follow a Marker Style choice all the
 * way to the canvas.
 *
 * @param {object} chart  a parsed chart whose series carry the Marker Style
 *   choices (chartStyle.js applyChartSelections)
 * @returns {{pointColours: string[]|null, pointSizes: number[]|null, lineColour: string, lineColours: (string[]|null)[]}[]}
 */
export function resolveChartSeriesColours(chart) {
  return (chart?.series ?? []).map((series) => {
    const lines = Array.isArray(series?.lines) ? series.lines : [];
    const useLegendLines = !series?.lineOverrideColour && lines.length > 0;
    return {
      pointColours: resolveChartPointColours(series),
      pointSizes: resolveChartPointSizes(series),
      lineColour: resolveChartLineColour(series),
      lineColours: lines.map((line) =>
        useLegendLines ? resolveChartPointColours({ ...series, points: { rows: line.rows } }) : null
      ),
    };
  });
}
