import { describe, expect, it } from "vitest";
import { SCENE_SCOPED_STATE_DEFAULTS, isSceneSwitch } from "../sceneViewState";

describe("SCENE_SCOPED_STATE_DEFAULTS", () => {
  it("resets exactly the state that is indexed by point series", () => {
    expect(SCENE_SCOPED_STATE_DEFAULTS).toEqual({
      selectedSeries: 0,
      filtersBySeries: {},
      seriesVisibility: {},
      nullVisibility: {},
      markerSelections: {},
      markerSeriesIndex: 0,
    });
  });

  it("does not include any view-level preference", () => {
    const keys = Object.keys(SCENE_SCOPED_STATE_DEFAULTS);
    for (const kept of ["projectionMode", "markerScale", "annotationScale", "annotationFont", "annotationsVisible"]) {
      expect(keys).not.toContain(kept);
    }
  });

  it("is frozen so a reset can never mutate the shared defaults", () => {
    expect(Object.isFrozen(SCENE_SCOPED_STATE_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(SCENE_SCOPED_STATE_DEFAULTS.filtersBySeries)).toBe(true);
  });
});

describe("isSceneSwitch", () => {
  it("is true for another existing scene", () => {
    expect(isSceneSwitch(1, 0, 3)).toBe(true);
    expect(isSceneSwitch(0, 2, 3)).toBe(true);
  });

  it("is false for the current scene, e.g. Next in a single-scene export", () => {
    expect(isSceneSwitch(0, 0, 1)).toBe(false);
    expect(isSceneSwitch(2, 2, 3)).toBe(false);
  });

  it("is false for an index outside the scene list or a non-integer", () => {
    expect(isSceneSwitch(3, 0, 3)).toBe(false);
    expect(isSceneSwitch(-1, 0, 3)).toBe(false);
    expect(isSceneSwitch(NaN, 0, 3)).toBe(false);
    expect(isSceneSwitch(undefined, 0, 3)).toBe(false);
    expect(isSceneSwitch(1, 0, 0)).toBe(false);
  });
});
