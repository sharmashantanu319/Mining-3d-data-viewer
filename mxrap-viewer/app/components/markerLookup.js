// Finds the marker definition a series' colour or size marker names.
//
// A colour marker and a size marker can share a name: the customer's
// stra-events/markers.json defines "Event ML" twice, as a colour ramp over
// ML -4..4 and as a size over ML -2..2. Looking up by name alone returned the
// colour definition for the size marker too, so event sizes were spread over
// the wrong range. The lookup therefore also matches the definition's type.
//
//   colour  any definition that is not a size ("colour", "single-colour", or
//           no type at all, like the sample export's sensor "Configuration")
//   size    a "size" definition, else one with no type (the old behaviour)

/**
 * @param {object[]} definitions a series' markerDefinitions
 * @param {string|null|undefined} name the series' colourMarker or sizeMarker
 * @param {"colour"|"size"} role which of the two the name came from
 * @returns {object|null}
 */
export function findMarkerDefinition(definitions, name, role) {
  if (!Array.isArray(definitions) || name == null || name === "") return null;
  const named = definitions.filter((def) => def && typeof def === "object" && def.name === name);
  if (role === "size") {
    return named.find((def) => def.type === "size") ?? named.find((def) => def.type == null) ?? null;
  }
  return named.find((def) => def.type !== "size") ?? null;
}
