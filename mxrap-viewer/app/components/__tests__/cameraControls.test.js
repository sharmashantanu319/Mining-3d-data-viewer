import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { animateCameraTo, createCamera, updateCameraAspect } from "../cameraControls";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCamera", () => {
  it("builds a perspective camera with near/far scaled to the target distance", () => {
    const camera = createCamera("perspective", 2, 5000);

    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(camera.aspect).toBe(2);
    expect(camera.near).toBe(5);
    expect(camera.far).toBe(500000);
  });

  it("clamps near/far for very small scenes", () => {
    const camera = createCamera("perspective", 1, 1);

    expect(camera.near).toBe(0.01);
    expect(camera.far).toBe(1000);
  });

  it("keeps real mine coordinates (thousands of units away) inside the far plane", () => {
    const distance = 8000;
    const camera = createCamera("perspective", 1, distance);

    expect(camera.far).toBeGreaterThan(distance * 10);
    expect(camera.far / camera.near).toBeLessThan(1e6);
  });

  it("builds an orthographic frustum with the same apparent height as perspective", () => {
    const distance = 100;
    const camera = createCamera("orthographic", 1.5, distance);
    const expectedHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(25));

    expect(camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(camera.top - camera.bottom).toBeCloseTo(expectedHeight);
    expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(1.5);
    expect(camera.left).toBeCloseTo(-camera.right);
  });
});

describe("updateCameraAspect", () => {
  it("updates the aspect of a perspective camera", () => {
    const camera = createCamera("perspective", 1, 100);

    updateCameraAspect(camera, 800, 400);

    expect(camera.aspect).toBe(2);
  });

  it("recomputes the orthographic width while preserving the height (zoom level)", () => {
    const camera = createCamera("orthographic", 1, 100);
    const heightBefore = camera.top - camera.bottom;

    updateCameraAspect(camera, 900, 300);

    expect(camera.top - camera.bottom).toBeCloseTo(heightBefore);
    expect((camera.right - camera.left) / (camera.top - camera.bottom)).toBeCloseTo(3);
    expect(camera.left).toBeCloseTo(-camera.right);
  });
});

describe("animateCameraTo", () => {
  function setup() {
    const frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.spyOn(performance, "now").mockReturnValue(0);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const controls = { target: new THREE.Vector3(0, 0, 0), update: vi.fn() };
    return { frames, cancel, camera, controls };
  }

  it("ends exactly at the requested position and target", () => {
    const { frames, camera, controls } = setup();

    animateCameraTo(camera, controls, { x: 10, y: 20, z: 30 }, { x: 1, y: 2, z: 3 }, 600);
    frames.shift()(600);

    expect(camera.position.toArray()).toEqual([10, 20, 30]);
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
    expect(controls.update).toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it("keeps animating until the duration has elapsed", () => {
    const { frames, camera, controls } = setup();

    animateCameraTo(camera, controls, { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }, 600);
    frames.shift()(300);

    expect(camera.position.x).toBeGreaterThan(0);
    expect(camera.position.x).toBeLessThan(10);
    expect(frames).toHaveLength(1);
  });

  it("returns a function that cancels the pending frame", () => {
    const { cancel, camera, controls } = setup();

    const stop = animateCameraTo(camera, controls, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 });
    stop();

    expect(cancel).toHaveBeenCalledWith(1);
  });
});
