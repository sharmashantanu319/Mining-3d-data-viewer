// Camera state that can be remembered and restored: used to give every scene
// its own camera (switching A -> B -> A returns to where A was left) and to
// persist the camera in the saved session.
//
// A state is { projection, position, target, up, zoom }. `position`/`target`
// are what OrbitControls navigates; `up` is included because the preset views
// rewrite it (a "top" view flips it), and `zoom` because an orthographic
// camera zooms by scaling its frustum rather than by moving. `projection`
// records which camera the state was captured from, so it is never applied to
// the other kind (their zoom/distance semantics differ).
//
// States saved before `projection`/`up`/`zoom` existed only carry
// position/target; they stay valid and are applied as such.

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const isVector = (value) =>
  Boolean(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);

const toVector = (vector) => ({ x: vector.x, y: vector.y, z: vector.z });

/**
 * Snapshot a camera and its orbit target into a plain, serialisable state.
 *
 * @param {import("three").Camera} camera
 * @param {{x:number,y:number,z:number}} target the OrbitControls target
 */
export function snapshotCameraState(camera, target) {
  return {
    projection: camera.isOrthographicCamera ? "orthographic" : "perspective",
    position: toVector(camera.position),
    target: toVector(target),
    up: toVector(camera.up),
    zoom: camera.zoom,
  };
}

/**
 * Whether a value (e.g. read back from localStorage) is a usable camera
 * state. `up`, `zoom` and `projection` are optional, but if present they must
 * be well-formed, so a corrupt value is rejected rather than half-applied.
 */
export function isValidCameraState(state) {
  if (!state || typeof state !== "object") return false;
  if (!isVector(state.position) || !isVector(state.target)) return false;
  if (state.up !== undefined && !isVector(state.up)) return false;
  if (state.zoom !== undefined && !(isFiniteNumber(state.zoom) && state.zoom > 0)) return false;
  if (
    state.projection !== undefined &&
    state.projection !== "perspective" &&
    state.projection !== "orthographic"
  ) {
    return false;
  }
  return true;
}

/**
 * The state if it can be applied under `projectionMode`, otherwise null.
 * A state captured from the other kind of camera is not applied (the caller
 * then falls back to the scene's default camera); a legacy state without a
 * `projection` is accepted for either.
 */
export function cameraStateForProjection(state, projectionMode) {
  if (!isValidCameraState(state)) return null;
  if (state.projection !== undefined && state.projection !== projectionMode) return null;
  return state;
}

/**
 * Move `camera` and `controls` to a saved state, without animation. Returns
 * whether anything was applied. The orthographic zoom is only applied to an
 * orthographic camera.
 */
export function applyCameraState(camera, controls, state) {
  if (!camera || !controls || !isValidCameraState(state)) return false;

  if (state.up) camera.up.set(state.up.x, state.up.y, state.up.z);
  camera.position.set(state.position.x, state.position.y, state.position.z);
  controls.target.set(state.target.x, state.target.y, state.target.z);
  if (camera.isOrthographicCamera && state.zoom !== undefined) {
    camera.zoom = state.zoom;
    camera.updateProjectionMatrix();
  }
  controls.update();
  return true;
}

/**
 * Keep only the well-formed per-scene camera states of a saved session:
 * `{ [sceneIndex]: state }` with integer indices in [0, sceneCount).
 * Anything else (wrong type, out-of-range index, malformed state) is dropped.
 */
export function sanitizeSceneCameras(raw, sceneCount) {
  const result = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;

  for (const [key, state] of Object.entries(raw)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= sceneCount) continue;
    if (isValidCameraState(state)) result[index] = state;
  }
  return result;
}
