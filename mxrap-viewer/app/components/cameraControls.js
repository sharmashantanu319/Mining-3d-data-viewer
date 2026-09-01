// Camera navigation for the 3D viewer: rotate, zoom, tilt and pan
// (OrbitControls), plus a smooth animated "reset / go to view" helper
// used for the Reset View button and for recentring after a scene swap.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const POLAR_ANGLE_EPSILON = 0.001;

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