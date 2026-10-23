// Camera state that can be remembered and restored: used to give every scene
// its own camera (switching A -> B -> A returns to where A was left) and to
// persist the camera in the saved session.
//
// A state is { projection, position, target, up, zoom }. `position`/`target`
// are what OrbitControls navigates; `up` is included because the preset views
// rewrite it (a "top" view flips it), and `zoom` because an orthographic
// camera zooms by scaling its frustum rather than by moving. `projection`
// records which camera the state was captured from; the two kinds zoom
// differently, so a state is converted (convertCameraState) before it is
// applied to the other kind.
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
 * The same view for the other kind of camera, so switching between
 * perspective and orthographic keeps what is on screen (a Top view stays a
 * Top view) instead of jumping back to the export's camera.
 *
 * The orbit target and viewing direction are kept, and the size of the view
 * at the target is matched. A perspective camera shows a height of
 * 2·d·tan(fov/2) at distance d; the orthographic camera's frustum is built
 * for the scene's home distance H with the same field of view
 * (createCamera), so it shows 2·H·tan(fov/2) / zoom. Matching the two gives
 * zoom = H / d one way and d = H / zoom the other.
 *
 * @param {object} state a camera state (snapshotCameraState)
 * @param {"perspective"|"orthographic"} projection the camera it is for
 * @param {number} homeDistance distance from the scene's export camera to its
 *   focal point, which sized the orthographic frustum
 * @returns {object|null} the state unchanged when it already suits
 *   `projection` (or does not say which camera it came from), the converted
 *   state, or null when it cannot be used
 */
export function convertCameraState(state, projection, homeDistance) {
  if (!isValidCameraState(state)) return null;
  if (state.projection === undefined || state.projection === projection) return state;
  if (!(homeDistance > 0) || !Number.isFinite(homeDistance)) return null;

  const offset = {
    x: state.position.x - state.target.x,
    y: state.position.y - state.target.y,
    z: state.position.z - state.target.z,
  };
  const distance = Math.hypot(offset.x, offset.y, offset.z);
  if (!(distance > 0)) return null;
  const zoom = state.zoom ?? 1;

  if (projection === "orthographic") {
    return { ...state, projection, zoom: (homeDistance / distance) * zoom };
  }
  const scale = homeDistance / zoom / distance;
  return {
    ...state,
    projection,
    position: {
      x: state.target.x + offset.x * scale,
      y: state.target.y + offset.y * scale,
      z: state.target.z + offset.z * scale,
    },
    zoom: 1,
  };
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
