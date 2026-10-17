// Resolve a point series' real marker definitions into the render options
// expected by pointsBuilder.js.

import {
  normalizeColourMarker,
  mapColour,
  parseColourRampCsv,
} from "./colourMapping";

import {
  normalizeSizeMarker,
  mapSize,
} from "./sizeMapping";

import { parseCustomerDate } from "./customerDate";
import { isShadingSprite, isSingleColourDefinition, parseRgbColour } from "./markerSymbols";
import { findMarkerDefinition } from "./markerLookup";

// role "colour" or "size": a colour and a size marker can share a name
// (see markerLookup.js).
function findMarkerDef(markerDefinitions, name, role) {
  return findMarkerDefinition(markerDefinitions, name, role);
}

function readInputValue(point, input, inputType) {
  const raw = point?.[input];

  if (
    raw === null ||
    raw === undefined ||
    raw === ""
  ) {
    return null;
  }

  if (inputType === "date") {
    return parseCustomerDate(raw);
  }

  const n =
    typeof raw === "number"
      ? raw
      : Number(raw);

  return Number.isFinite(n)
    ? n
    : null;
}

function dataDomain(points, input, inputType) {
  let dataMin = null;
  let dataMax = null;

  for (const point of points ?? []) {
    const value = readInputValue(
      point,
      input,
      inputType
    );

    if (value === null) {
      continue;
    }

    if (
      dataMin === null ||
      value < dataMin
    ) {
      dataMin = value;
    }

    if (
      dataMax === null ||
      value > dataMax
    ) {
      dataMax = value;
    }
  }

  return {
    dataMin,
    dataMax,
  };
}

export function resolveColourMarker(
  pointSeriesData
) {
  const {
    markerDefinitions,
    colourMarker,
    points,
    showNullColours,
  } = pointSeriesData;

  const def = findMarkerDef(
    markerDefinitions,
    colourMarker,
    "colour"
  );

  if (!def) {
    return null;
  }

  const inputType =
    def.inputType === "date"
      ? "date"
      : "number";

  const {
    dataMin,
    dataMax,
  } = dataDomain(
    points,
    def.input,
    inputType
  );

  const ramp =
    parseColourRampCsv(
      def.rampCsv
    );

  return normalizeColourMarker(
    def,
    ramp,
    {
      dataMin,
      dataMax,
      showNullColours:
        showNullColours === true,
    }
  );
}

export function resolveSizeMarker(
  pointSeriesData
) {
  const {
    markerDefinitions,
    sizeMarker,
    points,
    sizeMinimum,
    sizeMaximum,
    nullSizes,
  } = pointSeriesData;

  const def = findMarkerDef(
    markerDefinitions,
    sizeMarker,
    "size"
  );

  const inputType =
    def?.inputType === "date"
      ? "date"
      : "number";

  const {
    dataMin,
    dataMax,
  } = def
    ? dataDomain(
        points,
        def.input,
        inputType
      )
    : {};

  return normalizeSizeMarker(
    def,
    {
      sizeMinimum,
      sizeMaximum,
      nullSizes,
      sizeMarker,
    },
    {
      dataMin,
      dataMax,
    }
  );
}

/*
 * These are generic sphere SHAPES rather than meaningful
 * category-specific icons.
 *
 * They should be rendered as procedural shaded spheres so
 * the active colour marker can still colour them.
 */

/*
 * Determine whether this colour-marker definition represents
 * the normal mXrap event sphere.
 *
 * We intentionally do this at the marker-definition level.
 * Some exported Mag/Spheres ramps return no per-point symbol,
 * so relying only on mapColour(...).symbol is not enough.
 */
function shouldRenderAsShadedSphere(
  pointSeriesData,
  colourDefinition
) {
  if (!colourDefinition) {
    return false;
  }

  const seriesName = String(
    pointSeriesData?.name ?? ""
  )
    .trim()
    .toLowerCase();

  const markerName = String(
    colourDefinition.name ?? ""
  )
    .trim()
    .toLowerCase();

  // Procedural sphere rendering is currently only intended
  // for the seismic Events series.
  const isEventSeries =
    seriesName === "events";

  const isSphereMarker =
    markerName === "mag/spheres" ||
    markerName === "magnitude colour";

  if (isEventSeries && isSphereMarker) {
    return true;
  }

  // Any series whose colour marker only ever draws grey sphere sprites
  // (e.g. "Response Events" with "Event ML") is a coloured sphere too.
  const ramp = parseColourRampCsv(colourDefinition.rampCsv);
  const symbols = [
    colourDefinition.nullSymbol,
    ...ramp.segments.map((segment) => segment.symbol),
  ].filter(Boolean);
  return symbols.length > 0 && symbols.every(isShadingSprite);
}

export function resolveMarkerRenderOptions(
  pointSeriesData
) {
  const s =
    pointSeriesData ?? {};

  if (
    !Array.isArray(
      s.markerDefinitions
    ) ||
    s.markerDefinitions.length === 0
  ) {
    return null;
  }

  const colourDefinition =
    findMarkerDef(
      s.markerDefinitions,
      s.colourMarker,
      "colour"
    );

  if (isSingleColourDefinition(colourDefinition)) {
    return resolveSingleColourRenderOptions(s, colourDefinition);
  }

  const colourMarker =
    resolveColourMarker(s);

  /*
   * Data-driven colour.
   */
  const colorFn =
    colourMarker?.valid
      ? (point) => {
          const colour =
            mapColour(
              point?.[
                colourMarker.input
              ],
              colourMarker
            );

          return {
            r: colour.r,
            g: colour.g,
            b: colour.b,
          };
        }
      : null;

  /*
   * Determine whether this entire marker style should
   * render as shaded event spheres.
   */
    const renderAsShadedSphere =
      shouldRenderAsShadedSphere(
        s,
        colourDefinition
      );

  /*
   * Real categorical symbols such as sensor icons.
   *
   * Mag/Spheres is handled separately through
   * renderAsShadedSphere, so it does not depend on this
   * function returning sphere_64x64.png.
   */
  const symbolFn =
    colourMarker?.valid &&
    !renderAsShadedSphere
      ? (point) => {
          const value =
            point?.[
              colourMarker.input
            ];

          const mapped =
            mapColour(
              value,
              colourMarker
            );

          // Unknown sensor configurations are drawn as
          // normal coloured dots rather than a question
          // mark symbol.
          if (
            mapped.isNull &&
            mapped.symbol
              ?.toLowerCase() ===
              "sphere-question.png"
          ) {
            return null;
          }

          // Normal non-categorical marker.
          if (
            colourMarker.legend.kind !==
              "categorical" ||
            !colourMarker.legend.categories?.some(
              (category) =>
                category.value === value
            ) ||
            mapped.symbol !==
              colourMarker.nullSymbol
          ) {
            return (
              mapped.symbol ?? null
            );
          }

          // Exact categorical values can have their intended
          // symbol stored in the next ramp segment.
          const preferred =
            colourMarker.segments.find(
              (segment) =>
                segment.upperBoundRaw >
                  value &&
                segment.symbol &&
                segment.symbol !==
                  colourMarker.nullSymbol
            );

          return (
            preferred?.symbol ??
            mapped.symbol ??
            null
          );
        }
      : null;

  const sizeMarker =
    resolveSizeMarker(s);

  /*
   * Important:
   *
   * sizeMinimum and sizeMaximum describe the semantic
   * mapping direction and may legitimately be inverted.
   *
   * pointsBuilder only needs numeric clamp bounds here.
   */
  const outputSizeA =
    Number.isFinite(
      sizeMarker.sizeMinimum
    )
      ? sizeMarker.sizeMinimum
      : 2;

  const outputSizeB =
    Number.isFinite(
      sizeMarker.sizeMaximum
    )
      ? sizeMarker.sizeMaximum
      : 40;

  const minPointSize =
    Math.min(
      outputSizeA,
      outputSizeB
    );

  const maxPointSize =
    Math.max(
      outputSizeA,
      outputSizeB
    );

  return {
    ...(colorFn
      ? {
          colorFn,
        }
      : {}),

    ...(symbolFn
      ? {
          symbolFn,
        }
      : {}),

    symbolAssets:
      colourDefinition
        ?.symbolAssets ?? {},

    /*
     * This is the important new flag.
     */
    renderAsShadedSphere,

    sizeFn: (point) =>
      mapSize(
        point?.[
          sizeMarker.input
        ],
        sizeMarker
      ),

    minPointSize,
    maxPointSize,

    distanceAttenuation:
      s.distanceAttenuation ??
      null,
  };
}

// "single-colour" markers (e.g. "Cross/Grey") paint every point one colour,
// optionally with one symbol image. A grey/white symbol such as cross2.png
// is tinted with that colour, so tintSymbols is set for the renderer.
function resolveSingleColourRenderOptions(s, definition) {
  const colour = parseRgbColour(definition.colour);
  const symbol = definition.symbol ?? null;
  const sizeMarker = resolveSizeMarker(s);
  const sizeA = Number.isFinite(sizeMarker.sizeMinimum) ? sizeMarker.sizeMinimum : 2;
  const sizeB = Number.isFinite(sizeMarker.sizeMaximum) ? sizeMarker.sizeMaximum : 40;
  return {
    ...(colour ? { colorFn: () => ({ ...colour }) } : {}),
    ...(symbol ? { symbolFn: () => symbol } : {}),
    symbolAssets: definition.symbolAssets ?? {},
    tintSymbols: true,
    renderAsShadedSphere: false,
    sizeFn: (point) => mapSize(point?.[sizeMarker.input], sizeMarker),
    minPointSize: Math.min(sizeA, sizeB),
    maxPointSize: Math.max(sizeA, sizeB),
    distanceAttenuation: s.distanceAttenuation ?? null,
  };
}
