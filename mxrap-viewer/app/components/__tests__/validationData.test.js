import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { validateExportFile } from "../validateExportFile";
import { parseExportFile } from "../parseExportFile";
import { rampCsv, rampRow } from "./fixtures/ramps";

const points = { type: "points", name: "Events", data: "p" };
const lines = { type: "lines", name: "RMQ", "data-vertices": "v", "data-lines": "l", colourMarker: "RQD" };
const vertexCsv = "ID,X,Y,Z,RQD\n1,1,2,3,95\n2,4,5,6,\n3,7,8,9,100";
const validLines = "LineID,VertexID\n10,1\n10,2";

async function archive(config, files, root = "") {
  const zip = new JSZip();
  zip.file(`${root}info.json`, JSON.stringify({ slides: [{ displays: [{ folder: "view" }] }] }));
  zip.file(`${root}view/config.json`, JSON.stringify(config));
  for (const [path, data] of Object.entries(files)) zip.file(`${root}${path}`, data);
  return zip.generateAsync({ type: "uint8array" });
}

describe("point and RMQ import diagnostics", () => {
  it("accepts valid points, reports bad coordinates and counts exactly what the parser renders", async () => {
    const file = await archive({ type: "3dview", series: [points] }, {
      "data/p.csv": "ID,X,Y,Z\n1,1,2,3\n2,abc,2,3\n3,1e100,2,3",
    }, "export/");
    const report = await validateExportFile(file);
    expect(report.valid).toBe(true);
    expect(report.warnings).toEqual([expect.stringContaining("2 point(s) skipped")]);
    expect(report.summaries[0]).toMatchObject({ total: 3, loaded: 1, skipped: 2 });
    expect((await parseExportFile(file)).scenes[0].pointClouds[0].points).toHaveLength(1);
  });

  it("rejects missing point/line tables and missing coordinate/membership columns", async () => {
    const missing = await validateExportFile(await archive({ type: "3dview", series: [points, lines] }, {}));
    expect(missing.valid).toBe(false);
    expect(missing.errors).toHaveLength(3);
    const columns = await validateExportFile(await archive({ type: "3dview", series: [points, lines] }, {
      "data/p.csv": "ID,X,Y\n1,1,2", "data/v.csv": vertexCsv, "data/l.csv": "LineID\n10",
    }));
    expect(columns.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("missing required column Z"), expect.stringContaining("missing required column VertexID"),
    ]));
  });

  it("rejects ambiguous or missing IDs while allowing point datasets without an ID column", async () => {
    const duplicate = await validateExportFile(await archive({ type: "3dview", series: [points, lines] }, {
      "data/p.csv": "ID,X,Y,Z\n1,1,2,3\n1,4,5,6", "data/v.csv": "ID,X,Y,Z\n1,1,2,3\n1,4,5,6", "data/l.csv": validLines,
    }));
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors.filter((error) => error.includes("duplicate ID"))).toHaveLength(2);
    const noId = await validateExportFile(await archive({ type: "3dview", series: [points] }, { "data/p.csv": "X,Y,Z\n1,2,3" }));
    expect(noId.valid).toBe(true);
    const blankId = await validateExportFile(await archive({ type: "3dview", series: [points] }, { "data/p.csv": "ID,X,Y,Z\n,1,2,3" }));
    expect(blankId.errors).toContainEqual(expect.stringContaining("missing or invalid ID"));
  });

  it("skips unknown, short and missing-endpoint lines without bridging them", async () => {
    const file = await archive({ type: "3dview", series: [lines] }, {
      "data/v.csv": vertexCsv,
      "data/l.csv": `${validLines}\n20,99\n20,2\n30,3\n40,1\n40,\n40,2`,
    });
    const report = await validateExportFile(file);
    expect(report.valid).toBe(true);
    expect(report.summaries[0]).toMatchObject({ total: 4, loaded: 1, skipped: 3 });
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("unknown vertex"), expect.stringContaining("fewer than two"),
      expect.stringContaining("default 0–100 palette"), expect.stringContaining("invalid RQD"),
    ]));
    expect((await parseExportFile(file)).scenes[0].lineSeries[0].lines.map((line) => line.id)).toEqual([10]);
  });

  it("blocks a dataset with no usable geometry", async () => {
    const report = await validateExportFile(await archive({ type: "3dview", series: [points] }, { "data/p.csv": "X,Y,Z\nabc,2,3" }));
    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(expect.stringContaining("no points have valid coordinates"));
  });

  it("checks marker definitions, input columns and colour ramps without rejecting valid positions", async () => {
    const series = { ...points, markerMenu: "events/markers", colourMarker: "ML", sizeMarker: "Size", sizeMinimum: 1, sizeMaximum: 10 };
    const definitions = [
      { name: "ML", type: "colour", input: "Missing", minimum: 0, maximum: 100, ramp: "bad.csv" },
      { name: "Size", type: "size", input: "ML", minimum: 10, maximum: 0 },
    ];
    const report = await validateExportFile(await archive({ type: "3dview", series: [series] }, {
      "data/p.csv": "X,Y,Z,ML\n1,2,3,5", "marker-defs/events/markers.json": JSON.stringify(definitions),
      "marker-defs/events/bad.csv": "broken,csv\n1,2",
    }));
    expect(report.valid).toBe(true);
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("input column"), expect.stringContaining("colour ramp"), expect.stringContaining("size marker"),
    ]));
    const good = await validateExportFile(await archive({ type: "3dview", series: [{ ...series, sizeMarker: null }] }, {
      "data/p.csv": "X,Y,Z,ML\n1,2,3,5",
      "marker-defs/events/markers.json": JSON.stringify([{ ...definitions[0], input: "ML", ramp: "good.csv" }]),
      "marker-defs/events/good.csv": rampCsv([rampRow()]),
    }));
    expect(good.warnings).toEqual([]);
    const missing = await validateExportFile(await archive({ type: "3dview", series: [series] }, { "data/p.csv": "X,Y,Z,ML\n1,2,3,5" }));
    expect(missing.warnings).toContainEqual(expect.stringContaining("marker definitions"));
    const malformed = await validateExportFile(await archive({ type: "3dview", series: [series] }, {
      "data/p.csv": "X,Y,Z,ML\n1,2,3,5", "marker-defs/events/markers.json": "{}",
    }));
    expect(malformed.warnings).toContainEqual(expect.stringContaining("definitions are invalid"));
  });

  it("accepts the real client export and reports counts matching the actual RMQ parser", async () => {
    const file = readFileSync(new URL("../../../test-data/visualiser-export-2.zip", import.meta.url));
    const report = await validateExportFile(file);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.summaries.find((summary) => summary.kind === "lines")).toMatchObject({ loaded: 8877, skipped: 0 });
    expect(report.summaries.filter((summary) => summary.kind === "chart rows").map((summary) => summary.loaded)).toEqual([665, 5238, 665]);
    expect(report.warnings).toContainEqual(expect.stringContaining("default 0–100 palette"));
  });
});

describe("chart join validation", () => {
  const chart = {
    type: "chart", axes: { bottom: { enabled: true, scale: "datetime" }, left: { enabled: true, scale: "linear" } },
    series: [{ name: "Events", data: "p", "data-additional": ["extra"], axisX: { side: "bottom", column: "Date" }, axisY: { side: "left", column: "ML" } }],
  };
  it("reports unmatched IDs and dropped axis values using the parser's join rules", async () => {
    const report = await validateExportFile(await archive(chart, {
      "data/p.csv": "ID,Date\n1,2023-05-01 00:00:00\n2,2023-05-01 00:01:00",
      "data/extra.csv": "ID,ML\n1,5\n99,4",
    }));
    expect(report.valid).toBe(true);
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("unknown event ID"), expect.stringContaining("no matching row"), expect.stringContaining("chart row(s) skipped"),
    ]));
    expect(report.summaries[0]).toMatchObject({ total: 2, loaded: 1, skipped: 1 });
  });
  it("rejects duplicate join keys and missing ID columns", async () => {
    const duplicate = await validateExportFile(await archive(chart, {
      "data/p.csv": "ID,Date\n1,2023-05-01 00:00:00", "data/extra.csv": "ID,ML\n1,5\n1,6",
    }));
    expect(duplicate.errors).toContainEqual(expect.stringContaining("duplicate ID"));
    const missing = await validateExportFile(await archive(chart, {
      "data/p.csv": "ID,Date\n1,2023-05-01 00:00:00", "data/extra.csv": "ML\n5",
    }));
    expect(missing.errors).toContainEqual(expect.stringContaining("missing required column ID"));
  });
});
