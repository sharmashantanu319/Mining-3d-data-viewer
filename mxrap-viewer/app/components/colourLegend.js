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

export function buildColourLegend(pointSeriesData, sampleCount = DEFAULT_SAMPLE_COUNT) {
  const marker = resolveColourMarker(pointSeriesData ?? {});
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

  return { ...base, kind: "ramp", samples, ticks };
}

export function buildSceneColourLegends(pointClouds) {
  return (Array.isArray(pointClouds) ? pointClouds : [])
    .filter((series) => series?.legend === true)
    .map((series) => buildColourLegend(series))
    .filter(Boolean);
}
