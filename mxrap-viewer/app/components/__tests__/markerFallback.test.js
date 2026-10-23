import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { findBorrowedMarkerMenu } from "../markerFallback";
import { validateExportFile } from "../validateExportFile";
import { parseExportFile } from "../parseExportFile";
import { resolveMarkerRenderOptions } from "../pointMarkerResolver";

const HEADER = "Up to,Symbol,Start Colour (H),Start Colour (S),Start Colour (V),End Colour (H),End Colour (S),End Colour (V),Colour Ramp,Number of Colours,Transparency [0..100],Colour Space,Start Colour Colour Space,End Colour Colour Space,End Transparency [0..100]";
const RAMP = `${HEADER}\n,,0,1,1,0.5,1,1,linear,,0,HSV,HSV,HSV,0`;
const PML = { name: "P[ML within R]", type: "colour", input: "P[ML within R]", inputType: "number", minimum: 0, maximum: 1, ramp: "pml-ramp.csv", nullColour: [1, 0.941, 1] };
const EVENTS = { name: "Mag/Spheres", type: "colour", input: "ML", inputType: "number", ramp: "magnitude.csv", nullColour: [0, 0, 0] };

function hazardsZip({ paintedDefs = [PML], extraMenus = {} } = {}) {
  const zip = new JSZip();
  zip.file("info.json", JSON.stringify({ slides: [{ displays: [{ folder: "view" }] }] }));
  zip.file("view/config.json", JSON.stringify({ type: "3dview", series: [
    { type: "points", name: "Minodes", data: "m", markerMenu: "hazard-minodes/markers", colourMarker: "P[ML within R]" },
  ] }));
  zip.file("data/m.csv", "ID,X,Y,Z,P[ML within R]\n1,0,0,0,0\n2,1,1,1,1");
  zip.file("marker-defs/hazard-minodes/markers.json", JSON.stringify([EVENTS]));
  zip.file("marker-defs/hazard-minodes/pml-ramp.csv", RAMP);
  zip.file("marker-defs/hazard-painted/markers.json", JSON.stringify(paintedDefs));
  zip.file("marker-defs/hazard-painted/pml-ramp.csv", RAMP);
  for (const [path, defs] of Object.entries(extraMenus)) zip.file(`marker-defs/${path}.json`, JSON.stringify(defs));
  return zip;
}

describe("findBorrowedMarkerMenu", () => {
  it("finds the one other menu that defines the missing colour marker", async () => {
    expect(await findBorrowedMarkerMenu(hazardsZip(), "", "P[ML within R]", ["ID", "P[ML within R]"], "hazard-minodes/markers"))
      .toBe("hazard-painted/markers");
  });

  it("refuses when the data lacks the marker's input column", async () => {
    expect(await findBorrowedMarkerMenu(hazardsZip(), "", "P[ML within R]", ["ID", "X"], "hazard-minodes/markers")).toBeNull();
  });

  it("refuses when two other menus define the same name", async () => {
    const zip = hazardsZip({ extraMenus: { "other/markers": [PML] } });
    expect(await findBorrowedMarkerMenu(zip, "", "P[ML within R]", ["P[ML within R]"], "hazard-minodes/markers")).toBeNull();
  });
});

describe("export with a misplaced marker menu", () => {
  it("validates with a borrow warning and colours points from the borrowed ramp", async () => {
    const file = await hazardsZip().generateAsync({ type: "uint8array" });
    const report = await validateExportFile(file);
    expect(report.valid).toBe(true);
    expect(report.warnings).toContain(
      'view > Minodes: the colours for "P[ML within R]" are missing from this series\' own marker file, so the same-named colours from another series are used (marker-defs/hazard-painted/markers.json instead of marker-defs/hazard-minodes/markers.json).');
    expect(report.warnings.filter((w) => w.includes("is unavailable"))).toEqual([]);

    const cloud = (await parseExportFile(file)).scenes[0].pointClouds[0];
    expect(cloud.markerDefinitions.map((def) => def.name)).toEqual(["Mag/Spheres", "P[ML within R]"]);
    expect(cloud.markerDefinitions[1].rampCsv).toBe(RAMP);
    const options = resolveMarkerRenderOptions(cloud);
    const low = options.colorFn(cloud.points[0]);
    const high = options.colorFn(cloud.points[1]);
    expect([low.r, low.g, low.b]).toEqual([1, 0, 0]);
    expect([high.r, high.g, high.b]).toEqual([0, 1, 1]);
  });

  it("still falls back when no other menu defines the marker", async () => {
    const file = await hazardsZip({ paintedDefs: [] }).generateAsync({ type: "uint8array" });
    const report = await validateExportFile(file);
    expect(report.warnings).toContain('view > Minodes: marker "P[ML within R]" is unavailable; fallback styling will be used.');
    const cloud = (await parseExportFile(file)).scenes[0].pointClouds[0];
    expect(cloud.markerDefinitions.map((def) => def.name)).toEqual(["Mag/Spheres"]);
  });
});
