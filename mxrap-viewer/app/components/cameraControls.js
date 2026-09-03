// Camera navigation for the 3D viewer: rotate, zoom, tilt and pan
// (OrbitControls), plus a smooth animated "reset / go to view" helper
// used for the Reset View button and for recentring after a scene swap.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Keep tilt just short of straight up/down to avoid the OrbitControls
// gimbal-lock edge case at the poles. Otherwise the full tilt range stays
// available — mine geometry (tunnels, underground structures) can need
// viewing from any angle, not just "from above".
const POLAR_ANGLE_EPSILON = 0.001;

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
 * Smoothly animate the camera position and orbit target to a new view.
 * Returns a cancel function (call it if the component unmounts or a new
 * animation starts mid-flight).
 *
 * @param {THREE.Camera} camera
 * @param {OrbitControls} controls
 * @param {{x:number,y:number,z:number}} position
 * @param {{x:number,y:number,z:number}} target
 * @param {number} duration ms
 */
export function animateCameraTo(camera, controls, position, target, duration = 600) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPosition = new THREE.Vector3(position.x, position.y, position.z);
  const endTarget = new THREE.Vector3(target.x, target.y, target.z);

  const startTime = performance.now();
  let frameId = requestAnimationFrame(step);

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

    camera.position.lerpVectors(startPosition, endPosition, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    controls.update();

    if (t < 1) {
      frameId = requestAnimationFrame(step);
    }
  }

  return () => cancelAnimationFrame(frameId);
}
