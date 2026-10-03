// XYZ orientation gizmo: a small axis indicator in the bottom-left corner of
// the 3D view that rotates with the camera, so the user can always tell which
// way the mine's X (east), Y (north) and Z (up) axes point.
//
// It wraps Three.js's ViewHelper, which renders the *world* axes as seen by
// the camera into a small viewport. That works for any camera up vector (the
// scenes are Z-up) and for both the perspective and orthographic cameras.
//
// ViewHelper's click-to-look-along-an-axis animation is deliberately not
// wired up: it assumes a Y-up world and rewrites the camera directly, which
// would fight OrbitControls. Clicking an axis to snap to a preset view is a
// possible follow-up.

import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

// Gap between the gizmo and the bottom-left corner of the canvas, in CSS
// pixels. The viewport toolbar sits bottom-right, so the left corner is free.
export const ORIENTATION_GIZMO_MARGIN = 12;

const AXIS_LABELS = ["X", "Y", "Z"];

/**
 * @param {import("three").Camera} camera the camera whose orientation to show
 * @param {HTMLElement} domElement the renderer's canvas
 * @returns {ViewHelper}
 */
export function createOrientationGizmo(camera, domElement) {
  const gizmo = new ViewHelper(camera, domElement);
  gizmo.location = {
    top: null,
    right: 0,
    bottom: ORIENTATION_GIZMO_MARGIN,
    left: ORIENTATION_GIZMO_MARGIN,
  };
  gizmo.setLabels(...AXIS_LABELS);
  return gizmo;
}

/**
 * Draw the gizmo on top of the frame that was just rendered.
 *
 * ViewHelper renders a second scene into a corner viewport, and with the
 * renderer's default `autoClear` that render would wipe the whole canvas (the
 * scissor test is off), erasing the main scene. Auto-clear is therefore
 * switched off just for this call and always restored, even if rendering
 * throws.
 *
 * @param {import("three").WebGLRenderer} renderer
 * @param {ViewHelper} gizmo
 */
export function renderOrientationGizmo(renderer, gizmo) {
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  try {
    gizmo.render(renderer);
  } finally {
    renderer.autoClear = previousAutoClear;
  }
}
