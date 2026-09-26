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

const VERTICES_CSV = "ID,Location X,Location Y,Location Z\n1,0,0,0\n2,1,0,0\n3,0,1,0";
const FACES_CSV = "V1,V2,V3\n1,2,3";

async function buildSurfaceExport({ vertices = VERTICES_CSV, faces = FACES_CSV, seriesOverrides = {} } = {}) {
  const zip = new JSZip();
  zip.file("info.json", JSON.stringify({ slides: [{ displays: [{ folder: "s1-3dview" }] }] }));
  zip.file("s1-3dview/config.json", JSON.stringify({
    type: "3dview",
    series: [{ name: "Pit", type: "surface", "data-vertices": "verts", "data-faces": "faces", ...seriesOverrides }],
  }));
  if (vertices !== null) zip.file("data/verts.csv", vertices);
  if (faces !== null) zip.file("data/faces.csv", faces);
  return zip.generateAsync({ type: "uint8array" });
}

async function validateZip(build) {
  const zip = new JSZip();
  build(zip);
  return validateExportFile(await zip.generateAsync({ type: "uint8array" }));
}

describe("validateExportFile - structure", () => {
  it("rejects a file that is not a zip archive", async () => {
    const result = await validateExportFile(new TextEncoder().encode("this is not a zip"));

    expect(result).toEqual({ valid: false, errors: ["File is not a valid zip archive."] });
  });

  it("rejects an archive with no info.json", async () => {
    const result = await validateZip((zip) => zip.file("readme.txt", "hello"));

    expect(result).toEqual({ valid: false, errors: ["Missing top-level info.json."] });
  });

  it("rejects an info.json that is not valid JSON", async () => {
    const result = await validateZip((zip) => zip.file("info.json", "{ not json"));

    expect(result).toEqual({ valid: false, errors: ["info.json is not valid JSON."] });
  });

  it("rejects an info.json with no slides", async () => {
    const empty = await validateZip((zip) => zip.file("info.json", JSON.stringify({ slides: [] })));
    const missing = await validateZip((zip) => zip.file("info.json", JSON.stringify({})));

    expect(empty).toEqual({ valid: false, errors: ["info.json has no slides defined."] });
    expect(missing).toEqual({ valid: false, errors: ["info.json has no slides defined."] });
  });

  it("reports slides without displays and displays without a folder", async () => {
    const result = await validateZip((zip) => zip.file("info.json", JSON.stringify({
      slides: [{ title: "Empty" }, { displays: [{}] }],
    })));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Slide 1 ("Empty") has no displays.',
      'Slide 2 has a display with no "folder" specified.',
    ]);
  });

  it("reports a display whose config.json is missing or not valid JSON", async () => {
    const result = await validateZip((zip) => {
      zip.file("info.json", JSON.stringify({
        slides: [{ displays: [{ folder: "missing" }, { folder: "broken" }] }],
      }));
      zip.file("broken/config.json", "{ nope");
    });

    expect(result.errors).toEqual([
      'Display "missing" is missing its config.json.',
      '"broken/config.json" is not valid JSON.',
    ]);
  });

  it("collects problems from every slide in one pass instead of stopping at the first", async () => {
    const result = await validateZip((zip) => zip.file("info.json", JSON.stringify({
      slides: [{ displays: [{ folder: "a" }] }, { displays: [{ folder: "b" }] }],
    })));

    expect(result.errors).toHaveLength(2);
  });

  it("does not validate non-3dview displays such as charts", async () => {
    const result = await validateZip((zip) => {
      zip.file("info.json", JSON.stringify({ slides: [{ displays: [{ folder: "chart" }] }] }));
      zip.file("chart/config.json", JSON.stringify({ type: "chart", series: [{ type: "surface" }] }));
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("accepts an export nested under an export/ root folder", async () => {
    const file = await buildTextExport({
      root: "export",
      series: { name: "Labels", type: "text", data: "labels", faceCamera: true },
      csv: "X,Y,Z,Text\n1,2,3,A",
    });

    await expect(validateExportFile(file)).resolves.toEqual({ valid: true, errors: [] });
  });
});

describe("validateExportFile - surfaces", () => {
  it("accepts a well-formed surface", async () => {
    await expect(validateExportFile(await buildSurfaceExport())).resolves.toEqual({ valid: true, errors: [] });
  });

  it("reports missing vertices and faces CSV files", async () => {
    const result = await validateExportFile(await buildSurfaceExport({ vertices: null, faces: null }));

    expect(result.errors).toEqual([
      's1-3dview > Pit vertices: file "data/verts.csv" not found.',
      's1-3dview > Pit faces: file "data/faces.csv" not found.',
    ]);
  });

  it("reports a surface that does not reference its data files", async () => {
    const result = await validateExportFile(await buildSurfaceExport({
      seriesOverrides: { "data-vertices": undefined, "data-faces": undefined },
    }));

    expect(result.errors).toEqual([
      "s1-3dview > Pit vertices: no data file referenced.",
      "s1-3dview > Pit faces: no data file referenced.",
    ]);
  });

  it("reports CSV files that have a header but no data rows", async () => {
    const result = await validateExportFile(await buildSurfaceExport({
      vertices: "ID,Location X,Location Y,Location Z",
    }));

    expect(result.errors).toContain('s1-3dview > Pit vertices: "data/verts.csv" has no data rows.');
  });

  it("reports CSV files that cannot be parsed", async () => {
    const result = await validateExportFile(await buildSurfaceExport({
      faces: 'V1,V2,V3\n"1,2,3',
    }));

    expect(result.errors).toContain('s1-3dview > Pit faces: CSV parse error in "data/faces.csv".');
  });

  it("reports faces that reference vertex IDs missing from the vertices table", async () => {
    const result = await validateExportFile(await buildSurfaceExport({ faces: "V1,V2,V3\n1,2,99" }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      's1-3dview > Pit: face row 1 references unknown vertex ID "99" (column V3).',
    ]);
  });

  it("caps the number of reported bad vertex references at five plus a summary", async () => {
    const faces = ["V1,V2,V3", ...Array.from({ length: 4 }, () => "1,98,99")].join("\n");

    const result = await validateExportFile(await buildSurfaceExport({ faces }));

    expect(result.errors).toHaveLength(6);
    expect(result.errors[5]).toBe("s1-3dview > Pit: ...and 3 more invalid vertex references.");
  });

  it("reports duplicate vertex IDs and invalid coordinates", async () => {
    const result = await validateExportFile(await buildSurfaceExport({
      vertices: "ID,Location X,Location Y,Location Z\n1,0,0,0\n1,1,0,0\n3,abc,0,0",
    }));

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('vertex row 2 has duplicate ID "1"'),
      expect.stringContaining("vertex row 3 has invalid coordinates"),
    ]));
  });
});

describe("validateExportFile - annotation CSV rows", () => {
  it("reports annotation CSVs that are missing required columns", async () => {
    const file = await buildTextExport({
      series: { name: "Labels", type: "text", data: "labels", faceCamera: true },
      csv: "X,Y\n1,2",
    });

    const result = await validateExportFile(file);

    expect(result.errors).toEqual(expect.arrayContaining([
      "s1-3dview > Labels: annotation CSV is missing one of: Z, Location Z, z.",
      "s1-3dview > Labels: annotation CSV is missing one of: Text, Label, Annotation, Name, Value.",
    ]));
  });

  it("reports rows with non-numeric coordinates or blank text", async () => {
    const file = await buildTextExport({
      series: { name: "Labels", type: "text", data: "labels", faceCamera: true },
      csv: "X,Y,Z,Text\n1,2,3,ok\nabc,2,3,bad coords\n1,2,3, ",
    });

    const result = await validateExportFile(file);

    expect(result.errors).toEqual([
      "s1-3dview > Labels: row 2 has invalid annotation coordinates.",
      "s1-3dview > Labels: row 3 has no annotation text.",
    ]);
  });

  it("rejects display annotations that are not an array", async () => {
    const result = await validateZip((zip) => {
      zip.file("info.json", JSON.stringify({ slides: [{ displays: [{ folder: "s1-3dview" }] }] }));
      zip.file("s1-3dview/config.json", JSON.stringify({ type: "3dview", annotations: {} }));
    });

    expect(result.errors).toEqual(["s1-3dview > annotations: annotations must be an array."]);
  });
});
