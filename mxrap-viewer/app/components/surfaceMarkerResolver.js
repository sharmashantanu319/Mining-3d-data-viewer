// Resolve a surface series' real colour marker definition (markers.json,
// loaded by parseExportFile.js's loadMarkerDefinitions) into a per-vertex
// RGB colour array that geometryBuilder.js can attach as a Three.js vertex
// colour BufferAttribute. This is the surface counterpart to
// pointMarkerResolver.js's resolveMarkerRenderOptions.
//
// Pure: no `three` import, no file IO. All ramp/value math is delegated to
// colourMapping.js; this module only resolves which definition a surface's
// `colourMarker` name refers to (matched by `name`, same convention as point
// series) and derives a data-driven min/max when the definition omits
// minimum/maximum, mirroring pointMarkerResolver.js's dataDomain().
//
// Size and sprite symbols are not resolved here: the real export config
// never gives a surface series a sizeMarker (faces are fixed geometry, not
// individually sized), and mapColour()'s symbol output has no meaning for a
// continuous mesh surface.

import { normalizeColourMarker, mapColour, parseColourRampCsv } from "./colourMapping";
import { parseCustomerDate } from "./customerDate";

function findMarkerDef(markerDefinitions, name) {
  if (!Array.isArray(markerDefinitions) || name == null || name === "") return null;
  return markerDefinitions.find((def) => def && def.name === name) ?? null;
}

function readInputValue(vertex, input, inputType) {
  const raw = vertex?.[input];
  if (raw === null || raw === undefined || raw === "") return null;
  if (inputType === "date") return parseCustomerDate(raw);
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Derives { dataMin, dataMax } for one input column across a surface's
// vertices, used as the domain fallback when a marker definition's own
// minimum/maximum are absent.
function dataDomain(vertices, input, inputType) {
  let dataMin = null;
  let dataMax = null;
  for (const vertex of vertices ?? []) {
    const value = readInputValue(vertex, input, inputType);
    if (value === null) continue;
    if (dataMin === null || value < dataMin) dataMin = value;
    if (dataMax === null || value > dataMax) dataMax = value;
  }
  return { dataMin, dataMax };
}

/**
 * @param {object} surfaceData - a parsed surface (parseExportFile.js's
 *   parseSurfaceSeries output), carrying markerDefinitions/colourMarker.
 * @returns {Float32Array|null} one RGB triple (0..1) per vertex, in the same
 *   order as surfaceData.vertices, or null when the surface has no
 *   resolvable colour marker (mock data, no markerMenu, a colourMarker name
 *   that doesn't match a loaded definition, or a definition that fails to
 *   normalize) — the caller falls back to the surface's flat placeholder
 *   colour rather than rendering anything wrong.
 */
export function resolveSurfaceVertexColours(surfaceData) {
  const s = surfaceData ?? {};
  const def = findMarkerDef(s.markerDefinitions, s.colourMarker);
  if (!def) return null;

  const inputType = def.inputType === "date" ? "date" : "number";
  const vertices = Array.isArray(s.vertices) ? s.vertices : [];
  const { dataMin, dataMax } = dataDomain(vertices, def.input, inputType);
  const ramp = parseColourRampCsv(def.rampCsv);
  const marker = normalizeColourMarker(def, ramp, { dataMin, dataMax });
  if (!marker.valid) return null;

  const colours = new Float32Array(vertices.length * 3);
  vertices.forEach((vertex, index) => {
    const colour = mapColour(vertex?.[marker.input], marker);
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
  });
  return colours;
}
