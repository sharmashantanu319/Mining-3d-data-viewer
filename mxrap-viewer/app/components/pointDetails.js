// Groups a picked point's attributes into short labelled sections for the
// Legend & Details panel, instead of one long list in CSV column order:
//
//   Colour & size  the columns that drive the point's colour and size right
//                  now (with the colour swatch), so the point reads against
//                  the legend below it
//   Location       X, Y, Z once (the CSV's X/Y/Z columns and the parsed
//                  position used to be listed twice)
//   Time           date/time columns and other time measures
//   IDs & groups   identifiers and grouping columns
//   Other data     everything else, in the export's column order
//
// Grouping is by column name only, so it works for any export; a column the
// rules don't recognise lands in "Other data" rather than being guessed at.
// Every column appears exactly once.

import { mapColour, toCssRgba } from "./colourMapping";
import { resolveColourMarker } from "./pointMarkerResolver";
import { isSingleColourDefinition, parseRgbColour } from "./markerSymbols";
import { findMarkerDefinition } from "./markerLookup";

const COORDINATE_KEYS = new Set(["X", "Y", "Z", "x", "y", "z", "Location X", "Location Y", "Location Z"]);
const INTERNAL_KEYS = new Set(["sourceIndex"]);
const TIME_KEY = /date|time|hour|minute|second|(^|\s)days?(\s|$)/i;
const ID_KEY = /(^|[\s_])id$|group$/i;

/**
 * What a series' current markers read from each point. Resolved once per
 * series (the colour domain scans every point), then reused for every
 * hovered or selected point of that series.
 */
export function describePointSeries(series) {
  const colourDefinition = findMarkerDefinition(series?.markerDefinitions, series?.colourMarker, "colour");
  const sizeDefinition = findMarkerDefinition(series?.markerDefinitions, series?.sizeMarker, "size");
  const singleColour = isSingleColourDefinition(colourDefinition) ? colourDefinition : null;
  const colourMarker = colourDefinition && !singleColour ? resolveColourMarker(series) : null;
  return {
    seriesName: series?.name ?? null,
    colourInput: colourMarker?.valid ? colourMarker.input : null,
    colourMarker: colourMarker?.valid ? colourMarker : null,
    singleColour,
    sizeInput: sizeDefinition?.input ?? null,
  };
}

export function formatDetailNumber(value) {
  const magnitude = Math.abs(value);
  if (Number.isInteger(value) && magnitude < 1e12) return String(value);
  // Tiny probabilities (3e-15) used to print as "0" with six decimals.
  // Trailing zeros are dropped ("9.1e-5", not "9.100e-5").
  if (magnitude !== 0 && (magnitude < 1e-4 || magnitude >= 1e12)) {
    return value.toExponential(3).replace("e+", "e").replace(/\.?0+e/, "e");
  }
  // No thousands separators: IDs and coordinates never had them, and mixing
  // 5,165,195.5 with 1423522 in one list read as two different formats.
  return value.toLocaleString(undefined, { maximumFractionDigits: 6, useGrouping: false });
}

/**
 * Short name for the hovered or selected point in the status bar: its ID
 * column when the export has one ("ID 3626505"), otherwise its row in the
 * series' data file counted from 1 ("Row 1445"). The status bar used to show
 * the 0-based row index with no label, which read like an ID but never
 * matched the ID in the details panel.
 *
 * @returns {string|null}
 */
export function pointStatusLabel(point, sourceIndex) {
  const id = point?.ID ?? point?.id;
  if (!isMissing(id)) return `ID ${id}`;
  return Number.isInteger(sourceIndex) && sourceIndex >= 0 ? `Row ${sourceIndex + 1}` : null;
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(2) : null;
}

function isMissing(value) {
  return value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value));
}

/**
 * @param {object} point  a parsed point (CSV columns plus x/y/z/sourceIndex)
 * @param {ReturnType<typeof describePointSeries>} description
 * @returns {{ id: string, title: string, rows: { label: string, value: *, tag?: string, swatch?: string, numeric?: boolean }[] }[]}
 *   sections in display order, empty sections left out
 */
export function groupPointDetails(point, description = {}) {
  if (!point || typeof point !== "object") return [];
  const { colourInput, colourMarker, singleColour, sizeInput } = description;
  const used = new Set();

  const display = [];
  if (singleColour) {
    const colour = parseRgbColour(singleColour.colour);
    display.push({ label: "Colour", value: singleColour.name, tag: "same for every point", swatch: colour ? toCssRgba(colour) : undefined });
  } else if (colourInput) {
    display.push({
      label: colourInput,
      value: point[colourInput],
      tag: sizeInput === colourInput ? "colour · size" : "colour",
      swatch: toCssRgba(mapColour(isMissing(point[colourInput]) ? null : point[colourInput], colourMarker)),
    });
    used.add(colourInput);
  }
  if (sizeInput && sizeInput !== colourInput) {
    display.push({ label: sizeInput, value: point[sizeInput], tag: "size" });
    used.add(sizeInput);
  }

  const location = ["x", "y", "z"].map((axis) => ({ label: axis.toUpperCase(), value: formatCoordinate(point[axis]), numeric: true }));

  const time = [];
  const ids = [];
  const other = [];
  for (const [key, value] of Object.entries(point)) {
    if (COORDINATE_KEYS.has(key) || INTERNAL_KEYS.has(key) || used.has(key)) continue;
    const row = { label: key, value };
    if (TIME_KEY.test(key)) time.push(row);
    else if (ID_KEY.test(key)) ids.push(row);
    else other.push(row);
  }

  return [
    { id: "display", title: "Colour & size", rows: display },
    { id: "location", title: "Location", rows: location },
    { id: "time", title: "Time", rows: time },
    { id: "ids", title: "IDs & groups", rows: ids },
    { id: "other", title: "Other data", rows: other },
  ].filter((section) => section.rows.length > 0);
}
