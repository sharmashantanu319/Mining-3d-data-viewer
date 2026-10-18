import { describe, expect, it } from "vitest";
import { createCategoryFilter, createRangeFilter, pointMatchesFilter } from "../dataFilters";
import {
  initialSceneViewState,
  isSceneSwitch,
  restoreSceneViewState,
  restoreSceneViewStates,
  sceneProjection,
  sceneViewStateOnEntry,
  serializeSceneViewStates,
} from "../sceneViewState";

// Scenes as parseExportFile returns them: the camera carries the projection
// read from the export's Perspective flag. The built-in demo scene has none.
const planScene = { id: "s1-plan", camera: { projection: "orthographic" } };
const obliqueScene = { id: "s2-oblique", camera: { projection: "perspective" } };
const demoScene = { id: "demo" };

const STARTING_STATE = {
  selectedSeries: 0,
  filtersBySeries: {},
  seriesVisibility: {},
  lineVisibility: {},
  surfaceVisibility: {},
  nullVisibility: {},
  annotationsVisible: true,
  markerSelections: {},
  markerSeriesIndex: 0,
};

const rangeFilter = (input, min, max) => ({
  kind: "range",
  input,
  inputType: "number",
  min,
  max,
  includeMissing: false,
  enabled: true,
  valid: true,
  errors: [],
});

describe("sceneProjection", () => {
  it("follows the export camera's Perspective flag", () => {
    expect(sceneProjection(planScene)).toBe("orthographic");
    expect(sceneProjection(obliqueScene)).toBe("perspective");
  });

  it("is perspective when the scene does not say", () => {
    expect(sceneProjection(demoScene)).toBe("perspective");
    expect(sceneProjection(undefined)).toBe("perspective");
    expect(sceneProjection({ camera: { projection: "fisheye" } })).toBe("perspective");
  });
});

describe("initialSceneViewState", () => {
  it("shows everything as exported, in the projection the export asks for", () => {
    expect(initialSceneViewState(planScene)).toEqual({ ...STARTING_STATE, projectionMode: "orthographic" });
    expect(initialSceneViewState(obliqueScene)).toEqual({ ...STARTING_STATE, projectionMode: "perspective" });
    expect(initialSceneViewState(demoScene)).toEqual({ ...STARTING_STATE, projectionMode: "perspective" });
  });

  it("gives each call its own objects, so one scene's changes never reach another", () => {
    const first = initialSceneViewState(planScene);
    const second = initialSceneViewState(planScene);
    first.seriesVisibility[0] = false;
    first.filtersBySeries[0] = [rangeFilter("ML", 0, 1)];
    expect(second.seriesVisibility).toEqual({});
    expect(second.filtersBySeries).toEqual({});
  });
});

describe("sceneViewStateOnEntry", () => {
  it("starts a scene not shown before from its export", () => {
    expect(sceneViewStateOnEntry({}, 1, planScene)).toEqual({ ...STARTING_STATE, projectionMode: "orthographic" });
    expect(sceneViewStateOnEntry(undefined, 0, obliqueScene)).toEqual({ ...STARTING_STATE, projectionMode: "perspective" });
  });

  it("brings back scene 1 as it was left after going to scene 2 and back", () => {
    const scenes = [obliqueScene, planScene];
    const remembered = {};

    // Scene 1: hide a series, filter magnitudes, switch to orthographic.
    const leftScene1 = {
      ...initialSceneViewState(scenes[0]),
      seriesVisibility: { 1: false },
      filtersBySeries: { 0: [rangeFilter("ML", -1, 2)] },
      projectionMode: "orthographic",
    };
    remembered[0] = leftScene1;
    const enteredScene2 = sceneViewStateOnEntry(remembered, 1, scenes[1]);
    expect(enteredScene2).toEqual({ ...STARTING_STATE, projectionMode: "orthographic" });

    // Scene 2: turn its surface off and go back.
    remembered[1] = { ...enteredScene2, surfaceVisibility: { 0: false }, projectionMode: "perspective" };
    expect(sceneViewStateOnEntry(remembered, 0, scenes[0])).toBe(leftScene1);
    expect(sceneViewStateOnEntry(remembered, 1, scenes[1])).toEqual({
      ...STARTING_STATE,
      surfaceVisibility: { 0: false },
      projectionMode: "perspective",
    });
  });
});

describe("serializeSceneViewStates / restoreSceneViewStates", () => {
  it("brings every scene's settings back through JSON", () => {
    const scenes = [obliqueScene, planScene, obliqueScene];
    const states = {
      0: {
        selectedSeries: 1,
        filtersBySeries: {
          1: [
            createCategoryFilter({ input: "Material", allowedValues: ["ore", "fill"] }),
            createRangeFilter({ input: "ML", min: -1, max: 2 }),
          ],
        },
        seriesVisibility: { 0: false },
        lineVisibility: { 0: false },
        surfaceVisibility: { 2: false },
        nullVisibility: { 1: false },
        annotationsVisible: false,
        markerSelections: {
          1: { colourMarker: "Event Date", sizeMarker: null, minSize: 4, maxSize: NaN, invertSize: true },
        },
        markerSeriesIndex: 1,
        projectionMode: "orthographic",
      },
      2: initialSceneViewState(obliqueScene),
    };

    const restored = restoreSceneViewStates(JSON.parse(JSON.stringify(serializeSceneViewStates(states))), scenes);

    expect(Object.keys(restored)).toEqual(["0", "2"]);
    const { filtersBySeries, ...settings } = restored[0];
    expect(settings).toEqual({
      selectedSeries: 1,
      seriesVisibility: { 0: false },
      lineVisibility: { 0: false },
      surfaceVisibility: { 2: false },
      nullVisibility: { 1: false },
      annotationsVisible: false,
      markerSelections: {
        1: { colourMarker: "Event Date", sizeMarker: null, minSize: 4, maxSize: NaN, invertSize: true },
      },
      markerSeriesIndex: 1,
      projectionMode: "orthographic",
    });
    expect(Object.keys(filtersBySeries)).toEqual(["1"]);
    const [category, range] = filtersBySeries[1];
    expect([...category.allowedValues]).toEqual(["ore", "fill"]);
    expect(pointMatchesFilter({ Material: "fill" }, category)).toBe(true);
    expect(pointMatchesFilter({ Material: "waste" }, category)).toBe(false);
    expect(range).toEqual(rangeFilter("ML", -1, 2));
    expect(restored[2]).toEqual({ ...STARTING_STATE, projectionMode: "perspective" });
  });

  it("drops scenes the export does not have, and puts the starting value in place of anything unusable", () => {
    const restored = restoreSceneViewStates(
      {
        0: {
          selectedSeries: -1,
          filtersBySeries: "bad",
          seriesVisibility: { 0: "no", 1: false, x: true, "-1": false, "1.5": true, "01": false },
          lineVisibility: [false],
          annotationsVisible: "yes",
          markerSelections: {
            0: { colourMarker: 5, sizeMarker: "ML", minSize: "big", invertSize: 1, other: "x" },
            1: "bad",
          },
          markerSeriesIndex: 1.5,
          projectionMode: "fisheye",
        },
        1: "not a state",
        2: { projectionMode: "orthographic" },
        x: { projectionMode: "orthographic" },
        "01": { projectionMode: "orthographic" },
      },
      [planScene, obliqueScene]
    );
    expect(restored).toEqual({
      0: {
        ...STARTING_STATE,
        seriesVisibility: { 1: false },
        markerSelections: { 0: { sizeMarker: "ML", minSize: NaN } },
        projectionMode: "orthographic",
      },
    });
  });

  it("reads a session saved before scenes kept their own settings", () => {
    // Only the scene the user was on, at the top level of the session.
    const legacySession = {
      sceneIndex: 1,
      filtersBySeries: { 0: [{ kind: "range", input: "ML", min: 0, max: 3, includeMissing: false }] },
      seriesVisibility: { 0: false },
      surfaceVisibility: { 0: false },
      nullVisibility: { 0: true },
      markerSelections: { 0: { colourMarker: "Mag/Spheres" } },
      markerSeriesIndex: 0,
      markerScale: 0.8,
      annotationsVisible: false,
      projectionMode: "orthographic",
    };
    expect(restoreSceneViewStates(legacySession.sceneStates, [planScene, obliqueScene])).toEqual({});
    expect(restoreSceneViewState(legacySession, obliqueScene)).toEqual({
      ...STARTING_STATE,
      filtersBySeries: { 0: [rangeFilter("ML", 0, 3)] },
      seriesVisibility: { 0: false },
      surfaceVisibility: { 0: false },
      nullVisibility: { 0: true },
      annotationsVisible: false,
      markerSelections: { 0: { colourMarker: "Mag/Spheres" } },
      projectionMode: "orthographic",
    });
  });

  it("gives the starting state, or nothing, for a missing or non-object value", () => {
    expect(restoreSceneViewStates(undefined, [planScene])).toEqual({});
    expect(restoreSceneViewStates([{ projectionMode: "orthographic" }], [obliqueScene])).toEqual({});
    expect(restoreSceneViewStates({ 0: {} }, null)).toEqual({});
    expect(restoreSceneViewState(null, planScene)).toEqual({ ...STARTING_STATE, projectionMode: "orthographic" });
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
