import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  AXIS_COLOURS,
  AXIS_INDICATOR_LENGTH,
  AXIS_LABEL_GAP,
  axisIndicatorLayout,
  axisIndicatorTitle,
  updateAxisIndicator,
} from "../orientationGizmo";

const L = AXIS_INDICATOR_LENGTH;
const G = AXIS_LABEL_GAP;

function cameraLookingAtOrigin(position, up) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...position);
  camera.up.set(...up);
  camera.lookAt(0, 0, 0);
  return camera.quaternion;
}

const byAxis = (layout) => Object.fromEntries(layout.map((item) => [item.axis, item]));

describe("axisIndicatorLayout", () => {
  it("points X right and Y up for a camera looking down -Z with Y up", () => {
    const { X, Y, Z } = byAxis(axisIndicatorLayout({ x: 0, y: 0, z: 0, w: 1 }));
    expect([X.x, X.y, X.labelX, X.labelY, X.depth, X.opacity]).toEqual([L, -0, L + G, -0, 0, 1]);
    expect([Y.x, Y.y, Y.labelX, Y.labelY]).toEqual([0, -L, 0, -L - G]);
    // Z points at the viewer: no length on screen, letter up and to the right.
    expect(Z.depth).toBe(1);
    expect(Math.hypot(Z.x, Z.y)).toBe(0);
    expect(Z.labelX).toBeCloseTo(G * Math.SQRT1_2, 12);
    expect(Z.labelY).toBeCloseTo(-G * Math.SQRT1_2, 12);
    expect(X.colour).toBe(AXIS_COLOURS.X);
  });

  it("shows north to the right and up as up in the Side view of a Z-up mine", () => {
    // Side view: camera east of the target looking west, Z up.
    const { X, Y, Z } = byAxis(axisIndicatorLayout(cameraLookingAtOrigin([10, 0, 0], [0, 0, 1])));
    expect(X.depth).toBeCloseTo(1, 12);
    expect(Y.x).toBeCloseTo(L, 12);
    expect(Y.y).toBeCloseTo(0, 12);
    expect(Z.x).toBeCloseTo(0, 12);
    expect(Z.y).toBeCloseTo(-L, 12);
  });

  it("fades an axis that points away and draws it first", () => {
    // Looking east from the west: X points away from the viewer, Y to the left.
    const layout = axisIndicatorLayout(cameraLookingAtOrigin([-10, 0, 0], [0, 0, 1]));
    expect(layout[0].axis).toBe("X");
    expect(layout[0].depth).toBeCloseTo(-1, 12);
    expect(layout[0].opacity).toBeCloseTo(0.45, 12);
    expect(byAxis(layout).Y.x).toBeCloseTo(-L, 12);
  });

  it("keeps every axis at most one axis length from the centre", () => {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -1.1, 0.4));
    for (const item of axisIndicatorLayout(quaternion)) {
      expect(Math.hypot(item.x, item.y)).toBeLessThanOrEqual(L + 1e-9);
      expect(Math.hypot(item.labelX - item.x, item.labelY - item.y)).toBeCloseTo(G, 9);
    }
  });
});

describe("updateAxisIndicator", () => {
  // Just enough of an <svg> for the update: attribute setters, querySelector
  // by data-axis, and insertBefore to record the drawing order.
  function fakeSvg() {
    const element = () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
    const groups = Object.fromEntries(["X", "Y", "Z"].map((axis) => {
      const group = element();
      group.line = element();
      group.text = element();
      group.querySelector = (selector) => (selector === "line" ? group.line : group.text);
      return [axis, group];
    }));
    const origin = element();
    const order = [];
    return {
      groups,
      order,
      querySelector(selector) {
        if (selector === "[data-axis-origin]") return origin;
        return groups[/data-axis="(\w)"/.exec(selector)?.[1]] ?? null;
      },
      insertBefore(node, before) {
        if (before === origin) order.push(Object.keys(groups).find((axis) => groups[axis] === node));
      },
    };
  }

  it("moves the lines and letters, and skips the work when the camera has not turned", () => {
    const svg = fakeSvg();
    const memo = {};
    const quaternion = { x: 0, y: 0, z: 0, w: 1 };
    updateAxisIndicator(svg, quaternion, memo);
    expect(svg.groups.X.line.attributes).toEqual({ x2: String(L), y2: "0" });
    expect(svg.groups.X.text.attributes).toEqual({ x: String(L + G), y: "0" });
    expect(svg.groups.Y.line.attributes).toEqual({ x2: "0", y2: String(-L) });
    expect(svg.order).toEqual(["X", "Y", "Z"]);

    updateAxisIndicator(svg, { ...quaternion }, memo);
    expect(svg.order).toHaveLength(3);
  });

  it("does nothing without an svg", () => {
    expect(() => updateAxisIndicator(null, { x: 0, y: 0, z: 0, w: 1 }, {})).not.toThrow();
  });
});

describe("axisIndicatorTitle", () => {
  it("names the mine-grid directions for a Z-up camera", () => {
    expect(axisIndicatorTitle({ x: 0.0530927, y: 0.0799084, z: 0.995387 })).toBe("Axes: X points east, Y north, Z up");
    expect(axisIndicatorTitle({ x: 0, y: 1, z: 0 })).toBe("Axes: X, Y and Z directions");
  });
});
