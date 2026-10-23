// Hovering and clicking chart points, and what the Legend & Details panel
// shows for one: the chart counterpart of the 3D view's point inspection.
//
// Hovering or clicking a chart point shows its details in the Legend & Details
// panel, as the 3D view does for its points. The chart is drawn on a canvas,
// so drawChart (ChartView.jsx) returns where it drew each point, and
// findChartPointAt picks the one under the mouse. chartPointDetails turns
// that point's row into the same sections the 3D view shows (pointDetails.js),
// with the values the chart plots it by listed first.
//
// Pure: no React, no canvas.

import { describePointSeries, groupPointDetails } from "./pointDetails";

// Columns a row may give its position in, for the Location section.
const COORDINATE_COLUMNS = {
  x: ["X", "Location X"],
  y: ["Y", "Location Y"],
  z: ["Z", "Location Z"],
};

const isMissing = (value) =>
  value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value));

/**
 * The drawn point under (x, y), or null. A point counts within a few pixels
 * of its edge, so small dots are easy to hit; when points overlap, the one
 * drawn last (on top) wins.
 *
 * @param {{seriesIndex: number, index: number, x: number, y: number, r: number}[]} targets
 *   the points drawChart drew, in drawing order
 * @param {number} x  canvas pixels from the left
 * @param {number} y  canvas pixels from the top
 * @param {number} [slack]  extra pixels around each point that still count
 * @returns {{seriesIndex: number, index: number, x: number, y: number, r: number}|null}
 */
export function findChartPointAt(targets, x, y, slack = 4) {
  let best = null;
  let bestDistance = Infinity;
  for (const target of Array.isArray(targets) ? targets : []) {
    const distance = Math.hypot(target.x - x, target.y - y);
    if (distance <= Math.max(target.r, 2) + slack && distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What the Legend & Details panel shows for one plotted point of a chart
 * series: the sections of pointDetails.js, with an "On the chart" section
 * after "Colour & size" giving the values the point is plotted at. A column
 * that already sets the colour or size is not repeated there, and a row with
 * no X/Y/Z columns has no Location section.
 *
 * @param {object} series  a chart series, with the Marker Style choices applied
 * @param {number} index  the point's index in `series.points`
 * @returns {{point: object, seriesName: string|null, sections: object[]}|null}
 */
export function chartPointDetails(series, index) {
  const rows = Array.isArray(series?.points?.rows) ? series.points.rows : [];
  const row = rows[index];
  if (!row || typeof row !== "object") return null;

  const description = describePointSeries({ ...series, points: rows });
  const markerColumns = new Set([description.colourInput, description.sizeInput].filter(Boolean));
  const axisColumns = [series.axisX?.column, series.axisY?.column].filter(
    (column, i, all) => column && all.indexOf(column) === i && !markerColumns.has(column)
  );

  const rest = { ...row };
  for (const column of axisColumns) delete rest[column];
  for (const [axis, columns] of Object.entries(COORDINATE_COLUMNS)) {
    const column = columns.find((name) => !isMissing(row[name]));
    const value = column === undefined ? NaN : Number(row[column]);
    if (Number.isFinite(value)) rest[axis] = value;
  }

  const sections = groupPointDetails(rest, description).filter(
    (section) => section.id !== "location" || section.rows.some((sectionRow) => sectionRow.value !== null)
  );
  if (axisColumns.length > 0) {
    const plotted = { id: "plotted", title: "On the chart", rows: axisColumns.map((column) => ({ label: column, value: row[column] })) };
    sections.splice(sections[0]?.id === "display" ? 1 : 0, 0, plotted);
  }
  return { point: row, seriesName: description.seriesName, sections };
}
