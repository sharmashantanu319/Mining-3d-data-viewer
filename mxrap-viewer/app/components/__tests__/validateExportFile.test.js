import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { validateExportFile } from "../validateExportFile";

async function buildTextExport({ root = "", series, csv }) {
  const zip = new JSZip();
  const prefix = root ? `${root}/` : "";
  zip.file(`${prefix}info.json`, JSON.stringify({
    slides: [{ displays: [{ folder: "s1-3dview" }] }],
  }));
  zip.file(`${prefix}s1-3dview/config.json`, JSON.stringify({
    type: "3dview",
    series: [series],
  }));
  zip.file(`${prefix}data/${series.data}.csv`, csv);
  return zip.generateAsync({ type: "uint8array" });
}

describe("validateExportFile - annotations", () => {
  it("accepts valid top-level display annotations", async () => {
    const zip = new JSZip();
    zip.file("info.json", JSON.stringify({
      slides: [{ displays: [{ folder: "s1-3dview" }] }],
    }));
    zip.file("s1-3dview/config.json", JSON.stringify({
      type: "3dview",
      annotations: [{
        location: [1, 2, 3],
        colour: "rgb(255,0,0)",
        text: "Area of interest",
      }],
    }));

    await expect(validateExportFile(await zip.generateAsync({ type: "uint8array" })))
      .resolves.toEqual({ valid: true, errors: [] });
  });

  it("rejects top-level annotations with invalid location or missing text", async () => {
    const zip = new JSZip();
    zip.file("info.json", JSON.stringify({
      slides: [{ displays: [{ folder: "s1-3dview" }] }],
    }));
    zip.file("s1-3dview/config.json", JSON.stringify({
      type: "3dview",
      annotations: [{ location: [1, 2], text: "" }],
    }));

    const result = await validateExportFile(await zip.generateAsync({ type: "uint8array" }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "s1-3dview > annotations: annotation 1 has invalid location.",
      "s1-3dview > annotations: annotation 1 has no text.",
    ]));
  });

  it("accepts face-camera annotations without orientation columns", async () => {
    const file = await buildTextExport({
      root: "export",
      series: { name: "Labels", type: "text", data: "labels", faceCamera: true },
      csv: "X,Y,Z,Text\n10,20,30,Portal A",
    });

    await expect(validateExportFile(file)).resolves.toEqual({ valid: true, errors: [] });
  });

  it("requires orientation columns for fixed 3D annotations", async () => {
    const file = await buildTextExport({
      series: { name: "Labels", type: "text", data: "labels" },
      csv: "X,Y,Z,Text\n10,20,30,Portal A",
    });

    const result = await validateExportFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      's1-3dview > Labels: fixed 3D annotations require a "Dip" column.',
      's1-3dview > Labels: fixed 3D annotations require a "Dip Direction" column.',
      's1-3dview > Labels: fixed 3D annotations require a "Rake" column.',
    ]));
  });
});