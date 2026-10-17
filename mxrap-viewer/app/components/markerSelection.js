function isColourDefinition(definition) {
  if (!definition || typeof definition !== "object") return false;
  return (
    definition.type === "colour" ||
    definition.type === "single-colour" ||
    (definition.type == null && (definition.ramp != null || definition.rampCsv != null))
  );
}

function isSizeDefinition(definition) {
  return definition?.type === "size";
}

// Only markers whose input column the series' data has are offered. The
// TestHazards "Minodes" series uses the seismic-events menu, so it offered
// "Mag/Spheres", "Event Date", "Moment" and size "ML" for nodes that have none
// of those columns; picking one turned every node the missing-value colour.
// The markers in use stay listed so the dropdowns can show them, markers that
// read no column (single-colour) are always offered, and a series with no
// points to look at keeps every choice.
//
// @param {object} series a point series (markerDefinitions, points)
// @param {{colour?: string, size?: string}} [current] the markers selected now
//   (default: the series' own colourMarker / sizeMarker)
export function getMarkerChoices(series, current = {}) {
  const definitions = Array.isArray(series?.markerDefinitions)
    ? series.markerDefinitions
    : [];
  const unique = (items) =>
    Array.from(new Map(items.filter((item) => item?.name).map((item) => [item.name, item])).values());
  const firstPoint = Array.isArray(series?.points) ? series.points[0] : null;
  const columns = firstPoint && typeof firstPoint === "object" ? new Set(Object.keys(firstPoint)) : null;
  const usable = (currentName) => (definition) =>
    columns === null ||
    definition.name === currentName ||
    definition.input == null ||
    columns.has(definition.input);
  const choice = (definition) => ({ name: definition.name, input: definition.input ?? null });

  return {
    colour: unique(definitions.filter(isColourDefinition))
      .filter(usable(current.colour ?? series?.colourMarker))
      .map(choice),
    size: unique(definitions.filter(isSizeDefinition))
      .filter(usable(current.size ?? series?.sizeMarker))
      .map(choice),
  };
}

// The Marker Style panel's Min size / Max size inputs always label the size
// drawn at the low/high end of the value range; "Invert" flips which one
// actually feeds sizeMinimum (size at the domain minimum) vs sizeMaximum
// (size at the domain maximum), reusing sizeMapping.js's existing support
// for an inverted output range rather than asking the user to swap the two
// numbers themselves.
function resolveSizeRange(series, selection) {
  const hasMin = Object.hasOwn(selection, "minSize");
  const hasMax = Object.hasOwn(selection, "maxSize");
  const hasInvert = Object.hasOwn(selection, "invertSize");
  if (!hasMin && !hasMax && !hasInvert) return null;

  const minSize = hasMin ? selection.minSize : series?.sizeMinimum;
  const maxSize = hasMax ? selection.maxSize : series?.sizeMaximum;
  const invert = hasInvert ? selection.invertSize === true : false;

  return invert
    ? { sizeMinimum: maxSize, sizeMaximum: minSize }
    : { sizeMinimum: minSize, sizeMaximum: maxSize };
}

export function applyMarkerSelections(pointClouds, selectionsBySeries) {
  return (Array.isArray(pointClouds) ? pointClouds : []).map((series, index) => {
    const selection = selectionsBySeries?.[index];
    if (!selection) return series;
    return {
      ...series,
      ...(Object.hasOwn(selection, "colourMarker")
        ? { colourMarker: selection.colourMarker }
        : {}),
      ...(Object.hasOwn(selection, "sizeMarker") ? { sizeMarker: selection.sizeMarker } : {}),
      ...(resolveSizeRange(series, selection) ?? {}),
    };
  });
}

// Which series get a colour legend. Series the export marks legend: true
// always do. When the export marks none (every series in the TestHazards and
// TestResponseViewer exports says legend: false, yet the client's mXrap
// reference screenshot still shows the ML legend), the series currently
// chosen in Marker Style gets one, so the colours on screen are explained.
export function pickLegendSeriesIndices(seriesList, activeIndex) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  const configured = list.flatMap((series, index) => (series?.legend === true ? [index] : []));
  if (configured.length > 0) return configured;
  return Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < list.length ? [activeIndex] : [];
}
