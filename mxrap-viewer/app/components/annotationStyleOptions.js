// Viewer-wide annotation style options (the Annotations panel's font picker)
// and the pure colour helpers that panel needs. Kept free of React so the
// rules can be unit tested and shared by the panel, the page and the session
// restore validation.

import { BARE_TEXT_COLOR, DEFAULT_TEXT_COLOR } from "./annotationsBuilder";

// Values are font-family lists only (no size/weight) — annotationsBuilder
// keeps each annotation's own size/weight and swaps just the family, so
// picking a font doesn't silently override the export's sizing.
export const ANNOTATION_FONT_CHOICES = [
  { label: "Default (from data)", value: "" },
  { label: "Sans-serif (Inter)", value: "Inter, system-ui, Arial, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace (Courier New)", value: "'Courier New', monospace" },
  { label: "Handwritten (Comic Sans, if installed)", value: "'Comic Sans MS', cursive" },
];

// WCAG AA contrast for normal-size text.
const MIN_TEXT_CONTRAST = 4.5;

const HEX_COLOUR_RE = /^#[0-9a-f]{6}$/i;

/** True for a "#rrggbb" string — the only form <input type="color"> accepts. */
export function isHexColour(value) {
  return typeof value === "string" && HEX_COLOUR_RE.test(value);
}

function byteToHex(value) {
  return Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
}

function parseRgbChannel(token) {
  const number = Number.parseFloat(token);
  if (!Number.isFinite(number)) return null;
  return token.endsWith("%") ? (number / 100) * 255 : number;
}

/**
 * Normalises a CSS colour from an export ("#abc", "#aabbcc", "#aabbccdd",
 * "rgb(0,0,255)", "rgba(0 0 255 / 0.5)") to "#rrggbb", dropping any alpha.
 * Returns null for anything else (named colours, hsl(), garbage) so callers
 * can pick their own fallback rather than feed an invalid value to a colour input.
 */
export function toHexColour(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();

  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/.exec(text);
  if (shortHex) return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`;

  const longHex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(text);
  if (longHex) return `#${longHex[1]}`;

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const tokens = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (tokens.length < 3) return null;
    const channels = tokens.slice(0, 3).map(parseRgbChannel);
    if (channels.some((channel) => channel === null)) return null;
    return `#${channels.map(byteToHex).join("")}`;
  }
  return null;
}

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#rrggbb" colours (1 – 21). */
export function contrastRatio(hexA, hexB) {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks a readable text colour for a custom label background. Returns null
 * when `currentTextColour` (the colour that would otherwise be drawn) already
 * reads fine on `backgroundColour`, or when the background can't be parsed;
 * otherwise the darker or lighter of the two built-in label text colours,
 * whichever contrasts more.
 */
export function pickReadableTextColour(backgroundColour, currentTextColour) {
  const background = toHexColour(backgroundColour);
  if (!background) return null;
  const current = toHexColour(currentTextColour);
  if (current && contrastRatio(current, background) >= MIN_TEXT_CONTRAST) return null;
  const dark = DEFAULT_TEXT_COLOR.toLowerCase();
  const light = BARE_TEXT_COLOR.toLowerCase();
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;
}
