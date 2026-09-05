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
  const near = 0.1;
  const far = 1000;

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

export function animateCameraTo(camera, controls, position, target, duration = 600) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPosition = new THREE.Vector3(position.x, position.y, position.z);
  const endTarget = new THREE.Vector3(target.x, target.y, target.z);

  const startTime = performance.now();
  let frameId = requestAnimationFrame(step);

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    camera.position.lerpVectors(startPosition, endPosition, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    controls.update();

    if (t < 1) {
      frameId = requestAnimationFrame(step);
    }
  }

  return () => cancelAnimationFrame(frameId);
}