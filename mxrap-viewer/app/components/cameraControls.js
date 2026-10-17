// Camera navigation for the 3D viewer: rotate, zoom, tilt and pan
// (OrbitControls), plus a smooth animated "reset / go to view" helper
// used for the Reset View button and for recentring after a scene swap.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const POLAR_ANGLE_EPSILON = 0.001;

// Field of view used for the perspective camera, and re-used to size the
// orthographic frustum so switching projection mode doesn't change the
// apparent scale of the model.
const CAMERA_FOV_DEGREES = 50;

/**
 * Create either a perspective or an orthographic camera.
 *
 * Facilitator question (2 Sep): mine engineers reviewing scenes may want a
 * parallel-projection view (no perspective foreshortening) alongside the
 * default perspective view, e.g. to compare distances/sizes without depth
 * distortion. Three.js supports this natively via THREE.OrthographicCamera;
 * this just picks which one to build.
 *
 * The orthographic frustum height is derived from `distanceToTarget` and
 * the same FOV as the perspective camera, so the initial view looks the
 * same size in both modes — only the projection (foreshortening) differs.
 *
 * @param {"perspective"|"orthographic"} projectionMode
 * @param {number} aspect width / height
 * @param {number} distanceToTarget camera distance from its orbit target
 */
export function createCamera(projectionMode, aspect, distanceToTarget) {
  // near/far 根据相机到目标的真实距离动态计算，不能用固定数字。
  // 之前踩过的坑：固定的 near=0.1/far=1000（或类似比例失衡的值）
  // 会导致真实矿井坐标（数值上千）超出 far 范围，画面完全空白，
  // 或者 near/far 比例过大导致深度精度问题、同样导致不可见。
  // near/far must be computed from the real distance-to-target, not
  // fixed numbers — a fixed far=1000 clips out real mine coordinates
  // (which can be in the thousands), and a too-extreme near/far ratio
  // causes depth-precision issues, both resulting in a blank screen.
  const near = Math.max(distanceToTarget / 1000, 0.01);
  const far = Math.max(distanceToTarget * 100, 1000);

  if (projectionMode === "orthographic") {
    const viewHeight =
      2 * distanceToTarget * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEGREES / 2));
    const viewWidth = viewHeight * aspect;
    return new THREE.OrthographicCamera(
      -viewWidth / 2,
      viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      near,
      far
    );
  }

  return new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, aspect, near, far);
}

/**
 * Update a camera's projection after a container resize. Works for either
 * camera type — perspective just needs a new aspect, orthographic needs its
 * frustum width recomputed (height is preserved so zoom level isn't reset).
 *
 * @param {THREE.Camera} camera
 * @param {number} width
 * @param {number} height
 */
export function updateCameraAspect(camera, width, height) {
  const aspect = width / height;

  if (camera.isOrthographicCamera) {
    const viewHeight = camera.top - camera.bottom;
    const viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
  } else {
    camera.aspect = aspect;
  }

  camera.updateProjectionMatrix();
}

/**
 * Create and configure OrbitControls for a scene's camera.
 * Zoom limits scale with the scene's own starting camera distance, so the
 * same defaults work whether the model spans a few metres or kilometres.
 *
 * @param {THREE.Camera} camera
 * @param {HTMLElement} domElement
 * @param {THREE.Vector3} target point the camera orbits around
 */
export function createCameraControls(camera, domElement, target) {
  const controls = new OrbitControls(camera, domElement);
  controls.target.copy(target);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  controls.enablePan = true;
  controls.screenSpacePanning = true;

  const initialDistance = camera.position.distanceTo(target) || 1;
  controls.minDistance = Math.max(initialDistance * 0.05, 0.01);
  controls.maxDistance = initialDistance * 20;

  controls.minPolarAngle = POLAR_ANGLE_EPSILON;
  controls.maxPolarAngle = Math.PI - POLAR_ANGLE_EPSILON;

  controls.update();
  return controls;
}

/**
 * Camera distance, and zoom for an orthographic camera, that make a box fill
 * the view when looking at its centre from `direction`, with `margin` to
 * spare (1.15: the box spans 1/1.15 of the view in its tighter dimension).
 *
 * Works from the box's 8 corners rather than its bounding sphere: in the
 * customer exports a long decline runs off to one side, which made the
 * sphere several times bigger than the mine itself, so Fit and the
 * Top/Front/Side views showed it small in a mostly empty view. An
 * orthographic camera's apparent size comes from its zoom, not its
 * distance, so for it the zoom is what fits the box; it is kept at the
 * distance a perspective camera would need for the bounding sphere so
 * clipping and orbiting behave as before.
 *
 * @param {THREE.Camera} camera perspective (fov, aspect, zoom) or
 *   orthographic (frustum extents at zoom 1)
 * @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} box
 * @param {{x:number,y:number,z:number}} direction from the box centre towards the camera
 * @param {{x:number,y:number,z:number}} up the camera's up vector
 * @returns {{distance:number, zoom:number|null}|null} zoom is null for a
 *   perspective camera; null overall when the box has no size or the
 *   direction is zero
 */
export function fitBoxToView(camera, box, direction, up, margin = 1.15) {
  const back = unit(direction);
  if (!back) return null;
  // Same screen axes as Matrix4.lookAt: right = up x back, screen up = back x right.
  let right = unit(cross(up, back));
  const rollKnown = Boolean(right);
  if (!right) right = unit(cross(Math.abs(back.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0), back));
  const screenUp = cross(back, right);

  const center = scaled(plus(box.min, box.max), 0.5);
  const corners = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const offset = plus(vec(x, y, z), scaled(center, -1));
        const across = dot(offset, right);
        const along = dot(offset, screenUp);
        // Looking straight along `up` leaves the screen's roll undefined, so
        // size for the widest the box can be in any direction.
        const spread = rollKnown ? null : Math.hypot(across, along);
        corners.push({ x: spread ?? across, y: spread ?? along, depth: dot(offset, back) });
      }
    }
  }
  const radius = Math.max(...corners.map((c) => Math.hypot(c.x, c.y, c.depth)));
  if (!(radius > 0) || !Number.isFinite(radius)) return null;

  if (camera.isOrthographicCamera) {
    const halfWidth = Math.max(...corners.map((c) => Math.abs(c.x)));
    const halfHeight = Math.max(...corners.map((c) => Math.abs(c.y)));
    const zoom = Math.min(
      halfWidth > 0 ? (camera.right - camera.left) / 2 / (halfWidth * margin) : Infinity,
      halfHeight > 0 ? (camera.top - camera.bottom) / 2 / (halfHeight * margin) : Infinity
    );
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(CAMERA_FOV_DEGREES / 2))) * 1.2;
    return { distance, zoom: Number.isFinite(zoom) ? zoom : null };
  }

  // Perspective: a corner `depth` towards the camera sits at distance - depth
  // from it, and is inside the frustum when its sideways offset (with the
  // margin) is no more than that times tan(half field of view).
  const tanHalfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (camera.zoom || 1);
  const tanHalfWidth = tanHalfHeight * camera.aspect;
  let distance = 0;
  for (const c of corners) {
    distance = Math.max(
      distance,
      c.depth + (Math.abs(c.x) * margin) / tanHalfWidth,
      c.depth + (Math.abs(c.y) * margin) / tanHalfHeight
    );
  }
  const nearestDepth = Math.max(...corners.map((c) => c.depth));
  return { distance: Math.max(distance, nearestDepth + radius * 0.05), zoom: null };
}

/**
 * @param {number|null} [zoom] orthographic cameras only: zoom to reach by the
 *   end of the animation (e.g. from fitBoxToView); ignored otherwise
 */
export function animateCameraTo(camera, controls, position, target, duration = 600, zoom = null) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPosition = new THREE.Vector3(position.x, position.y, position.z);
  const endTarget = new THREE.Vector3(target.x, target.y, target.z);
  const startZoom = camera.zoom;
  const animateZoom = camera.isOrthographicCamera && Number.isFinite(zoom) && zoom > 0;

  const startTime = performance.now();
  let frameId = requestAnimationFrame(step);

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    camera.position.lerpVectors(startPosition, endPosition, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    if (animateZoom) {
      camera.zoom = startZoom + (zoom - startZoom) * eased;
      camera.updateProjectionMatrix();
    }
    controls.update();

    if (t < 1) {
      frameId = requestAnimationFrame(step);
    }
  }

  return () => cancelAnimationFrame(frameId);
}

// ---------------------------------------------------------------------------
// Level "up" and preset views
// ---------------------------------------------------------------------------

function vec(x, y, z) {
  return { x, y, z };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function scaled(a, s) {
  return vec(a.x * s, a.y * s, a.z * s);
}
function plus(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}
function cross(a, b) {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function unit(a) {
  const length = Math.hypot(a.x, a.y, a.z);
  return Number.isFinite(length) && length > 1e-12 ? scaled(a, 1 / length) : null;
}

const WORLD_AXES = [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1), vec(-1, 0, 0), vec(0, -1, 0), vec(0, 0, -1)];

/**
 * mXrap stores the camera's "view up" made perpendicular to the viewing
 * direction, so a level camera looking slightly down at the mine is saved as
 * up (0.053, 0.080, 0.995) rather than (0, 0, 1). OrbitControls orbits around
 * whatever up it is created with, so that tilted vector made horizontal drags
 * wobble and would rotate a plan view by about 33 degrees.
 *
 * When the stored up is exactly a world axis made perpendicular to the view
 * direction, this returns that axis instead: the starting view is identical
 * (lookAt makes it perpendicular again) and the camera orbits around true
 * vertical. A camera with a real roll is returned unchanged.
 *
 * @param {{x:number,y:number,z:number}} up
 * @param {{x:number,y:number,z:number}} position
 * @param {{x:number,y:number,z:number}} target
 * @returns {{x:number,y:number,z:number}}
 */
export function levelCameraUp(up, position, target, tolerance = 1e-4) {
  const u = unit(up);
  const view = unit(plus(target, scaled(position, -1)));
  if (!u || !view) return up;
  for (const axis of WORLD_AXES) {
    const perpendicular = unit(plus(axis, scaled(view, -dot(axis, view))));
    if (perpendicular && dot(perpendicular, u) > 1 - tolerance) return { ...axis };
  }
  return up;
}

export const PRESET_VIEWS = ["top", "front", "side"];

/**
 * Camera offset from the orbit target for a preset view, like mXrap's
 * XY / XZ / YZ buttons:
 *   top    plan view looking straight down, north up, east to the right
 *   front  section looking north, east to the right
 *   side   section looking west, north to the right
 *
 * The vertical is the world axis closest to the camera's up: Z for the
 * customer's mine grids (X east, Y north), Y for the built-in demo scenes
 * (X east, -Z north). The camera's up is left alone - OrbitControls fixes
 * its orbit axis when it is created - so "top" leans a hair to the south to
 * keep north at the top of the screen.
 *
 * @param {"top"|"front"|"side"} view
 * @param {{x:number,y:number,z:number}} up the camera's up vector
 * @param {number} distance camera distance from the target
 * @returns {{x:number,y:number,z:number}|null} null for an unknown view
 */
export function presetCameraOffset(view, up, distance) {
  const magnitudes = [Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)];
  const vertical = magnitudes.indexOf(Math.max(...magnitudes));
  let upAxis;
  let east;
  let north;
  if (vertical === 2) {
    upAxis = vec(0, 0, Math.sign(up.z) || 1);
    east = vec(1, 0, 0);
    north = vec(0, 1, 0);
  } else if (vertical === 1) {
    upAxis = vec(0, Math.sign(up.y) || 1, 0);
    east = vec(1, 0, 0);
    north = vec(0, 0, -1);
  } else {
    upAxis = vec(Math.sign(up.x) || 1, 0, 0);
    east = vec(0, 1, 0);
    north = vec(0, 0, 1);
  }
  const tidy = (v) => vec(v.x + 0, v.y + 0, v.z + 0); // -0 -> 0
  if (view === "top") return tidy(plus(scaled(upAxis, distance), scaled(north, -distance * 0.002)));
  if (view === "front") return tidy(scaled(north, -distance));
  if (view === "side") return tidy(scaled(east, distance));
  return null;
}
