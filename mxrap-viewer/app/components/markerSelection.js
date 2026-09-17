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
    };
  });
}
