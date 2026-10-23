// Surface Style: how the user can recolour a surface (a mine geometry model,
// a survey) in the 3D view, the surface counterpart of Marker Style.
//
// Asked for at the final check-in before handover: the client wanted to set
// a surface's colour the way Marker Style sets the points'. A surface
// already carries its marker menu (parseExportFile.js loads its
// markerDefinitions, e.g. the sample's "Material" and "Date"), so it can be
// coloured by any of those markers whose column the vertices fill, or drawn
// in one colour the user picks. Opacity lets a surface be seen through to
// the events behind it.
//
// A surface's style: `{ colourMarker?, colour?, opacity? }`
//   colourMarker  a marker name, or null for one colour (absent: the export's)
//   colour        "#rrggbb", the single colour (absent: the surface's own)
//   opacity       0.1..1 (absent: 1)
//
// Pure: no `three`, no React.

import { getMarkerChoices } from "./markerSelection";

export const DEFAULT_SURFACE_COLOUR = 0x4f8ef7;
export const MIN_SURFACE_OPACITY = 0.1;

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/**
 * The colour markers a surface can be coloured by: those of its marker menu
 * whose input column has values in its vertices.
 *
 * @param {object} surface a parsed surface (vertices, markerDefinitions, colourMarker)
 * @param {string|null} [current] the marker in use now (always offered)
 * @returns {{name: string, input: string|null}[]}
 */
export function getSurfaceColourChoices(surface, current) {
  if (!surface) return [];
  return getMarkerChoices(
    {
      markerDefinitions: surface.markerDefinitions,
      colourMarker: surface.colourMarker,
      points: Array.isArray(surface.vertices) ? surface.vertices : [],
    },
    { colour: current ?? surface.colourMarker ?? undefined }
  ).colour;
}

/**
 * The surface as drawn with the user's style applied. A missing or unusable
 * setting keeps the surface's own value.
 *
 * @param {object} surface
 * @param {object|undefined} style
 * @returns {object}
 */
export function applySurfaceStyle(surface, style) {
  if (!surface || !style || typeof style !== "object") return surface;
  const next = { ...surface };
  if (Object.hasOwn(style, "colourMarker") && (style.colourMarker === null || typeof style.colourMarker === "string")) {
    next.colourMarker = style.colourMarker || null;
  }
  if (typeof style.colour === "string" && HEX_COLOUR.test(style.colour)) {
    next.color = Number.parseInt(style.colour.slice(1), 16);
  }
  if (Number.isFinite(style.opacity)) {
    next.opacity = Math.min(1, Math.max(MIN_SURFACE_OPACITY, style.opacity));
  }
  return next;
}

/**
 * A surface's single colour as "#rrggbb", for a colour input.
 *
 * @param {object} surface
 * @returns {string}
 */
export function surfaceColourHex(surface) {
  const colour = Number.isInteger(surface?.color) ? surface.color : DEFAULT_SURFACE_COLOUR;
  return `#${(colour & 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * A saved surface style, checked: keeps only settings applySurfaceStyle
 * accepts, or undefined when none is left.
 *
 * @param {unknown} style
 * @returns {object|undefined}
 */
export function restoreSurfaceStyle(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) return undefined;
  const restored = {};
  if (Object.hasOwn(style, "colourMarker") && (style.colourMarker === null || typeof style.colourMarker === "string")) {
    restored.colourMarker = style.colourMarker;
  }
  if (typeof style.colour === "string" && HEX_COLOUR.test(style.colour)) restored.colour = style.colour;
  if (Number.isFinite(style.opacity)) restored.opacity = Math.min(1, Math.max(MIN_SURFACE_OPACITY, style.opacity));
  return Object.keys(restored).length > 0 ? restored : undefined;
}
