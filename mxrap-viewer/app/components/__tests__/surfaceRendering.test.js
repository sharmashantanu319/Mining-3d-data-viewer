import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import * as THREE from "three";
import { parseExportFile } from "../parseExportFile";
import { validateExportFile } from "../validateExportFile";
import { buildSurfaceGeometry, buildSurfaceMesh } from "../geometryBuilder";
import { rampCsv, rampRow } from "./fixtures/ramps";

async function surfaceExport({ root = "", visible, vertices, faces, marker = true } = {}) {
  const zip = new JSZip();
  zip.file(`${root}info.json`, JSON.stringify({ slides: [{ displays: [{ folder: "view" }] }] }));
  zip.file(`${root}view/config.json`, JSON.stringify({ type: "3dview", series: [{
    type: "surface", name: "Rock", "data-vertices": "vertices", "data-faces": "faces",
    visible, ...(marker ? { markerMenu: "rock/markers", colourMarker: "Material" } : {}),
  }] }));
  zip.file(`${root}data/vertices.csv`, vertices ??
    "ID,Location X,Location Y,Location Z,Material\n5,0,0,0,0\n10,1,0,0,10\n23,0,1,0,");
  zip.file(`${root}data/faces.csv`, faces ?? "V1,V2,V3\n5,10,23");
  zip.file(`${root}marker-defs/rock/markers.json`, JSON.stringify([{
    name: "Material", input: "Material", inputType: "number", minimum: 0, maximum: 10,
    ramp: "material.csv", nullColour: [0, 1, 0],
  }]));
  zip.file(`${root}marker-defs/rock/material.csv`, rampCsv([rampRow({
    start: [0.5, 0, 0], end: [0, 0, 1], space: "RGB", startSpace: "RGB", endSpace: "RGB",
    transparency: 0, endTransparency: 50,
  })]));
  return zip.generateAsync({ type: "uint8array" });
}

function dispose(mesh) {
  mesh.geometry.dispose();
  mesh.material.dispose();
}

describe("surface import and rendering", () => {
  it.each(["", "export/"])("maps exported colours, nulls and alpha under root '%s'", async (root) => {
    const file = await surfaceExport({ root });
    expect((await validateExportFile(file)).valid).toBe(true);
    const surface = (await parseExportFile(file)).scenes[0].surfaces[0];
    const mesh = buildSurfaceMesh(surface);
    const colours = mesh.geometry.getAttribute("color");
    expect(colours.itemSize).toBe(4);
    expect(colours.getX(0)).toBeCloseTo(new THREE.Color().setRGB(0.5, 0, 0, THREE.SRGBColorSpace).r);
    expect([colours.getX(1), colours.getY(1), colours.getZ(1), colours.getW(1)]).toEqual([0, 0, 1, 0.5]);
    expect([colours.getX(2), colours.getY(2), colours.getZ(2), colours.getW(2)]).toEqual([0, 1, 0, 1]);
    expect(mesh.material.color.getHex()).toBe(0xffffff);
    expect(mesh.material.vertexColors).toBe(true);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.side).toBe(THREE.DoubleSide);
    expect(Array.from(mesh.geometry.index.array)).toEqual([0, 1, 2]);
    expect(Array.from(mesh.geometry.attributes.normal.array)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    dispose(mesh);
  });

  it.each([false, true, undefined])("respects visibility %s and retains the unmarked fallback", async (visible) => {
    const surface = (await parseExportFile(await surfaceExport({ visible, marker: false }))).scenes[0].surfaces[0];
    const mesh = buildSurfaceMesh(surface);
    expect(mesh.visible).toBe(visible !== false);
    expect(mesh.material.color.getHex()).toBe(0x4f8ef7);
    expect(mesh.material.vertexColors).toBe(false);
    expect(mesh.material.transparent).toBe(false);
    dispose(mesh);
  });

  it.each([
    ["5,0,0,0\n5,1,0,0\n23,0,1,0", "duplicate ID"],
    ["5,,0,0\n10,1,0,0\n23,0,1,0", "invalid coordinates"],
    ["5,no,0,0\n10,1,0,0\n23,0,1,0", "invalid coordinates"],
    [",0,0,0\n10,1,0,0\n23,0,1,0", "invalid ID"],
  ])("rejects malformed vertices: %s", async (rows, message) => {
    const file = await surfaceExport({ vertices: `ID,Location X,Location Y,Location Z\n${rows}` });
    const result = await validateExportFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(message);
    const surface = (await parseExportFile(file)).scenes[0].surfaces[0];
    expect(() => buildSurfaceMesh(surface)).toThrow(message);
  });

  it.each([NaN, Infinity, 1e40])("rejects coordinates that cannot be stored on the GPU: %s", (x) => {
    expect(() => buildSurfaceGeometry([{ id: 1, x, y: 0, z: 0 }], [])).toThrow("invalid coordinates");
  });

  it("rejects missing coordinate columns and unknown face references", async () => {
    const result = await validateExportFile(await surfaceExport({
      vertices: "ID,Location X,Location Y\n5,0,0\n10,1,0\n23,0,1",
      faces: "V1,V2,V3\n5,10,99",
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("invalid coordinates");
    expect(result.errors.join(" ")).toContain("unknown vertex ID");
  });

  it("renders the large real surface with material colours in both displays", async () => {
    const file = readFileSync(new URL("../../../test-data/visualiser-export-2.zip", import.meta.url));
    const { scenes } = await parseExportFile(file);
    for (const scene of scenes) {
      for (const surface of scene.surfaces) {
        const mesh = buildSurfaceMesh(surface);
        expect(mesh.geometry.index.array).toBeInstanceOf(Uint32Array);
        expect(mesh.geometry.index.count / 3).toBe(231024);
        expect(mesh.geometry.attributes.color.count).toBe(158168);
        expect(mesh.material.transparent).toBe(false);
        const colour = mesh.geometry.attributes.color;
        const distinct = new Set();
        for (let i = 0; i < colour.count; i++) distinct.add(`${colour.getX(i)},${colour.getY(i)},${colour.getZ(i)}`);
        expect(distinct.size).toBeGreaterThan(1);
        dispose(mesh);
      }
    }
  });
});
