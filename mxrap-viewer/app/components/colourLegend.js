import { mapColour, toCssRgba } from "./colourMapping";
import { resolveColourMarker } from "./pointMarkerResolver";
import { isSingleColourDefinition, parseRgbColour } from "./markerSymbols";
import { findMarkerDefinition } from "./markerLookup";

const DEFAULT_SAMPLE_COUNT = 72;

function interpolateValue(marker, position) {
  if (marker.transform === "log10" && marker.domainMin > 0 && marker.domainMax > 0) {
    const lo = Math.log10(marker.domainMin);
    const hi = Math.log10(marker.domainMax);
    return 10 ** (lo + (hi - lo) * position);
  }
  return marker.domainMin + (marker.domainMax - marker.domainMin) * position;
}

function finiteDecimals(value, fallback = 2) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 12 ? number : fallback;
}

export function formatLegendValue(value, marker) {
  if (!Number.isFinite(value)) return "—";
  if (marker.inputType === "date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  const format = marker.legend?.numberFormat ?? {};
  // "automaticExponential" (the customer's probability and moment legends):
  // switch to e-notation for very small or very large magnitudes, so
  // 0.0000000000000031 reads 3.1e-15 and 10000000000000 reads 1.0e13.
  if (format.mode === "automaticExponential") {
    const digits = Number.isInteger(format.sigDigits) && format.sigDigits > 0 ? Math.min(format.sigDigits, 15) : 3;
    const magnitude = Math.abs(value);
    if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e5)) {
      return value.toExponential(digits - 1).replace("e+", "e");
    }
    return new Intl.NumberFormat(undefined, { maximumSignificantDigits: digits }).format(value);
  }
  if (Number.isInteger(format.sigDigits) && format.sigDigits > 0) {
    return new Intl.NumberFormat(undefined, {
      maximumSignificantDigits: Math.min(format.sigDigits, 15),
    }).format(value);
  }

  const decimals = finiteDecimals(format.decimals);
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

// A "single-colour" marker (e.g. "Cross/Grey") paints every point the same
// colour and reads no data column, so its legend is one swatch with no
// value range and no missing-value entry.
function singleColourLegend(pointSeriesData, definition) {
  const colour = parseRgbColour(definition.colour);
  return {
    seriesName: pointSeriesData?.name || "Point series",
    markerName: definition.name,
    input: null,
    title: definition.name,
    units: null,
    valid: Boolean(colour),
    errors: [],
    warnings: [],
    noVisiblePoints: false,
    nullEntry: null,
    kind: colour ? "categorical" : "error",
    categories: colour ? [{ value: null, label: "All points", colour: toCssRgba(colour) }] : [],
    samples: [],
    ticks: [],
    symbolLabel: definition.symbol || "None",
  };
}

// With few decimals a narrow range repeats labels: the customer's "Trigger"
// legend (no decimals) read "1 2 2" for triggers 1 and 2, and "1 1 1" for a
// single trigger. A middle tick that repeats an end is dropped, and a range
// that reads as one value gets one tick in the middle.
function withoutRepeatedLabels(ticks) {
  const [low, middle, high] = ticks;
  if (low.label === high.label) return [{ ...low, position: 0.5 }];
  if (middle.label === low.label || middle.label === high.label) return [low, high];
  return ticks;
}

export function buildColourLegend(pointSeriesData, sampleCount = DEFAULT_SAMPLE_COUNT, fullPointSeriesData = null) {
  const colourDefinition = findMarkerDefinition(pointSeriesData?.markerDefinitions, pointSeriesData?.colourMarker, "colour");
  if (isSingleColourDefinition(colourDefinition)) return singleColourLegend(pointSeriesData, colourDefinition);

  const visiblePointCount = Array.isArray(pointSeriesData?.points) ? pointSeriesData.points.length : 0;
  const fullPointCount = Array.isArray(fullPointSeriesData?.points) ? fullPointSeriesData.points.length : 0;

  // A hidden series or a filter that removes every point leaves no
  // data-derived domain to resolve from. Fall back to the full series so the
  // legend still reflects the marker's real (dataset-wide) range instead of
  // reporting a false "Colour configuration unavailable" error; this is a
  // no-op whenever the domain is configured rather than data-derived, since
  // both series then resolve to the same domain anyway. Only report an error
  // when the full series itself is invalid (below).
  const noVisiblePoints = visiblePointCount === 0 && fullPointCount > 0;
  const marker = resolveColourMarker((noVisiblePoints ? fullPointSeriesData : pointSeriesData) ?? {});
  if (!marker) return null;

  const title = marker.legend?.title || marker.name || marker.input || "Colour";
  const base = {
    seriesName: pointSeriesData?.name || "Point series",
    markerName: marker.name,
    input: marker.input,
    title,
    units: marker.legend?.units ?? null,
    valid: marker.valid,
    errors: marker.errors ?? [],
    warnings: marker.warnings ?? [],
    noVisiblePoints,
    nullEntry: {
      label: "Missing / invalid",
      colour: toCssRgba(marker.nullColour),
      visible: marker.showNullColours,
    },
  };

  if (!marker.valid) return { ...base, kind: "error", samples: [], ticks: [] };

  if (marker.legend?.kind === "categorical" && marker.legend.categories?.length) {
    return {
      ...base,
      kind: "categorical",
      categories: marker.legend.categories.map((category) => ({
        value: category.value,
        label: category.description || formatLegendValue(category.value, marker),
        colour: toCssRgba(category.colour),
      })),
      samples: [],
      ticks: [],
    };
  }

  const count = Math.max(2, Math.min(256, Math.floor(sampleCount) || DEFAULT_SAMPLE_COUNT));
  const samples = Array.from({ length: count }, (_, index) => {
    const position = index / (count - 1);
    const value = interpolateValue(marker, position);
    return { position, value, colour: toCssRgba(mapColour(value, marker)) };
  });

  const middleValue = interpolateValue(marker, 0.5);
  const ticks = withoutRepeatedLabels([marker.domainMin, middleValue, marker.domainMax].map((value, index) => ({
    position: index / 2,
    value,
    label: formatLegendValue(value, marker),
  })));

  // Each end of the range is only meaningful to compare when it is itself
  // data-derived (configuredMin/Max null for that end): that's the only case
  // where filtering can narrow it. A "mixed" domain (one end configured, the
  // other from data) still needs the data-derived end checked on its own —
  // requiring BOTH ends to be unconfigured would miss a real narrowing on
  // the one end that is. A configured end is a fixed export setting, not
  // something a filter view could "hide".
  let fullRange = null;
  if (fullPointSeriesData && !noVisiblePoints) {
    const fullMarker = resolveColourMarker(fullPointSeriesData);
    if (fullMarker?.valid) {
      const fullMin = marker.configuredMin === null ? fullMarker.domainMin : marker.domainMin;
      const fullMax = marker.configuredMax === null ? fullMarker.domainMax : marker.domainMax;
      if (fullMin !== marker.domainMin || fullMax !== marker.domainMax) {
        fullRange = {
          min: fullMin,
          max: fullMax,
          minLabel: formatLegendValue(fullMin, marker),
          maxLabel: formatLegendValue(fullMax, marker),
        };
      }
    }
  }

  return { ...base, kind: "ramp", samples, ticks, fullRange };
}

export function buildSceneColourLegends(pointClouds, fullPointClouds = null) {
  const full = Array.isArray(fullPointClouds) ? fullPointClouds : null;
  return (Array.isArray(pointClouds) ? pointClouds : [])
    .map((series, index) => (series?.legend === true ? buildColourLegend(series, DEFAULT_SAMPLE_COUNT, full?.[index]) : null))
    .filter(Boolean);
}
