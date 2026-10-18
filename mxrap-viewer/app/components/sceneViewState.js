// What happens to the viewer's settings when the user moves between scenes.
//
// The client asked for scenes to be independent (email of 22 September
// 2026): the camera view, the display settings and the enabled series all
// change with the scene, a scene starts with the camera and view settings
// its export gives it, and coming back to a scene should ideally find it as
// it was left.
//
// Kept per scene (a "scene view state", below): the projection, which point
// series, lines, surfaces and annotations are shown, the filters, the
// "points with no value" switches, the Marker Style choices, and which
// series the Filters and Marker Style sections are set to. A scene shown for
// the first time starts from its export: perspective or orthographic as its
// camera's Perspective flag says, and everything else as exported. Leaving a
// scene keeps its state and coming back restores it; the camera is kept the
// same way (cameraState.js).
//
// Shared by every scene (viewer preferences): the marker size slider, the
// annotation text size, font and colours, and which panels are open. They
// are not part of an export but how the user likes to read the screen, so
// they stay as they are while stepping through the slides.

import { restoreFilters, serializeFilters } from "./viewerSession";

const PROJECTIONS = ["perspective", "orthographic"];

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isIndex = (value) => Number.isInteger(value) && value >= 0;

/**
 * The projection a scene's export asks for: orthographic when its camera
 * has Perspective switched off, otherwise perspective.
 */
export function sceneProjection(scene) {
  return scene?.camera?.projection === "orthographic" ? "orthographic" : "perspective";
}

/** The state a scene starts with the first time it is shown. */
export function initialSceneViewState(scene) {
  return {
    selectedSeries: 0,
    filtersBySeries: {},
    seriesVisibility: {},
    lineVisibility: {},
    surfaceVisibility: {},
    nullVisibility: {},
    annotationsVisible: true,
    markerSelections: {},
    markerSeriesIndex: 0,
    projectionMode: sceneProjection(scene),
  };
}

/**
 * The state to show on entering scene `index`: the one it was left with, or
 * its starting state if it has not been shown yet.
 *
 * @param {Record<number, object>} rememberedStates states of scenes left earlier
 * @param {number} index
 * @param {object} scene the scene at `index`
 */
export function sceneViewStateOnEntry(rememberedStates, index, scene) {
  return rememberedStates?.[index] ?? initialSceneViewState(scene);
}

/**
 * Whether `index` names a scene other than the current one. Switching to the
 * current scene (or to one that does not exist) must be a no-op: it would
 * otherwise reset the scene's settings while the scene itself is not
 * rebuilt, e.g. pressing Next in an export with a single scene.
 */
export function isSceneSwitch(index, currentIndex, sceneCount) {
  return Number.isInteger(index) && index >= 0 && index < sceneCount && index !== currentIndex;
}

/**
 * Scene view states in a form JSON can hold: a category filter keeps its
 * allowed values (serializeFilters).
 *
 * @param {Record<number, object>} states
 */
export function serializeSceneViewStates(states) {
  return Object.fromEntries(
    Object.entries(states ?? {}).map(([index, state]) => [
      index,
      { ...state, filtersBySeries: serializeFilters(state?.filtersBySeries) },
    ])
  );
}

// `{ [seriesIndex]: value }` with only non-negative integer keys and the
// values `restore` accepts (it returns undefined for one it does not).
function restoreIndexKeyed(saved, restore) {
  const result = {};
  if (!isPlainObject(saved)) return result;
  for (const [key, value] of Object.entries(saved)) {
    if (!isIndex(Number(key)) || String(Number(key)) !== key) continue;
    const restored = restore(value);
    if (restored !== undefined) result[key] = restored;
  }
  return result;
}

const restoreBoolean = (value) => (typeof value === "boolean" ? value : undefined);

// A series' Marker Style choices (markerSelection.js): marker names (null is
// "None"), the size range and the invert switch. A cleared size box is NaN,
// which JSON saves as null.
function restoreMarkerSelection(selection) {
  if (!isPlainObject(selection)) return undefined;
  const restored = {};
  for (const key of ["colourMarker", "sizeMarker"]) {
    if (selection[key] === null || typeof selection[key] === "string") restored[key] = selection[key];
  }
  for (const key of ["minSize", "maxSize"]) {
    if (key in selection) restored[key] = Number.isFinite(selection[key]) ? selection[key] : NaN;
  }
  if (typeof selection.invertSize === "boolean") restored.invertSize = selection.invertSize;
  return restored;
}

/**
 * One scene's state from saved values, each one checked: anything missing
 * or unusable is the scene's starting value instead. Also reads a session
 * saved before scenes kept their own settings, which holds the then current
 * scene's settings at its top level under the same names.
 *
 * @param {unknown} saved
 * @param {object} scene the scene the state belongs to
 */
export function restoreSceneViewState(saved, scene) {
  const state = initialSceneViewState(scene);
  if (!isPlainObject(saved)) return state;
  if (isIndex(saved.selectedSeries)) state.selectedSeries = saved.selectedSeries;
  if (saved.filtersBySeries !== undefined) state.filtersBySeries = restoreFilters(saved.filtersBySeries);
  for (const key of ["seriesVisibility", "lineVisibility", "surfaceVisibility", "nullVisibility"]) {
    state[key] = restoreIndexKeyed(saved[key], restoreBoolean);
  }
  if (typeof saved.annotationsVisible === "boolean") state.annotationsVisible = saved.annotationsVisible;
  state.markerSelections = restoreIndexKeyed(saved.markerSelections, restoreMarkerSelection);
  if (isIndex(saved.markerSeriesIndex)) state.markerSeriesIndex = saved.markerSeriesIndex;
  if (PROJECTIONS.includes(saved.projectionMode)) state.projectionMode = saved.projectionMode;
  return state;
}

/**
 * Every scene's state from a saved session: `{ [sceneIndex]: state }` for
 * the scenes this export has. Other keys and non-object values are dropped.
 *
 * @param {unknown} saved
 * @param {object[]} scenes
 */
export function restoreSceneViewStates(saved, scenes) {
  const restored = {};
  if (!isPlainObject(saved) || !Array.isArray(scenes)) return restored;
  for (const [key, state] of Object.entries(saved)) {
    const index = Number(key);
    if (!isIndex(index) || index >= scenes.length || String(index) !== key || !isPlainObject(state)) continue;
    restored[index] = restoreSceneViewState(state, scenes[index]);
  }
  return restored;
}
