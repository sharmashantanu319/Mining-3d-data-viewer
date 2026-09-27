import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildSurfaceGeometry, buildSurfaceMesh } from "../geometryBuilder";
import { rampCsv, rampRow } from "./fixtures/ramps";

afterEach(() => {
  vi.restoreAllMocks();
});

const vertices = [
  { id: 5, x: 0, y: 0, z: 0 },
  { id: 10, x: 1, y: 0, z: 0 },
  { id: 23, x: 0, y: 1, z: 0 },
  { id: 40, x: 1, y: 1, z: 0 },
];

describe("buildSurfaceGeometry", () => {
  it("maps non-contiguous vertex IDs onto zero-based array indices", () => {
    const geometry = buildSurfaceGeometry(vertices, [
      { v1: 5, v2: 10, v3: 23 },
      { v1: 10, v2: 40, v3: 23 },
    ]);

    expect(Array.from(geometry.index.array)).toEqual([0, 1, 2, 1, 3, 2]);
    expect(Array.from(geometry.getAttribute("position").array.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
    geometry.dispose();
  });

  it("skips faces that reference an unknown vertex ID and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const geometry = buildSurfaceGeometry(vertices, [
      { v1: 5, v2: 10, v3: 23 },
      { v1: 5, v2: 10, v3: 999 },
    ]);

    expect(Array.from(geometry.index.array)).toEqual([0, 1, 2]);
    expect(warn).toHaveBeenCalledTimes(1);
    geometry.dispose();
  });

  it("computes vertex normals so lighting is not flat", () => {
    const geometry = buildSurfaceGeometry(vertices, [{ v1: 5, v2: 10, v3: 23 }]);

    expect(geometry.getAttribute("normal")).toBeDefined();
    expect(geometry.getAttribute("normal").getZ(0)).toBeCloseTo(1);
    geometry.dispose();
  });

  it("throws a descriptive error for duplicate vertex IDs", () => {
    expect(() =>
      buildSurfaceGeometry([vertices[0], { ...vertices[1], id: 5 }], [])
    ).toThrow(/Invalid surface: .*duplicate ID "5"/);
  });

  it("throws for non-finite vertex coordinates", () => {
    expect(() =>
      buildSurfaceGeometry([{ id: 1, x: Number.NaN, y: 0, z: 0 }], [])
    ).toThrow(/invalid coordinates/);
  });

  it("attaches per-vertex colours only when the array length matches", () => {
    const matching = new Float32Array(vertices.length * 3).fill(0.5);
    const mismatched = new Float32Array(3);

    const withColours = buildSurfaceGeometry(vertices, [], matching);
    const withoutColours = buildSurfaceGeometry(vertices, [], mismatched);

    expect(withColours.getAttribute("color").itemSize).toBe(3);
    expect(withoutColours.getAttribute("color")).toBeUndefined();
    withColours.dispose();
    withoutColours.dispose();
  });
});

describe("buildSurfaceMesh", () => {
  const faces = [{ v1: 5, v2: 10, v3: 23 }];

  function dispose(mesh) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  it("uses the flat surface colour when there is no colour data", () => {
    const mesh = buildSurfaceMesh({ vertices, faces, color: 0x123456 });

    expect(mesh.material.vertexColors).toBe(false);
    expect(mesh.material.color.getHex()).toBe(0x123456);
    expect(mesh.material.side).toBe(THREE.DoubleSide);
    expect(mesh.material.transparent).toBe(false);
    dispose(mesh);
  });

  it("falls back to the default colour when the surface has no colour", () => {
    const mesh = buildSurfaceMesh({ vertices, faces });

    expect(mesh.material.color.getHex()).toBe(0x4f8ef7);
    dispose(mesh);
  });

  it("switches to white vertex colours when per-vertex colours are supplied", () => {
    const colours = new Float32Array(vertices.length * 3).fill(0.25);
    const mesh = buildSurfaceMesh({ vertices, faces, color: 0x123456 }, colours);

    expect(mesh.material.vertexColors).toBe(true);
    expect(mesh.material.color.getHex()).toBe(0xffffff);
    dispose(mesh);
  });

  describe("colour marker fallback from raw vertex attributes", () => {
    const markerSurface = (transparency) => ({
      vertices,
      faces,
      colourMarker: "Grade",
      markerDefinitions: [{
        name: "Grade",
        type: "colour",
        input: "Grade",
        inputType: "number",
        scale: "linear",
        minimum: 0,
        maximum: 3,
        nullColour: [0, 0, 0],
        rampCsv: rampCsv([rampRow({ upTo: "", transparency })]),
      }],
      vertexAttributes: vertices.map((_, index) => ({ Grade: index })),
    });

    it("builds RGBA vertex colours from the marker and keeps an opaque ramp opaque", () => {
      const mesh = buildSurfaceMesh(markerSurface(""));
      const colours = mesh.geometry.getAttribute("color");

      expect(colours.itemSize).toBe(4);
      expect(colours.count).toBe(vertices.length);
      expect(mesh.material.vertexColors).toBe(true);
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.depthWrite).toBe(true);
      dispose(mesh);
    });

    it("marks the material transparent and stops writing depth when the ramp is translucent", () => {
      const mesh = buildSurfaceMesh(markerSurface(50));

      expect(mesh.material.transparent).toBe(true);
      expect(mesh.material.depthWrite).toBe(false);
      dispose(mesh);
    });
  });

  it("respects the visible flag", () => {
    const hidden = buildSurfaceMesh({ vertices, faces, visible: false });
    const shown = buildSurfaceMesh({ vertices, faces });

    expect(hidden.visible).toBe(false);
    expect(shown.visible).toBe(true);
    dispose(hidden);
    dispose(shown);
  });
});
