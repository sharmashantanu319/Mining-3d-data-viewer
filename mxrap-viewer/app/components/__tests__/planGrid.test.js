import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  alignedViewAxis,
  clipSegmentToRect,
  computePlanGrid,
  formatGridValue,
  gridValues,
  niceGridStep,
} from "../planGrid";

describe("alignedViewAxis", () => {
  it("names the axis a view looks straight along, in either direction", () => {
    expect(alignedViewAxis({ x: 0, y: 0, z: -1 })).toBe("z");
    expect(alignedViewAxis({ x: 0, y: 3, z: 0 })).toBe("y");
    expect(alignedViewAxis({ x: -2, y: 0, z: 0 })).toBe("x");
  });

  it("accepts the Top preset's 0.1 degree lean but not a 1 degree tilt", () => {
    const lean = THREE.MathUtils.degToRad(0.115);
    expect(alignedViewAxis({ x: 0, y: Math.sin(lean), z: -Math.cos(lean) })).toBe("z");
    const tilt = THREE.MathUtils.degToRad(1);
    expect(alignedViewAxis({ x: 0, y: Math.sin(tilt), z: -Math.cos(tilt) })).toBeNull();
  });

  it("gives null for a zero or unusable direction", () => {
    expect(alignedViewAxis({ x: 0, y: 0, z: 0 })).toBeNull();
    expect(alignedViewAxis({ x: NaN, y: 0, z: 1 })).toBeNull();
    expect(alignedViewAxis(null)).toBeNull();
  });
});

describe("niceGridStep", () => {
  it("picks the 1, 2, 2.5 or 5 step closest to seven lines", () => {
    expect(niceGridStep(700)).toBe(100);
    expect(niceGridStep(1000)).toBe(200); // ideal 142.9: 200 is nearer than 100 on a log scale
    expect(niceGridStep(2000)).toBe(250); // ideal 285.7
    expect(niceGridStep(3000)).toBe(500); // ideal 428.6
    expect(niceGridStep(0.7)).toBe(0.1);
    expect(niceGridStep(0.0175)).toBe(0.0025);
  });

  it("gives null for an empty or unusable extent", () => {
    expect(niceGridStep(0)).toBeNull();
    expect(niceGridStep(-5)).toBeNull();
    expect(niceGridStep(Infinity)).toBeNull();
  });
});

describe("gridValues", () => {
  it("lists the multiples of the step inside the range", () => {
    expect(gridValues(-130, 470, 100)).toEqual([-100, 0, 100, 200, 300, 400]);
    expect(gridValues(9500, 10500, 200)).toEqual([9600, 9800, 10000, 10200, 10400]);
  });

  it("includes the ends and has no floating-point noise", () => {
    expect(gridValues(0.1, 0.3, 0.1)).toEqual([0.1, 0.2, 0.3]);
    expect(gridValues(-0.05, 0.05, 0.05)).toEqual([-0.05, 0, 0.05]);
  });

  it("gives nothing for an empty range, a bad step or too many lines", () => {
    expect(gridValues(5, 1, 1)).toEqual([]);
    expect(gridValues(0, 10, 0)).toEqual([]);
    expect(gridValues(0, 1e6, 1)).toEqual([]);
  });
});

describe("formatGridValue", () => {
  it("uses as many decimals as the step and no thousands separators", () => {
    expect(formatGridValue(10200, 200)).toBe("10200");
    expect(formatGridValue(7.5, 2.5)).toBe("7.5");
    expect(formatGridValue(0.25, 0.25)).toBe("0.25");
    expect(formatGridValue(10, 2.5)).toBe("10.0");
  });

  it("never shows -0", () => {
    expect(formatGridValue(-0, 100)).toBe("0");
    expect(formatGridValue(-1e-12, 0.1)).toBe("0.0");
  });
});

describe("clipSegmentToRect", () => {
  it("cuts a segment to the rectangle", () => {
    expect(clipSegmentToRect([50, -100], [50, 300], 200, 200)).toEqual([[50, 0], [50, 200]]);
    expect(clipSegmentToRect([-100, 50], [100, 50], 200, 200)).toEqual([[0, 50], [100, 50]]);
  });

  it("keeps a segment that is already inside and drops one that misses", () => {
    expect(clipSegmentToRect([10, 10], [20, 30], 200, 200)).toEqual([[10, 10], [20, 30]]);
    expect(clipSegmentToRect([-50, -10], [-10, 300], 200, 200)).toBeNull();
    expect(clipSegmentToRect([250, 50], [300, 60], 200, 200)).toBeNull();
  });
});

describe("computePlanGrid", () => {
  // Looking straight down at (10000, 20000, 1000) with north up: the view is
  // 1000 m wide and 600 m tall on a 1000 x 600 pixel canvas.
  function planCamera({ zoom = 1, tilt = 0 } = {}) {
    const camera = new THREE.OrthographicCamera(-500, 500, 300, -300, 0.1, 100000);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.up.set(0, 0, 1);
    camera.position.set(10000, 20000 - 4000 * Math.tan(tilt) - 4000 * 0.002, 5000);
    camera.lookAt(10000, 20000, 1000);
    return camera;
  }
  const target = new THREE.Vector3(10000, 20000, 1000);

  it("draws lines every 200 m across a 1000 m plan view", () => {
    const grid = computePlanGrid(planCamera(), target, 1000, 600);
    expect(grid.axis).toBe("z");
    expect(grid.step).toBe(200);
    expect(grid.lines.filter((line) => line.axis === "x").map((line) => line.value)).toEqual([9600, 9800, 10000, 10200, 10400]);
    expect(grid.lines.filter((line) => line.axis === "y").map((line) => line.value)).toEqual([19800, 20000, 20200]);
    for (const line of grid.lines) {
      expect(line.from.z).toBe(1000);
      expect(line.to.z).toBe(1000);
    }
  });

  it("labels north-south lines along the bottom and east-west lines on the left", () => {
    const grid = computePlanGrid(planCamera(), target, 1000, 600);
    const x10000 = grid.lines.find((line) => line.axis === "x" && line.value === 10000).label;
    expect(x10000.text).toBe("X 10000");
    expect(x10000.edge).toBe("bottom");
    expect(x10000.x).toBeCloseTo(500, 3);
    expect(x10000.y).toBeCloseTo(600, 3);

    const y20200 = grid.lines.find((line) => line.axis === "y" && line.value === 20200).label;
    expect(y20200.text).toBe("Y 20200");
    expect(y20200.edge).toBe("left");
    expect(y20200.x).toBeCloseTo(0, 3);
    expect(y20200.y).toBeCloseTo(100, 1); // 100 m below the top of a 600 m view
  });

  it("halves the spacing range when zoomed in", () => {
    const grid = computePlanGrid(planCamera({ zoom: 2 }), target, 1000, 600);
    expect(grid.step).toBe(100); // 500 m wide: ideal 71.4, nearest 100
    expect(grid.lines.filter((line) => line.axis === "x").map((line) => line.value)).toEqual([9800, 9900, 10000, 10100, 10200]);
  });

  it("disappears once the view is tilted or the camera is perspective", () => {
    expect(computePlanGrid(planCamera({ tilt: THREE.MathUtils.degToRad(2) }), target, 1000, 600)).toBeNull();
    const perspective = new THREE.PerspectiveCamera(50, 1000 / 600, 0.1, 100000);
    perspective.position.set(10000, 20000, 5000);
    perspective.lookAt(target);
    expect(computePlanGrid(perspective, target, 1000, 600)).toBeNull();
    expect(computePlanGrid(planCamera(), target, 0, 600)).toBeNull();
  });
});
