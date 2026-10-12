function isColourDefinition(definition) {
  if (!definition || typeof definition !== "object") return false;
  return (
    definition.type === "colour" ||
    (definition.type == null && (definition.ramp != null || definition.rampCsv != null))
  );
}

function isSizeDefinition(definition) {
  return definition?.type === "size";
}

export function getMarkerChoices(series) {
  const definitions = Array.isArray(series?.markerDefinitions)
    ? series.markerDefinitions
    : [];
  const unique = (items) =>
    Array.from(new Map(items.filter((item) => item?.name).map((item) => [item.name, item])).values());

  return {
    colour: unique(definitions.filter(isColourDefinition)).map((definition) => ({
      name: definition.name,
      input: definition.input ?? null,
    })),
    size: unique(definitions.filter(isSizeDefinition)).map((definition) => ({
      name: definition.name,
      input: definition.input ?? null,
    })),
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
