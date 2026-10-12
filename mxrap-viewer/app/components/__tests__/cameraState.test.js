import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  applyCameraState,
  cameraStateForProjection,
  isValidCameraState,
  sanitizeSceneCameras,
  snapshotCameraState,
} from "../cameraState";

function makePerspective() {
  const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(10, 20, 30);
  return camera;
}

function makeOrthographic() {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
  camera.position.set(1, 2, 3);
  camera.zoom = 2.5;
  camera.updateProjectionMatrix();
  return camera;
}

function makeControls(target = { x: 4, y: 5, z: 6 }) {
  return { target: new THREE.Vector3(target.x, target.y, target.z), update: vi.fn() };
}

const validState = {
  projection: "perspective",
  position: { x: 1, y: 2, z: 3 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  zoom: 1,
};

describe("snapshotCameraState", () => {
  it("captures position, target, up, zoom and the projection kind as plain data", () => {
    const state = snapshotCameraState(makePerspective(), { x: 4, y: 5, z: 6 });
    expect(state).toEqual({
      projection: "perspective",
      position: { x: 10, y: 20, z: 30 },
      target: { x: 4, y: 5, z: 6 },
      up: { x: 0, y: 0, z: 1 },
      zoom: 1,
    });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("marks an orthographic camera and keeps its zoom", () => {
    const state = snapshotCameraState(makeOrthographic(), { x: 0, y: 0, z: 0 });
    expect(state.projection).toBe("orthographic");
    expect(state.zoom).toBe(2.5);
  });

  it("does not alias the camera's vectors", () => {
    const camera = makePerspective();
    const state = snapshotCameraState(camera, { x: 0, y: 0, z: 0 });
    camera.position.set(0, 0, 0);
    expect(state.position).toEqual({ x: 10, y: 20, z: 30 });
  });
});

describe("isValidCameraState", () => {
  it("accepts a full state and a legacy position/target-only state", () => {
    expect(isValidCameraState(validState)).toBe(true);
    expect(isValidCameraState({ position: validState.position, target: validState.target })).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "camera"],
    ["missing target", { position: validState.position }],
    ["a non-finite coordinate", { ...validState, position: { x: NaN, y: 0, z: 0 } }],
    ["a string coordinate", { ...validState, target: { x: "0", y: 0, z: 0 } }],
    ["a malformed up vector", { ...validState, up: { x: 0, y: 1 } }],
    ["a zero zoom", { ...validState, zoom: 0 }],
    ["a negative zoom", { ...validState, zoom: -1 }],
    ["an unknown projection", { ...validState, projection: "fisheye" }],
  ])("rejects %s", (_label, state) => {
    expect(isValidCameraState(state)).toBe(false);
  });
});

describe("cameraStateForProjection", () => {
  it("returns the state when its projection matches", () => {
    expect(cameraStateForProjection(validState, "perspective")).toBe(validState);
  });

  it("returns null for a state captured from the other kind of camera", () => {
    expect(cameraStateForProjection(validState, "orthographic")).toBeNull();
  });

  it("accepts a legacy state without a projection for either camera", () => {
    const legacy = { position: validState.position, target: validState.target };
    expect(cameraStateForProjection(legacy, "perspective")).toBe(legacy);
    expect(cameraStateForProjection(legacy, "orthographic")).toBe(legacy);
  });

  it("returns null for an invalid or missing state", () => {
    expect(cameraStateForProjection(null, "perspective")).toBeNull();
    expect(cameraStateForProjection({ position: {} }, "perspective")).toBeNull();
  });
});

describe("applyCameraState", () => {
  it("moves the camera and the orbit target, then updates the controls", () => {
    const camera = makePerspective();
    const controls = makeControls();

    const applied = applyCameraState(camera, controls, {
      ...validState,
      position: { x: 7, y: 8, z: 9 },
      target: { x: 1, y: 1, z: 1 },
    });

    expect(applied).toBe(true);
    expect(camera.position.toArray()).toEqual([7, 8, 9]);
    expect(controls.target.toArray()).toEqual([1, 1, 1]);
    expect(controls.update).toHaveBeenCalledTimes(1);
  });

  it("restores the up vector", () => {
    const camera = makePerspective();
    applyCameraState(camera, makeControls(), { ...validState, up: { x: 0, y: 1, z: 0 } });
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
  });

  it("restores the zoom of an orthographic camera and refreshes its projection", () => {
    const camera = makeOrthographic();
    const before = camera.projectionMatrix.elements[0];

    applyCameraState(camera, makeControls(), { ...validState, projection: "orthographic", zoom: 5 });

    expect(camera.zoom).toBe(5);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(before * 2);
  });

  it("leaves a perspective camera's zoom alone", () => {
    const camera = makePerspective();
    applyCameraState(camera, makeControls(), { ...validState, zoom: 5 });
    expect(camera.zoom).toBe(1);
  });

  it("does nothing for an invalid state or a missing camera/controls", () => {
    const camera = makePerspective();
    const controls = makeControls();

    expect(applyCameraState(camera, controls, { position: {} })).toBe(false);
    expect(applyCameraState(null, controls, validState)).toBe(false);
    expect(applyCameraState(camera, null, validState)).toBe(false);
    expect(camera.position.toArray()).toEqual([10, 20, 30]);
    expect(controls.update).not.toHaveBeenCalled();
  });

  it("round-trips a snapshot", () => {
    const source = makeOrthographic();
    const sourceControls = makeControls({ x: 9, y: 8, z: 7 });
    const state = snapshotCameraState(source, sourceControls.target);

    const target = makeOrthographic();
    target.zoom = 1;
    const targetControls = makeControls();
    applyCameraState(target, targetControls, state);

    expect(snapshotCameraState(target, targetControls.target)).toEqual(state);
  });
});

describe("sanitizeSceneCameras", () => {
  it("keeps valid states for in-range scene indices", () => {
    expect(sanitizeSceneCameras({ 0: validState, 1: validState }, 2)).toEqual({ 0: validState, 1: validState });
  });

  it("drops out-of-range, non-integer and non-numeric keys", () => {
    const result = sanitizeSceneCameras({ 0: validState, 2: validState, "-1": validState, "1.5": validState, a: validState }, 2);
    expect(Object.keys(result)).toEqual(["0"]);
  });

  it("drops malformed states", () => {
    expect(sanitizeSceneCameras({ 0: { position: {} }, 1: validState }, 2)).toEqual({ 1: validState });
  });

  it("returns an empty object for a missing, array or non-object value", () => {
    expect(sanitizeSceneCameras(undefined, 3)).toEqual({});
    expect(sanitizeSceneCameras(null, 3)).toEqual({});
    expect(sanitizeSceneCameras([validState], 3)).toEqual({});
    expect(sanitizeSceneCameras("nope", 3)).toEqual({});
  });
});
