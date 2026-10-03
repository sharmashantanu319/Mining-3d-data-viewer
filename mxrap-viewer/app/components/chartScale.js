// Axis maths for the chart view: mapping a value to a position along an
// axis, and choosing readable tick values for linear, log10 and datetime
// axes. Pure so it can be tested without a canvas.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Candidate datetime steps, smallest to largest.
const TIME_STEPS = [
  MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 365 * DAY,
];

/**
 * Position of `value` along an axis as a fraction in [0, 1] (not clamped),
 * for a linear/datetime axis or a log10 one. Returns null for a value the
 * axis cannot place (a non-positive value on a log axis, a zero-width range).
 *
 * @param {number} value
 * @param {{min: number, max: number}} range
 * @param {"datetime"|"linear"|"log10"} scale
 * @returns {number|null}
 */
export function axisFraction(value, range, scale) {
  if (!Number.isFinite(value) || !range) return null;
  if (scale === "log10") {
    if (value <= 0 || range.min <= 0 || range.max <= 0) return null;
    const span = Math.log10(range.max) - Math.log10(range.min);
    if (span === 0) return null;
    return (Math.log10(value) - Math.log10(range.min)) / span;
  }
  const span = range.max - range.min;
  if (span === 0) return null;
  return (value - range.min) / span;
}

/**
 * Widens a degenerate (min === max) range so there is something to draw.
 *
 * @param {{min: number, max: number}|null} range
 * @returns {{min: number, max: number}|null}
 */
export function padDegenerateRange(range) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  if (range.max > range.min) return range;
  const pad = Math.abs(range.min) * 0.05 || 1;
  return { min: range.min - pad, max: range.max + pad };
}

function niceStep(rawStep) {
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const fraction = rawStep / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Tick values for a range. `target` is roughly how many ticks fit.
 *
 * @param {{min: number, max: number}} range
 * @param {"datetime"|"linear"|"log10"} scale
 * @param {number} [target]
 * @returns {number[]}
 */
export function computeTicks(range, scale, target = 6) {
  if (!range || !(range.max > range.min)) return [];

  if (scale === "log10") {
    if (range.min <= 0) return [];
    const ticks = [];
    for (let power = Math.floor(Math.log10(range.min)); power <= Math.ceil(Math.log10(range.max)); power += 1) {
      const value = 10 ** power;
      if (value >= range.min && value <= range.max) ticks.push(value);
    }
    return ticks;
  }

  const rawStep = (range.max - range.min) / target;
  let step;
  if (scale === "datetime") {
    step = TIME_STEPS.find((candidate) => candidate >= rawStep) ?? niceStep(rawStep / DAY) * DAY;
  } else {
    step = niceStep(rawStep);
  }

  // Datetime ticks sit on UTC midnight boundaries for day-sized steps (the
  // viewer reads zoneless export dates as UTC, see customerDate.js).
  const ticks = [];
  for (let value = Math.ceil(range.min / step) * step; value <= range.max; value += step) {
    ticks.push(value);
  }
  return ticks;
}

/**
 * Label for a tick value.
 *
 * @param {number} value
 * @param {"datetime"|"linear"|"log10"} scale
 * @param {number} [step]  spacing between ticks, so labels carry just enough precision
 * @returns {string}
 */
export function formatTick(value, scale, step = 0) {
  if (scale === "datetime") {
    const iso = new Date(value).toISOString();
    return step > 0 && step < DAY ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
  }
  if (scale === "log10") return value >= 1000 || value < 0.01 ? value.toExponential(0) : String(value);
  if (step > 0 && step < 1) return value.toFixed(Math.min(4, Math.ceil(-Math.log10(step))));
  return Math.abs(value) >= 10000 ? value.toExponential(1) : String(Math.round(value * 1e6) / 1e6);
}
