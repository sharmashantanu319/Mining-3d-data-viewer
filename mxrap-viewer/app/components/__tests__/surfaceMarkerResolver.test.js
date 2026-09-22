import { describe, it, expect } from "vitest";
import { resolveSurfaceVertexColours } from "../surfaceMarkerResolver";
import { rampCsv, rampRow } from "./fixtures/ramps";

// A markers.json `type: "colour"` entry (see marker-defs/mgm/markers.json),
// with its ramp CSV text already attached as `rampCsv` by
// parseExportFile.js's loadMarkerDefinitions.
const MATERIAL_COLOUR_DEF = {
  name: "Material",
  type: "colour",
  input: "Material Marker Value",
  inputType: "number",
  scale: "linear",
  minimum: 1,
  maximum: 6,
  nullColour: [0, 0, 0],
  // A single row with a blank "Up to" spans the whole domain: a plain
  // start-to-end gradient across [1, 6].
  rampCsv: rampCsv([rampRow({ upTo: "", start: [0, 1, 1], end: [0.667, 1, 1] })]),
};

const SURFACE = {
  colourMarker: "Material",
  markerDefinitions: [MATERIAL_COLOUR_DEF],
  vertices: [
    { id: 1, x: 0, y: 0, z: 0, "Material Marker Value": 1 },
    { id: 2, x: 1, y: 1, z: 1, "Material Marker Value": 3.5 },
    { id: 3, x: 2, y: 2, z: 2, "Material Marker Value": 6 },
  ],
  faces: [{ v1: 1, v2: 2, v3: 3 }],
};

describe("resolveSurfaceVertexColours", () => {
  it("returns null when the surface has no marker definitions (mock data / no markerMenu)", () => {
    expect(resolveSurfaceVertexColours({ ...SURFACE, markerDefinitions: [] })).toBeNull();
    expect(resolveSurfaceVertexColours({ ...SURFACE, markerDefinitions: undefined })).toBeNull();
    expect(resolveSurfaceVertexColours(null)).toBeNull();
  });

  it("returns null when colourMarker names a definition that isn't there", () => {
    expect(resolveSurfaceVertexColours({ ...SURFACE, colourMarker: "Nonexistent" })).toBeNull();
  });

  it("returns null when colourMarker is null (no colour marker selected)", () => {
    expect(resolveSurfaceVertexColours({ ...SURFACE, colourMarker: null })).toBeNull();
  });

  it("resolves one RGB triple per vertex, in vertex order", () => {
    const colours = resolveSurfaceVertexColours(SURFACE);
    expect(colours).toBeInstanceOf(Float32Array);
    expect(colours).toHaveLength(SURFACE.vertices.length * 3);
    for (const c of colours) {
      expect(Number.isFinite(c)).toBe(true);
    }

    // Endpoints of the domain (1 and 6) must differ: start colour (H=0) vs
    // end colour (H=0.667).
    const first = [colours[0], colours[1], colours[2]];
    const last = [colours[6], colours[7], colours[8]];
    expect(first).not.toEqual(last);
  });

  it("derives the colour domain from the data when the definition has no minimum/maximum", () => {
    const surface = {
      ...SURFACE,
      markerDefinitions: [{ ...MATERIAL_COLOUR_DEF, minimum: undefined, maximum: undefined }],
    };
    const colours = resolveSurfaceVertexColours(surface);
    expect(colours).toBeInstanceOf(Float32Array);
    // Domain falls back to the data's own range (1..6), same as the
    // explicit-minimum/maximum case, so the endpoints still differ.
    const first = [colours[0], colours[1], colours[2]];
    const last = [colours[6], colours[7], colours[8]];
    expect(first).not.toEqual(last);
  });

  it("degrades safely to null when the ramp CSV is malformed", () => {
    const surface = {
      ...SURFACE,
      markerDefinitions: [{ ...MATERIAL_COLOUR_DEF, rampCsv: "not,a,valid,ramp\n1,2,3,4" }],
    };
    expect(resolveSurfaceVertexColours(surface)).toBeNull();
  });

  it("a vertex with a missing/unparseable marker value gets the marker's null colour, not a crash", () => {
    const surface = {
      ...SURFACE,
      vertices: [
        ...SURFACE.vertices,
        { id: 4, x: 3, y: 3, z: 3, "Material Marker Value": null },
      ],
    };
    const colours = resolveSurfaceVertexColours(surface);
    expect(colours).toHaveLength(4 * 3);
    // nullColour is [0, 0, 0] on MATERIAL_COLOUR_DEF.
    expect([colours[9], colours[10], colours[11]]).toEqual([0, 0, 0]);
  });
});
