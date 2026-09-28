// What happens to the viewer's state when the user switches scene.
//
// Reset (scene-scoped): everything that is indexed by point series or that
// only makes sense against one scene's data — the selected series, the
// filters, the per-series visibility, the null-value toggles and the
// per-series marker overrides. A different scene has different series, so
// carrying an index-keyed value across would apply it to an unrelated series.
//
// Kept (view-level preferences): the projection mode, the annotation visibility,
// scale and style, the marker scale, and the panel layout. They describe how the
// user likes to look at the data, not the data itself, so they stay put.
//
// Remembered per scene (see cameraState.js): the camera. Returning to a scene
// restores where the camera was left; a scene visited for the first time uses
// the export's own default camera.

/** Defaults the scene-scoped state is reset to on a scene switch. */
export const SCENE_SCOPED_STATE_DEFAULTS = Object.freeze({
  selectedSeries: 0,
  filtersBySeries: Object.freeze({}),
  seriesVisibility: Object.freeze({}),
  nullVisibility: Object.freeze({}),
  markerSelections: Object.freeze({}),
  markerSeriesIndex: 0,
});

/**
 * Whether `index` names a scene other than the current one. Switching to the
 * current scene (or to one that does not exist) must be a no-op: it would
 * otherwise wipe the filters and selection while the scene itself is not
 * rebuilt, e.g. pressing Next in an export with a single scene.
 */
export function isSceneSwitch(index, currentIndex, sceneCount) {
  return Number.isInteger(index) && index >= 0 && index < sceneCount && index !== currentIndex;
}
