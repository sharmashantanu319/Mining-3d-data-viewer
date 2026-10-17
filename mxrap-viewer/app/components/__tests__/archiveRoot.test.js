import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { findArchiveRoot } from "../archiveRoot";
import { validateExportFile } from "../validateExportFile";
import { parseExportFile } from "../parseExportFile";

const info = JSON.stringify({ title: "Wrapped", slides: [{ displays: [{ folder: "view" }] }] });
const config = JSON.stringify({ type: "3dview", series: [{ type: "points", name: "Events", data: "p" }] });

function zipWith(files) {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(files)) zip.file(path, data);
  return zip;
}

describe("findArchiveRoot", () => {
  it("returns the exact prefix for each supported layout", () => {
    expect(findArchiveRoot(zipWith({ "info.json": info }))).toBe("");
    expect(findArchiveRoot(zipWith({ "export/info.json": info }))).toBe("export/");
    expect(findArchiveRoot(zipWith({ "TestResponseViewer/info.json": info, "__MACOSX/TestResponseViewer/._info.json": "x" })))
      .toBe("TestResponseViewer/");
  });

  it("does not guess when two folders both contain info.json", () => {
    expect(findArchiveRoot(zipWith({ "a/info.json": info, "b/info.json": info }))).toBe("");
  });
});

describe("macOS-compressed export folder", () => {
  it("validates and parses an export wrapped in one folder with __MACOSX entries", async () => {
    const zip = zipWith({
      "TestResponseViewer/info.json": info,
      "TestResponseViewer/view/config.json": config,
      "TestResponseViewer/data/p.csv": "ID,X,Y,Z\n1,10.5,20.25,-3\n2,4,5,6",
      "__MACOSX/TestResponseViewer/._info.json": "resource fork",
    });
    const file = await zip.generateAsync({ type: "uint8array" });
    const report = await validateExportFile(file);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    const parsed = await parseExportFile(file);
    expect(parsed.title).toBe("Wrapped");
    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.scenes[0].pointClouds[0].points.map((p) => [p.x, p.y, p.z])).toEqual([[10.5, 20.25, -3], [4, 5, 6]]);
  });
});
