// Grid for plan and section views, as the client described mXrap's (24 Sep
// meeting): it only appears in an orthographic view that looks straight down
// one of the world axes (Top, Front or Side), disappears as soon as the view
// is tilted, and keeps roughly 6 to 8 lines on screen whatever the zoom.
//
// Pure geometry: ThreeScene draws the lines returned here and positions the
// coordinate labels; nothing in this module touches the DOM or WebGL.

import * as THREE from "three";

// A view this close to an axis counts as looking straight along it. The Top
// preset leans about 0.1 degrees so north stays up (presetCameraOffset), and
// that still has to count; tilting by a degree does not.
export const PLAN_VIEW_TOLERANCE_DEGREES = 0.5;

// Lines aimed for across the wider side of the view. With 1, 2, 2.5 and 5
// steps the actual count stays between about 5 and 10.
export const PLAN_GRID_TARGET_LINES = 7;

const NICE_MULTIPLIERS = [1, 2, 2.5, 5];
const AXES = ["x", "y", "z"];
// Never build more lines than this, whatever the numbers say.
const MAX_LINES_PER_DIRECTION = 200;

/**
 * The world axis a view direction looks straight along, or null when the
 * view is tilted away from every axis.
 *
 * @param {{x:number,y:number,z:number}} direction the camera's viewing direction
 * @param {number} [toleranceDegrees]
 * @returns {"x"|"y"|"z"|null}
 */
export function alignedViewAxis(direction, toleranceDegrees = PLAN_VIEW_TOLERANCE_DEGREES) {
  const length = Math.hypot(direction?.x, direction?.y, direction?.z);
  if (!(length > 0) || !Number.isFinite(length)) return null;
  const minimumCosine = Math.cos(THREE.MathUtils.degToRad(toleranceDegrees));
  return AXES.find((axis) => Math.abs(direction[axis] / length) >= minimumCosine) ?? null;
}

/**
 * Grid spacing for a view `extent` wide: a 1, 2, 2.5 or 5 times a power of
 * ten, the one closest (on a log scale) to giving `targetLines` lines.
 *
 * @param {number} extent width of the view in world units
 * @param {number} [targetLines]
 * @returns {number|null}
 */
export function niceGridStep(extent, targetLines = PLAN_GRID_TARGET_LINES) {
  if (!(extent > 0) || !Number.isFinite(extent) || !(targetLines > 0)) return null;
  const ideal = extent / targetLines;
  const power = Math.floor(Math.log10(ideal));
  let best = null;
  for (let p = power - 1; p <= power + 1; p++) {
    for (const multiplier of NICE_MULTIPLIERS) {
      const step = Number((multiplier * 10 ** p).toPrecision(12));
      const distance = Math.abs(Math.log(step / ideal));
      if (!best || distance < best.distance) best = { step, distance };
    }
  }
  return best.step;
}

/**
 * The multiples of `step` from `min` to `max`, inclusive.
 *
 * @returns {number[]} empty for an empty range or an unusable step
 */
export function gridValues(min, max, step) {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  if (last - first + 1 > MAX_LINES_PER_DIRECTION) return [];
  const values = [];
  for (let k = first; k <= last; k++) values.push(Number((k * step).toPrecision(12)) + 0);
  return values;
}

// Decimal places `step` needs: 0 for 25, 1 for 2.5, 2 for 0.25.
function stepDecimals(step) {
  for (let decimals = 0; decimals <= 10; decimals++) {
    const scaled = step * 10 ** decimals;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6 * Math.max(1, scaled)) return decimals;
  }
  return 10;
}

/**
 * A grid line's coordinate as its label shows it: as many decimals as the
 * step has, no thousands separators (like coordinates elsewhere in the
 * viewer), and never "-0".
 */
export function formatGridValue(value, step) {
  const text = value.toFixed(stepDecimals(step));
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

/**
 * The part of the segment a-b inside the rectangle [0, width] x [0, height]
 * (Liang-Barsky), or null when it misses the rectangle.
 *
 * @returns {[[number, number], [number, number]] | null}
 */
export function clipSegmentToRect(a, b, width, height) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges = [
    [-dx, a[0]],
    [dx, width - a[0]],
    [-dy, a[1]],
    [dy, height - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/**
 * The grid for the camera's current view, or null when there should be none
 * (a perspective camera, or a view not looking straight along an axis).
 *
 * The lines lie in the plane through the orbit target at right angles to the
 * viewing axis. Each has its world end points (for drawing) and, when it
 * crosses the view, a label: at the line's lower end for lines running up
 * and down the screen, at its left end for lines running across.
 *
 * @param {THREE.Camera} camera
 * @param {{x:number,y:number,z:number}} target the orbit target
 * @param {number} width view width in CSS pixels
 * @param {number} height view height in CSS pixels
 * @returns {null | {
 *   axis: "x"|"y"|"z",
 *   step: number,
 *   lines: { axis: "x"|"y"|"z", value: number, from: THREE.Vector3, to: THREE.Vector3,
 *            label: null | { text: string, x: number, y: number, edge: "bottom"|"left" } }[]
 * }}
 */
export function computePlanGrid(camera, target, width, height) {
  if (!camera?.isOrthographicCamera || !(width > 0) || !(height > 0) || !target) return null;
  camera.updateMatrixWorld();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const axis = alignedViewAxis(direction);
  if (!axis) return null;
  const [u, v] = AXES.filter((a) => a !== axis);
  const depth = target[axis];

  // Where the view's corners meet the grid plane: in an orthographic view
  // every pixel looks along the same direction, from its point on the near
  // plane.
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const origin = new THREE.Vector3(x, y, -1).unproject(camera);
    return origin.addScaledVector(direction, (depth - origin[axis]) / direction[axis]);
  });
  const range = (key) => [Math.min(...corners.map((c) => c[key])), Math.max(...corners.map((c) => c[key]))];
  const [uMin, uMax] = range(u);
  const [vMin, vMax] = range(v);
  const step = niceGridStep(Math.max(uMax - uMin, vMax - vMin));
  if (!step) return null;

  const toScreen = (point) => {
    const ndc = point.clone().project(camera);
    return [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
  };
  const worldPoint = (along, value, across, acrossValue) => {
    const point = new THREE.Vector3();
    point[axis] = depth;
    point[along] = value;
    point[across] = acrossValue;
    return point;
  };

  const lines = [];
  for (const [lineAxis, other, [min, max], [otherMin, otherMax]] of [
    [u, v, [uMin, uMax], [vMin, vMax]],
    [v, u, [vMin, vMax], [uMin, uMax]],
  ]) {
    for (const value of gridValues(min, max, step)) {
      const from = worldPoint(lineAxis, value, other, otherMin);
      const to = worldPoint(lineAxis, value, other, otherMax);
      const visible = clipSegmentToRect(toScreen(from), toScreen(to), width, height);
      let label = null;
      if (visible) {
        const [[ax, ay], [bx, by]] = visible;
        const runsUpAndDown = Math.abs(by - ay) >= Math.abs(bx - ax);
        const [x, y] = runsUpAndDown
          ? (ay >= by ? [ax, ay] : [bx, by])
          : (ax <= bx ? [ax, ay] : [bx, by]);
        label = {
          text: `${lineAxis.toUpperCase()} ${formatGridValue(value, step)}`,
          x,
          y,
          edge: runsUpAndDown ? "bottom" : "left",
        };
      }
      lines.push({ axis: lineAxis, value, from, to, label });
    }
  }
  return { axis, step, lines };
}
