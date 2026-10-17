// XYZ axis indicator in the bottom-left corner of the 3D view. It turns with
// the camera so the user can always tell which way the mine's X (east),
// Y (north) and Z (up) axes point.
//
// It is a small SVG over the canvas (AxisIndicator.jsx) rather than
// Three.js's ViewHelper: the letters are crisp and in the interface font, a
// round backdrop keeps it readable over busy geometry, and there is no
// second WebGL render pass. ViewHelper's default look (filled discs, three
// unlabelled dark discs for the negative axes, thick bars) read as clumsy
// on the dark viewport. ThreeScene calls updateAxisIndicator once per frame;
// it only touches the DOM when the camera has turned.

// Size of the square SVG, in CSS pixels.
export const AXIS_INDICATOR_SIZE = 68;
// On-screen length of an axis that lies flat on the screen, in CSS pixels.
export const AXIS_INDICATOR_LENGTH = 20;
// Distance from the end of an axis to the centre of its letter.
export const AXIS_LABEL_GAP = 8;

// Red X, green Y, blue Z as in most 3D tools, softened for the dark view.
export const AXIS_COLOURS = { X: "#FF6B7A", Y: "#7ED98B", Z: "#6AA9FF" };

const WORLD_AXES = [
  ["X", { x: 1, y: 0, z: 0 }],
  ["Y", { x: 0, y: 1, z: 0 }],
  ["Z", { x: 0, y: 0, z: 1 }],
];

// v rotated by the unit quaternion q.
function rotate(v, q) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/**
 * Where each world axis points on screen for a camera with this orientation.
 *
 * @param {{x:number,y:number,z:number,w:number}} quaternion the camera's
 *   orientation (camera.quaternion)
 * @param {number} [length] on-screen length of an axis lying flat on the screen
 * @param {number} [labelGap] distance from the axis end to its letter
 * @returns {{axis:string, colour:string, x:number, y:number, labelX:number,
 *   labelY:number, depth:number, opacity:number}[]} back to front, so later
 *   items are drawn over earlier ones. x / y are relative to the centre with
 *   y pointing down (SVG); depth is +1 for an axis pointing straight at the
 *   viewer and -1 for one pointing straight away.
 */
export function axisIndicatorLayout(quaternion, length = AXIS_INDICATOR_LENGTH, labelGap = AXIS_LABEL_GAP) {
  // World axes in camera space: rotate by the inverse (the conjugate).
  const inverse = { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w };
  return WORLD_AXES.map(([axis, direction]) => {
    const view = rotate(direction, inverse);
    const x = view.x * length;
    const y = -view.y * length;
    const flat = Math.hypot(x, y);
    // An axis pointing at or away from the viewer has no direction on
    // screen; its letter sits up and to the right of the centre.
    const [ux, uy] = flat > 0.5 ? [x / flat, y / flat] : [Math.SQRT1_2, -Math.SQRT1_2];
    return {
      axis,
      colour: AXIS_COLOURS[axis],
      x,
      y,
      labelX: x + ux * labelGap,
      labelY: y + uy * labelGap,
      depth: view.z,
      // Axes pointing away from the viewer fade, so the triad reads in depth.
      opacity: view.z >= 0 ? 1 : 1 + 0.55 * view.z,
    };
  }).sort((a, b) => a.depth - b.depth);
}

function rounded(value) {
  return String(Math.round(value * 100) / 100);
}

/**
 * Points the indicator's SVG (AxisIndicator.jsx) along the camera. Writes the
 * DOM only when the orientation changed since the last call.
 *
 * @param {SVGSVGElement|null} svg
 * @param {{x:number,y:number,z:number,w:number}} quaternion
 * @param {{last?: string}} memo per-indicator memory between calls
 */
export function updateAxisIndicator(svg, quaternion, memo) {
  if (!svg) return;
  const key = `${quaternion.x},${quaternion.y},${quaternion.z},${quaternion.w}`;
  if (memo.last === key) return;
  memo.last = key;
  const origin = svg.querySelector("[data-axis-origin]");
  for (const item of axisIndicatorLayout(quaternion)) {
    const group = svg.querySelector(`[data-axis="${item.axis}"]`);
    if (!group) continue;
    const line = group.querySelector("line");
    const label = group.querySelector("text");
    line?.setAttribute("x2", rounded(item.x));
    line?.setAttribute("y2", rounded(item.y));
    label?.setAttribute("x", rounded(item.labelX));
    label?.setAttribute("y", rounded(item.labelY));
    group.setAttribute("opacity", rounded(item.opacity));
    // Back to front: each group moves just before the origin dot.
    if (origin) svg.insertBefore(group, origin);
  }
}

/**
 * Tooltip for the indicator. Mine grids are Z-up with X east and Y north;
 * the built-in demo scenes are Y-up.
 *
 * @param {{x:number,y:number,z:number}|undefined} up the camera's up vector
 */
export function axisIndicatorTitle(up) {
  const zUp = up && Math.abs(up.z) >= Math.abs(up.x) && Math.abs(up.z) >= Math.abs(up.y);
  return zUp ? "Axes: X points east, Y north, Z up" : "Axes: X, Y and Z directions";
}
