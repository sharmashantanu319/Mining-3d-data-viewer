import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { animateCameraTo, createCamera, fitBoxToView, levelCameraUp, presetCameraOffset, setPlanNavigation, stopCameraGlide, updateCameraAspect } from "../cameraControls";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

describe("levelCameraUp", () => {
  // Camera block from the customer's TestResponseViewer config.json.
  const position = { x: 9095.7, y: 8504.98, z: 3046.16 };
  const target = { x: 10184.1, y: 10143.1, z: 2856.6 };

  it("turns mXrap's view-perpendicular up back into world Z", () => {
    expect(levelCameraUp({ x: 0.0530927, y: 0.0799084, z: 0.995387 }, position, target)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("keeps an up that is already a world axis", () => {
    expect(levelCameraUp({ x: 0, y: 1, z: 0 }, { x: 3, y: 3, z: 5 }, { x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("keeps a camera that is genuinely rolled", () => {
    const rolled = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 };
    expect(levelCameraUp(rolled, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 })).toBe(rolled);
  });

  it("returns the input when the view direction is undefined", () => {
    const up = { x: 0, y: 0, z: 1 };
    expect(levelCameraUp(up, target, target)).toBe(up);
  });
});

describe("presetCameraOffset", () => {
  const zUp = { x: 0, y: 0, z: 1 };

  it("places the camera for plan and section views of a Z-up mine grid", () => {
    expect(presetCameraOffset("top", zUp, 1000)).toEqual({ x: 0, y: -2, z: 1000 });
    expect(presetCameraOffset("front", zUp, 1000)).toEqual({ x: 0, y: -1000, z: 0 });
    expect(presetCameraOffset("side", zUp, 1000)).toEqual({ x: 1000, y: 0, z: 0 });
  });

  it("uses Y as vertical and -Z as north for the Y-up demo scenes", () => {
    expect(presetCameraOffset("top", { x: 0, y: 1, z: 0 }, 10)).toEqual({ x: 0, y: 10, z: 0.02 });
    expect(presetCameraOffset("front", { x: 0, y: 1, z: 0 }, 10)).toEqual({ x: 0, y: 0, z: 10 });
  });

  it("puts east to the right in front view and north to the right in side view", () => {
    // Screen right = forward x up for a camera looking at the target.
    const right = (offset) => {
      const f = { x: -offset.x, y: -offset.y, z: -offset.z };
      return { x: f.y * zUp.z - f.z * zUp.y + 0, y: f.z * zUp.x - f.x * zUp.z + 0, z: f.x * zUp.y - f.y * zUp.x + 0 };
    };
    expect(right(presetCameraOffset("front", zUp, 1))).toEqual({ x: 1, y: 0, z: 0 });
    expect(right(presetCameraOffset("side", zUp, 1))).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("returns null for an unknown view", () => {
    expect(presetCameraOffset("diagonal", zUp, 1)).toBeNull();
  });
});

describe("fitBoxToView", () => {
  const margin = 1.15;
  const tan25 = Math.tan(THREE.MathUtils.degToRad(25));
  const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

  // Puts the camera where the framing says and returns how far out the box's
  // corners land on screen (1 = the edge of the view).
  function screenExtent(camera, bounds, direction, up, framing) {
    const center = bounds.getCenter(new THREE.Vector3());
    camera.up.set(up.x, up.y, up.z);
    camera.position.copy(center).add(new THREE.Vector3(direction.x, direction.y, direction.z).normalize().multiplyScalar(framing.distance));
    if (framing.zoom !== null) camera.zoom = framing.zoom;
    camera.lookAt(center);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let x = 0;
    let y = 0;
    for (const cx of [bounds.min.x, bounds.max.x]) {
      for (const cy of [bounds.min.y, bounds.max.y]) {
        for (const cz of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(cx, cy, cz).project(camera);
          x = Math.max(x, Math.abs(p.x));
          y = Math.max(y, Math.abs(p.y));
        }
      }
    }
    return { x, y };
  }

  it("zooms an orthographic camera until the box's width fills the view", () => {
    const camera = new THREE.OrthographicCamera(-200, 200, 100, -100, 0.1, 10000);
    const bounds = box([-30, -10, -5], [30, 10, 5]);
    const direction = { x: 0, y: 0, z: 1 };
    const up = { x: 0, y: 1, z: 0 };
    const framing = fitBoxToView(camera, bounds, direction, up);
    expect(framing.zoom).toBeCloseTo(200 / (30 * margin), 12);
    expect(framing.distance).toBeCloseTo((Math.sqrt(1025) / Math.sin(THREE.MathUtils.degToRad(25))) * 1.2, 9);
    const extent = screenExtent(camera, bounds, direction, up, framing);
    expect(extent.x).toBeCloseTo(1 / margin, 9);
    expect(extent.y).toBeCloseTo(10 / 30 * 200 / 100 / margin, 9);
  });

  it("uses the height when that is the tighter fit, seen from the side", () => {
    const camera = new THREE.OrthographicCamera(-200, 200, 100, -100, 0.1, 10000);
    const bounds = box([-30, -10, -8], [30, 10, 8]);
    const direction = { x: 1, y: 0, z: 0 };
    const up = { x: 0, y: 0, z: 1 };
    const framing = fitBoxToView(camera, bounds, direction, up);
    expect(framing.zoom).toBeCloseTo(100 / (8 * margin), 12);
    const extent = screenExtent(camera, bounds, direction, up, framing);
    expect(extent.y).toBeCloseTo(1 / margin, 9);
    expect(extent.x).toBeCloseTo(10 / 8 * 100 / 200 / margin, 9);
  });

  it("moves a perspective camera in until the nearest wide corner reaches the margin", () => {
    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 10000);
    const bounds = box([-30, -10, -5], [30, 10, 5]);
    const direction = { x: 0, y: 0, z: 1 };
    const up = { x: 0, y: 1, z: 0 };
    const framing = fitBoxToView(camera, bounds, direction, up);
    expect(framing.zoom).toBeNull();
    expect(framing.distance).toBeCloseTo(5 + (30 * margin) / (2 * tan25), 9);
    const extent = screenExtent(camera, bounds, direction, up, framing);
    expect(extent.x).toBeCloseTo(1 / margin, 9);
    expect(extent.y).toBeCloseTo((10 * 2) / (30 * margin), 9);
  });

  it("frames the Top view of a Z-up mine that runs north-south, off the origin", () => {
    const camera = new THREE.OrthographicCamera(-200, 200, 100, -100, 0.1, 10000);
    const bounds = box([1000, 2000, 300], [1020, 2080, 310]);
    const up = { x: 0, y: 0, z: 1 };
    const direction = presetCameraOffset("top", up, 1);
    const framing = fitBoxToView(camera, bounds, direction, up);
    const extent = screenExtent(camera, bounds, direction, up, framing);
    expect(extent.y).toBeCloseTo(1 / margin, 9);
    expect(extent.x).toBeLessThan(0.3);
  });

  it("sizes for any roll when looking straight along the up vector", () => {
    const camera = new THREE.OrthographicCamera(-200, 200, 100, -100, 0.1, 10000);
    const framing = fitBoxToView(camera, box([-30, -10, -5], [30, 10, 5]), { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 });
    expect(framing.zoom).toBeCloseTo(100 / (Math.hypot(30, 10) * margin), 12);
  });

  it("returns null for an empty box or a zero direction", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const up = { x: 0, y: 1, z: 0 };
    expect(fitBoxToView(camera, box([1, 2, 3], [1, 2, 3]), { x: 0, y: 0, z: 1 }, up)).toBeNull();
    expect(fitBoxToView(camera, box([0, 0, 0], [1, 1, 1]), { x: 0, y: 0, z: 0 }, up)).toBeNull();
  });
});

describe("animateCameraTo zoom", () => {
  function startFrames() {
    const frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
    return frames;
  }

  it("animates an orthographic camera's zoom along with the move", () => {
    const frames = startFrames();
    const camera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const controls = { target: new THREE.Vector3(), update: vi.fn() };

    animateCameraTo(camera, controls, { x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: 0 }, 600, 4);
    frames.shift()(300);
    // Half-way in time is 1 - 0.5^3 = 0.875 of the way with ease-out.
    expect(camera.zoom).toBeCloseTo(1 + 3 * 0.875, 12);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo((2 * (1 + 3 * 0.875)) / 4, 12);
    frames.shift()(600);
    expect(camera.zoom).toBe(4);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(2, 12);
  });

  it("leaves a perspective camera's zoom alone", () => {
    const frames = startFrames();
    const camera = new THREE.PerspectiveCamera();
    const controls = { target: new THREE.Vector3(), update: vi.fn() };
    animateCameraTo(camera, controls, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, 600, 4);
    frames.shift()(600);
    expect(camera.zoom).toBe(1);
  });
});

describe("setPlanNavigation", () => {
  it("makes a drag pan and the right button rotate in a plan view", () => {
    const controls = {};
    setPlanNavigation(controls, true);
    expect(controls.mouseButtons).toEqual({ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE });
    expect(controls.touches).toEqual({ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE });
  });

  it("restores OrbitControls' own mapping everywhere else", () => {
    const controls = {};
    setPlanNavigation(controls, true);
    setPlanNavigation(controls, false);
    expect(controls.mouseButtons).toEqual({ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN });
    expect(controls.touches).toEqual({ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN });
  });
});

describe("stopCameraGlide", () => {
  it("applies what is left of a drag in one update with damping off, then turns damping back on", () => {
    const dampingDuringUpdate = [];
    const controls = { enableDamping: true, update: vi.fn(() => dampingDuringUpdate.push(controls.enableDamping)) };
    stopCameraGlide(controls);
    expect(dampingDuringUpdate).toEqual([false]);
    expect(controls.enableDamping).toBe(true);
  });

  it("does nothing when damping is off", () => {
    const controls = { enableDamping: false, update: vi.fn() };
    stopCameraGlide(controls);
    expect(controls.update).not.toHaveBeenCalled();
  });
});
