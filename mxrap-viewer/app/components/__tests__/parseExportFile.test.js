import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { parseExportFile } from "../parseExportFile";

// The primary coverage here runs against the real demo export provided for
// this task (test-data/test-export-big.zip) rather than a hand-built fixture,
// so the parser is checked against the actual on-disk structure it targets.
// A handful of synthetic zips (built with JSZip) cover the skip/error
// branches that the demo file doesn't exercise on its own.

const demoZipPath = fileURLToPath(
  new URL("../../../test-data/test-export-big.zip", import.meta.url)
);
const demoZipBuffer = readFileSync(demoZipPath);

// The full-scale real course sample (2 slides, 3 displays, mixed series
// types, a 158k-vertex/231k-face geometry model). This is the file the
// module header comment above already refers to as "visualiser-export-2.zip".
const realExportZipPath = fileURLToPath(
  new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
);
const realExportZipBuffer = readFileSync(realExportZipPath);

async function makeZip(entries) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("parseExportFile (real demo data)", () => {
  it("parses the demo export's title and scene list", async () => {
    const result = await parseExportFile(demoZipBuffer);
    expect(result.title).toBe("Example export (visible test)");
    expect(result.scenes).toHaveLength(1);
  });

  it("parses the 3dview's id, title, and camera vectors", async () => {
    const [scene] = (await parseExportFile(demoZipBuffer)).scenes;
    expect(scene.id).toBe("s1-3dview");
    expect(scene.title).toBe("General 3D View");
    expect(scene.camera).toEqual({
      position: { x: 8640, y: 11080, z: 2840 },
      focal: { x: 8040, y: 10480, z: 2420 },
      up: { x: 0, y: 0, z: 1 },
    });
  });

  it("parses the surface's vertices and faces from the CSV data", async () => {
    const [scene] = (await parseExportFile(demoZipBuffer)).scenes;
    expect(scene.surfaces).toHaveLength(1);

    const [surface] = scene.surfaces;
    expect(surface.color).toBe(0x4f8ef7);
    expect(surface.vertices).toEqual([
      { id: 1, x: 7790, y: 10230, z: 2380 },
      { id: 2, x: 8290, y: 10230, z: 2380 },
      { id: 3, x: 8290, y: 10730, z: 2460 },
      { id: 4, x: 7790, y: 10730, z: 2460 },
    ]);
    expect(surface.faces).toEqual([
      { v1: 1, v2: 2, v3: 3 },
      { v1: 1, v2: 3, v3: 4 },
    ]);
  });

  it("keeps vertex/face fields numeric via CSV dynamicTyping", async () => {
    const [scene] = (await parseExportFile(demoZipBuffer)).scenes;
    const [surface] = scene.surfaces;
    for (const v of surface.vertices) {
      expect(typeof v.id).toBe("number");
      expect(typeof v.x).toBe("number");
      expect(typeof v.y).toBe("number");
      expect(typeof v.z).toBe("number");
    }
    for (const f of surface.faces) {
      expect(typeof f.v1).toBe("number");
      expect(typeof f.v2).toBe("number");
      expect(typeof f.v3).toBe("number");
    }
  });
});

describe("parseExportFile (full-scale real export: visualiser-export-2)", () => {
  // Parsed once and shared: this fixture's geometry model is 158k vertices /
  // 231k faces, so re-parsing it per `it` would needlessly repeat a
  // multi-hundred-millisecond CSV parse six times over.
  let result;

  beforeAll(async () => {
    result = await parseExportFile(realExportZipBuffer);
  });

  it("parses both 3dview displays across two slides, skipping the chart display", () => {
    expect(result.title).toBe("Example export");
    expect(result.scenes.map((s) => s.id)).toEqual(["s1-3dview", "s2-3dview"]);
    expect(result.scenes.map((s) => s.title)).toEqual(["General 3D View", "RMQ 3D View"]);
  });

  it("keeps only the surface series out of a display mixing points/surface/text", () => {
    const s1 = result.scenes.find((s) => s.id === "s1-3dview");
    // s1-3dview's config declares 4 series: Events (points), Sensors (points),
    // Geometry Model (surface), Event ML Texts (text). Only the surface is
    // in scope for this parser version.
    expect(s1.surfaces).toHaveLength(1);
  });

  it("skips the lines series in the second display, keeping its surface", () => {
    const s2 = result.scenes.find((s) => s.id === "s2-3dview");
    // s2-3dview declares RMQ Intervals (lines) and Geometry Model (surface).
    expect(s2.surfaces).toHaveLength(1);
  });

  it("parses the full-size geometry model (158,168 vertices / 231,024 faces)", () => {
    const [surface] = result.scenes[0].surfaces;
    expect(surface.vertices).toHaveLength(158168);
    expect(surface.faces).toHaveLength(231024);
    expect(surface.vertices[0]).toEqual({ id: 1, x: 7790.72, y: 10232.6, z: 2381.51 });
    expect(surface.vertices.at(-1)).toEqual({ id: 821798, x: 9679.8, y: 10365.82, z: 3248.12 });
    expect(surface.faces[0]).toEqual({ v1: 1, v2: 10, v3: 6 });
    expect(surface.faces.at(-1)).toEqual({ v1: 821792, v2: 821797, v3: 821791 });
  });

  it("reuses the identical geometry model data across both displays", () => {
    const [s1Surface] = result.scenes[0].surfaces;
    const [s2Surface] = result.scenes[1].surfaces;
    expect(s2Surface.vertices).toEqual(s1Surface.vertices);
    expect(s2Surface.faces).toEqual(s1Surface.faces);
  });

  it("parses real (non-integer, non-axis-aligned) camera vectors", () => {
    const s1 = result.scenes.find((s) => s.id === "s1-3dview");
    expect(s1.camera).toEqual({
      position: { x: 9095.7, y: 8504.98, z: 3046.16 },
      focal: { x: 10184.1, y: 10143.1, z: 2856.6 },
      up: { x: 0.0530927, y: 0.0799084, z: 0.995387 },
    });
  });
});

describe("parseExportFile (error and skip branches)", () => {
  it("throws when info.json is missing", async () => {
    const zip = await makeZip({ "s1-3dview/config.json": "{}" });
    await expect(parseExportFile(zip)).rejects.toThrow("Could not find top-level info.json");
  });

  it("skips a slide display whose config.json folder is missing", async () => {
    const info = {
      title: "Missing display",
      slides: [{ displays: [{ folder: "s1-3dview", title: "Missing" }] }],
    };
    const zip = await makeZip({ "info.json": JSON.stringify(info) });
    const result = await parseExportFile(zip);
    expect(result.scenes).toEqual([]);
  });

  it("skips a display whose type is not 3dview", async () => {
    const info = {
      title: "Chart export",
      slides: [{ displays: [{ folder: "s1-chart", title: "Chart" }] }],
    };
    const config = { type: "chart", series: [] };
    const zip = await makeZip({
      "info.json": JSON.stringify(info),
      "s1-chart/config.json": JSON.stringify(config),
    });
    const result = await parseExportFile(zip);
    expect(result.scenes).toEqual([]);
  });

  it("skips series types other than surface, leaving an empty surfaces list", async () => {
    const info = {
      title: "Points export",
      slides: [{ displays: [{ folder: "s1-3dview", title: "Points view" }] }],
    };
    const config = { type: "3dview", camera: {}, series: [{ type: "points" }] };
    const zip = await makeZip({
      "info.json": JSON.stringify(info),
      "s1-3dview/config.json": JSON.stringify(config),
    });
    const result = await parseExportFile(zip);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0].surfaces).toEqual([]);
  });

  it("skips a surface series whose vertices or faces CSV is missing", async () => {
    const info = {
      title: "Broken surface export",
      slides: [{ displays: [{ folder: "s1-3dview", title: "Broken" }] }],
    };
    const config = {
      type: "3dview",
      camera: {},
      series: [{ name: "Geometry Model", type: "surface", "data-vertices": "missing" }],
    };
    const zip = await makeZip({
      "info.json": JSON.stringify(info),
      "s1-3dview/config.json": JSON.stringify(config),
    });
    const result = await parseExportFile(zip);
    expect(result.scenes[0].surfaces).toEqual([]);
  });

  it("falls back to default title and camera vectors when they are absent", async () => {
    const info = {
      slides: [{ displays: [{ folder: "s1-3dview" }] }],
    };
    const config = { type: "3dview", series: [] };
    const zip = await makeZip({
      "info.json": JSON.stringify(info),
      "s1-3dview/config.json": JSON.stringify(config),
    });
    const result = await parseExportFile(zip);
    expect(result.title).toBe("Untitled");
    expect(result.scenes[0].title).toBe("s1-3dview");
    expect(result.scenes[0].camera).toEqual({
      position: { x: 3, y: 3, z: 5 },
      focal: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    });
  });
});
