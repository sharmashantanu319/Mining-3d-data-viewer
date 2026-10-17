// Helpers shared by the parser, the validator and the point resolver for
// marker symbol images and "single-colour" marker definitions.

// mXrap can refer to its built-in images with an "mximages/!/" or
// "mximages/" prefix (e.g. "mximages/!/master ball sprite 64x64.png",
// "mximages/sphere_64x64.png"). The export ships the same files in
// marker-images/ without the prefix, so look up both names.
const MXRAP_IMAGE_PREFIX = /^mximages\/(?:!\/)?/;

export function symbolFileCandidates(fileName) {
  if (!fileName) return [];
  const name = String(fileName);
  const bare = name.replace(MXRAP_IMAGE_PREFIX, "");
  return bare === name ? [name] : [name, bare];
}

// Plain grey sphere sprites carry no colour of their own: mXrap paints them
// with the marker colour (see the client's reference screenshots, where
// "master ball" events take the ML ramp colours). They are drawn with the
// procedural shaded sphere so the marker colour shows.
const SHADING_SPRITES = new Set(["master ball sprite 64x64.png", "sphere_64x64.png"]);

export function isShadingSprite(fileName) {
  return symbolFileCandidates(fileName).some((name) => SHADING_SPRITES.has(name.toLowerCase()));
}

export function isSingleColourDefinition(definition) {
  return definition?.type === "single-colour";
}

// Parses "rgb(159,159,159)" (0-255 channels) into 0..1 channels.
// Returns null for anything else so callers can fall back.
export function parseRgbColour(text) {
  const match = /^\s*rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*$/i.exec(String(text ?? ""));
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (!channels.every((value) => value >= 0 && value <= 255)) return null;
  const [r, g, b] = channels.map((value) => value / 255);
  return { r, g, b };
}
