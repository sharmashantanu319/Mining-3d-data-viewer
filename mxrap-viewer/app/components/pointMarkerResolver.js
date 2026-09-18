// Resolve a point series' real marker definitions (markers.json colour/size
// entries, loaded by parseExportFile.js's loadMarkerDefinitions) into the
// { colorFn, sizeFn, minPointSize, maxPointSize, distanceAttenuation } shape
// buildPointCloud() (pointsBuilder.js) expects. This is the real-data
// counterpart to ThreeScene.jsx's mock-only getDemoRenderOptions.
//
// Pure: no `three` import, no file IO. All ramp/value math is delegated to
// colourMapping.js / sizeMapping.js; this module only resolves which
// definition a series' colourMarker/sizeMarker name refers to (matched by
// `name`, since the real sample data is inconsistent about whether a
// definition even carries a `type` field) and derives a data-driven
// min/max for definitions that omit minimum/maximum, which the real sample
// data does routinely — Matt's spec has the range fall back to the data's
// own extent in that case.
//
// Sprite/symbol images (markers.json's `Symbol` / `nullSymbol` fields) are
// already resolved by colourMapping.js's mapColour() but are NOT rendered
// here: pointsBuilder.js draws every point through one shared GPU point
// sprite shader with no per-point texture support, so swapping in real
// marker icon images needs texture-atlas support that renderer doesn't have
// yet. Colour and size are unaffected by that gap.
//
// Surfaces have their own `colourMarker` in config.json too, but
// geometryBuilder.js only ever draws them with one flat colour per surface
// — wiring real surface colouring is a separate, larger follow-up (it needs
// a per-vertex colour attribute), out of scope here.

import { normalizeColourMarker, mapColour, parseColourRampCsv } from "./colourMapping";
import { normalizeSizeMarker, mapSize } from "./sizeMapping";
import { parseCustomerDate } from "./customerDate";

function findMarkerDef(markerDefinitions, name) {
  if (!Array.isArray(markerDefinitions) || name == null || name === "") return null;
  return markerDefinitions.find((def) => def && def.name === name) ?? null;
}

function readInputValue(point, input, inputType) {
  const raw = point?.[input];
  if (raw === null || raw === undefined || raw === "") return null;
  if (inputType === "date") return parseCustomerDate(raw);
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Derives { dataMin, dataMax } for one input column across a series' points,
// used as the domain fallback when a marker definition's own
// minimum/maximum are absent.
function dataDomain(points, input, inputType) {
  let dataMin = null;
  let dataMax = null;
  for (const point of points ?? []) {
    const value = readInputValue(point, input, inputType);
    if (value === null) continue;
    if (dataMin === null || value < dataMin) dataMin = value;
    if (dataMax === null || value > dataMax) dataMax = value;
  }
  return { dataMin, dataMax };
}

export function resolveColourMarker(pointSeriesData) {
  const { markerDefinitions, colourMarker, points, showNullColours } = pointSeriesData;
  const def = findMarkerDef(markerDefinitions, colourMarker);
  if (!def) return null;

  const inputType = def.inputType === "date" ? "date" : "number";
  const { dataMin, dataMax } = dataDomain(points, def.input, inputType);
  const ramp = parseColourRampCsv(def.rampCsv);
  return normalizeColourMarker(def, ramp, {
    dataMin,
    dataMax,
    showNullColours: showNullColours === true,
  });
}

function resolveSizeMarker(pointSeriesData) {
  const { markerDefinitions, sizeMarker, points, sizeMinimum, sizeMaximum, nullSizes } =
    pointSeriesData;
  const def = findMarkerDef(markerDefinitions, sizeMarker);
  const inputType = def?.inputType === "date" ? "date" : "number";
  const { dataMin, dataMax } = def ? dataDomain(points, def.input, inputType) : {};

  // normalizeSizeMarker's "no size marker selected" branch keys off
  // `series.sizeMarker`, not just a null `markerDef` — it must be passed
  // through here too, or a def that failed to resolve (e.g. a typo'd name)
  // would silently look identical to "no size marker configured".
  return normalizeSizeMarker(
    def,
    { sizeMinimum, sizeMaximum, nullSizes, sizeMarker },
    { dataMin, dataMax }
  );
}

/**
 * @param {object} pointSeriesData - a parsed point series (buildPointSeries()'s
 *   output) carrying markerDefinitions loaded by parseExportFile.js.
 * @returns {{colorFn?: Function, sizeFn: Function, minPointSize: number,
 *   maxPointSize: number, distanceAttenuation: string|null} | null} null when
 *   the series has no marker definitions at all (mock data, or a series
 *   whose markerMenu didn't resolve), so the caller can fall back to its own
 *   demo rendering.
 */
// Some real mXrap ramps (e.g. the sample data's "Mag/Spheres" magnitude
// ramp) assign the same generic default-sphere image to every threshold row
// instead of a real per-category icon. Client decision (see the commit
// introducing symbol colours) was that points WITH a symbol show the
// symbol's own colour and points with NO symbol keep the colour-marker
// tint — but a ramp that names this generic sphere on every row never
// produces a "no symbol" point, so it silently loses its data-driven
// colour entirely. These filenames aren't a real per-category icon, just a
// default shape, so they're treated as "no symbol" here.
const GENERIC_SPHERE_SYMBOLS = new Set([
  "master ball sprite 64x64.png",
  "sphere_64x64.png",
]);

export function resolveMarkerRenderOptions(pointSeriesData) {
  const s = pointSeriesData ?? {};
  if (!Array.isArray(s.markerDefinitions) || s.markerDefinitions.length === 0) return null;

  const colourMarker = resolveColourMarker(s);
  const colorFn = colourMarker?.valid
    ? (point) => {
        const colour = mapColour(point?.[colourMarker.input], colourMarker);
        return { r: colour.r, g: colour.g, b: colour.b };
      }
    : null;
  const symbolFn = colourMarker?.valid
    ? (point) => {
        const symbol = mapColour(point?.[colourMarker.input], colourMarker).symbol ?? null;
        return symbol && !GENERIC_SPHERE_SYMBOLS.has(symbol) ? symbol : null;
      }
    : null;
  const colourDefinition = findMarkerDef(s.markerDefinitions, s.colourMarker);
  const sizeMarker = resolveSizeMarker(s);

  const minPointSize = Number.isFinite(sizeMarker.sizeMinimum) ? sizeMarker.sizeMinimum : 2;
  const maxPointSize = Number.isFinite(sizeMarker.sizeMaximum)
    ? Math.max(sizeMarker.sizeMaximum, minPointSize)
    : Math.max(40, minPointSize);

  return {
    ...(colorFn ? { colorFn } : {}),
    ...(symbolFn ? { symbolFn } : {}),
    symbolAssets: colourDefinition?.symbolAssets ?? {},
    sizeFn: (point) => mapSize(point?.[sizeMarker.input], sizeMarker),
    minPointSize,
    maxPointSize,
    distanceAttenuation: s.distanceAttenuation ?? null,
  };
}
