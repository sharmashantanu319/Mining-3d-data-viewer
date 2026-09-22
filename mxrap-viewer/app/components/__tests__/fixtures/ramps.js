// Synthetic ramp CSV builders for the colour-mapping tests.
//
// These are NOT the customer's ramp files. They are hand-written to exercise
// the parser and the normalizer's boundary behaviour with known numbers, so
// no customer data is committed.

export const RAMP_HEADER = [
  "Up to",
  "Symbol",
  "Start Colour (H)",
  "Start Colour (S)",
  "Start Colour (V)",
  "End Colour (H)",
  "End Colour (S)",
  "End Colour (V)",
  "Colour Ramp",
  "Number of Colours",
  "Transparency [0..100]",
  "Colour Space",
  "Start Colour Colour Space",
  "End Colour Colour Space",
  "End Transparency [0..100]",
].join(",");

/**
 * Build one ramp CSV row. Any field left out uses a benign default.
 */
export function rampRow({
  upTo = "",
  symbol = "",
  start = [0, 1, 1],
  end = [0.667, 1, 1],
  curve = "linear",
  numberOfColours = "",
  transparency = "",
  space = "HSV",
  startSpace = "HSV",
  endSpace = "HSV",
  endTransparency = "",
} = {}) {
  return [
    upTo,
    symbol,
    start[0],
    start[1],
    start[2],
    end[0],
    end[1],
    end[2],
    curve,
    numberOfColours,
    transparency,
    space,
    startSpace,
    endSpace,
    endTransparency,
  ].join(",");
}

export function rampCsv(rows) {
  return [RAMP_HEADER, ...rows].join("\n");
}

/**
 * A well-formed 8-segment ramp in canonical order (blank "Up to" first, then
 * descending) over the domain [-4, 4].
 */
export function eightSegmentRamp() {
  return rampCsv([
    rampRow({ upTo: "", start: [0, 0, 0.5], end: [0, 0, 0.5], curve: "none" }),
    rampRow({ upTo: 3, start: [0.1, 1, 1], end: [0, 1, 0.7] }),
    rampRow({ upTo: 2, start: [0.17, 1, 1], end: [0, 1, 0.7] }),
    rampRow({ upTo: 1, start: [0.33, 1, 1], end: [0.17, 1, 1] }),
    rampRow({ upTo: 0, start: [0.51, 0.35, 1], end: [0.33, 1, 1] }),
    rampRow({ upTo: -1, start: [0.62, 0.69, 1], end: [0.51, 0.35, 1] }),
    rampRow({ upTo: -2, start: [0.67, 0.04, 0.66], end: [0.67, 0.04, 0.66], curve: "none" }),
    rampRow({ upTo: -3, start: [0.67, 0.04, 0.87], end: [0.67, 0.04, 0.66], curve: "none" }),
  ]);
}
