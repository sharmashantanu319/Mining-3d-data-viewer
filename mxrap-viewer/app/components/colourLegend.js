import { mapColour, toCssRgba } from "./colourMapping";
import { resolveColourMarker } from "./pointMarkerResolver";

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

export function buildColourLegend(pointSeriesData, sampleCount = DEFAULT_SAMPLE_COUNT, fullPointSeriesData = null) {
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
  const ticks = [marker.domainMin, middleValue, marker.domainMax].map((value, index) => ({
    position: index / 2,
    value,
    label: formatLegendValue(value, marker),
  }));

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
