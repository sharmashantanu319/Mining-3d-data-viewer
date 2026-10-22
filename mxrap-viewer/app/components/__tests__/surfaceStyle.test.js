import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import { resolveSurfaceVertexColours } from "../surfaceMarkerResolver";
import {
  DEFAULT_SURFACE_COLOUR,
  applySurfaceStyle,
  getSurfaceColourChoices,
  restoreSurfaceStyle,
  surfaceColourHex,
} from "../surfaceStyle";

const realExport = readFileSync(
  new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
);

// The sample's "Geometry Model" surface: coloured by "Material", with a
// "Date" marker in the same menu (mgm/markers).
let surface;
beforeAll(async () => {
  const parsed = await parseExportFile(realExport);
  surface = parsed.scenes[0].surfaces[0];
});

describe("getSurfaceColourChoices", () => {
  it("offers the markers of the surface's menu that its vertices fill", () => {
    expect(getSurfaceColourChoices(surface).map((choice) => choice.name)).toEqual(["Material", "Date"]);
  });

  it("leaves out a marker whose column is empty in every vertex", () => {
    const noDates = { ...surface, vertices: surface.vertices.map((vertex) => ({ ...vertex, "Date Marker Value": "" })) };
    expect(getSurfaceColourChoices(noDates).map((choice) => choice.name)).toEqual(["Material"]);
  });

  it("has nothing to offer for a surface with no marker menu", () => {
    expect(getSurfaceColourChoices({ vertices: surface.vertices, markerDefinitions: [] })).toEqual([]);
    expect(getSurfaceColourChoices(undefined)).toEqual([]);
  });
});

describe("applySurfaceStyle", () => {
  it("recolours the surface by the marker chosen", () => {
    const byDate = applySurfaceStyle(surface, { colourMarker: "Date" });
    expect(byDate.colourMarker).toBe("Date");
    const byMaterial = resolveSurfaceVertexColours(surface);
    const dated = resolveSurfaceVertexColours(byDate);
    expect(dated).toHaveLength(surface.vertices.length * 3);
    expect(Array.from(dated)).not.toEqual(Array.from(byMaterial));
  });

  it("draws the surface in one colour when no marker is chosen", () => {
    const flat = applySurfaceStyle(surface, { colourMarker: null, colour: "#ff8800" });
    expect(flat.colourMarker).toBeNull();
    expect(flat.color).toBe(0xff8800);
    expect(resolveSurfaceVertexColours(flat)).toBeNull();
  });

  it("keeps opacity between 0.1 and 1", () => {
    expect(applySurfaceStyle(surface, { opacity: 0.35 }).opacity).toBe(0.35);
    expect(applySurfaceStyle(surface, { opacity: 0 }).opacity).toBe(0.1);
    expect(applySurfaceStyle(surface, { opacity: 3 }).opacity).toBe(1);
  });

  it("ignores settings it cannot use and leaves an unstyled surface alone", () => {
    const styled = applySurfaceStyle(surface, { colour: "orange", opacity: "half", colourMarker: 5 });
    expect(styled.color).toBe(surface.color);
    expect(styled.opacity).toBeUndefined();
    expect(styled.colourMarker).toBe("Material");
    expect(applySurfaceStyle(surface, undefined)).toBe(surface);
  });
});

describe("surfaceColourHex", () => {
  it("reads the surface's single colour as #rrggbb", () => {
    expect(surfaceColourHex({ color: 0x00ff08 })).toBe("#00ff08");
    expect(surfaceColourHex({})).toBe(`#${DEFAULT_SURFACE_COLOUR.toString(16).padStart(6, "0")}`);
  });
});

describe("restoreSurfaceStyle", () => {
  it("keeps only usable settings", () => {
    expect(restoreSurfaceStyle({ colourMarker: "Date", colour: "#112233", opacity: 0.5 })).toEqual({
      colourMarker: "Date", colour: "#112233", opacity: 0.5,
    });
    expect(restoreSurfaceStyle({ colourMarker: null })).toEqual({ colourMarker: null });
    expect(restoreSurfaceStyle({ colour: "blue", opacity: null })).toBeUndefined();
    expect(restoreSurfaceStyle([1, 2])).toBeUndefined();
    expect(restoreSurfaceStyle("Date")).toBeUndefined();
  });
});
