import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildLineSeries, lineColourSeries } from "../lineSeriesData";
import { buildLineSegments } from "../linesBuilder";
import { buildColourLegend } from "../colourLegend";
import { parseExportFile } from "../parseExportFile";

const vertices = [
  { ID: 50, X: 1, Y: 2, Z: 3, RQD: 0 },
  { ID: 90, X: 4, Y: 5, Z: 6, RQD: 100 },
  { ID: 20, X: 7, Y: 8, Z: 9, RQD: null },
];
const config = { name: "RMQ Intervals", colourMarker: "RQD", lineWidth: 5, legend: true };

describe("RMQ line pipeline", () => {
  it("joins sparse IDs and interleaved lines in membership order without cross-line connections", () => {
    const series = buildLineSeries(vertices, [
      { LineID: 4, VertexID: 90 }, { LineID: 8, VertexID: 20 },
      { LineID: 4, VertexID: 50 }, { LineID: 8, VertexID: 90 },
      { LineID: 4, VertexID: 20 },
    ], config);
    expect(series.lines.map((line) => line.points.map((p) => p.id))).toEqual([[90, 50, 20], [20, 90]]);
    const object = buildLineSegments(series);
    expect(object.geometry.instanceCount).toBe(3);
    expect(object.material.linewidth).toBe(5);
    expect(object.material.worldUnits).toBe(false);
    const starts = object.geometry.getAttribute("instanceStart");
    const ends = object.geometry.getAttribute("instanceEnd");
    expect([starts.getX(0), ends.getX(0), starts.getX(1), ends.getX(1), starts.getX(2), ends.getX(2)])
      .toEqual([4, 1, 1, 7, 7, 4]);
    object.geometry.dispose(); object.material.dispose();
  });

  it("uses the same RQD palette for legend and rendering and marks missing values grey", () => {
    const series = buildLineSeries(vertices, vertices.map((v) => ({ LineID: 1, VertexID: v.ID })), config);
    const legend = buildColourLegend(lineColourSeries(series), 3);
    expect(legend.valid).toBe(true);
    expect(legend.title).toContain("default palette");
    expect(legend.ticks.map((t) => t.value)).toEqual([0, 50, 100]);
    const object = buildLineSegments(series);
    const start = object.geometry.getAttribute("instanceColorStart");
    const end = object.geometry.getAttribute("instanceColorEnd");
    expect(start.getX(0)).toBeCloseTo(1); expect(start.getY(0)).toBeCloseTo(0);
    expect(end.getY(0)).toBeCloseTo(1); expect(end.getX(0)).toBeCloseTo(0);
    expect(end.getX(1)).toBeCloseTo(end.getY(1));
    expect(end.getY(1)).toBeCloseTo(end.getZ(1));
    object.geometry.dispose(); object.material.dispose();
  });

  it("preserves supplied RQD definitions and visibility", () => {
    const definitions = [{ name: "RQD", input: "RQD" }];
    const series = buildLineSeries(vertices, [{ LineID: 1, VertexID: 50 }, { LineID: 1, VertexID: 90 }], { ...config, visible: false }, definitions);
    expect(series.markerDefinitions).toBe(definitions);
    expect(series.usesDefaultRqdPalette).toBe(false);
    expect(series.visible).toBe(false);
  });

  it("rejects malformed lines rather than bridging missing vertices and handles an empty series", () => {
    const series = buildLineSeries([...vertices, { ID: 5, X: NaN, Y: 0, Z: 0 }], [
      { LineID: 1, VertexID: 50 }, { LineID: 1, VertexID: 999 }, { LineID: 1, VertexID: 90 },
      { LineID: 2, VertexID: 5 }, { LineID: 2, VertexID: 90 }, { LineID: 3, VertexID: 20 },
    ], config);
    expect(series.lines).toEqual([]);
    const object = buildLineSegments(series);
    expect(object.geometry.instanceCount).toBe(0);
    expect(object.visible).toBe(false);
    object.geometry.dispose(); object.material.dispose();
  });

  it("supports rooted exports and skips missing line tables while retaining the scene", async () => {
    const zip = new JSZip();
    zip.file("export/info.json", JSON.stringify({ slides: [{ displays: [{ folder: "view" }] }] }));
    zip.file("export/view/config.json", JSON.stringify({ type: "3dview", series: [
      { ...config, type: "lines", "data-vertices": "v", "data-lines": "l" },
      { ...config, type: "lines", "data-vertices": "missing", "data-lines": "l" },
    ] }));
    zip.file("export/data/v.csv", "ID,X,Y,Z,RQD\n50,1,2,3,0\n90,4,5,6,100");
    zip.file("export/data/l.csv", "LineID,VertexID\n7,50\n7,90");
    const result = await parseExportFile(await zip.generateAsync({ type: "uint8array" }));
    expect(result.scenes[0].lineSeries).toHaveLength(1);
    expect(result.scenes[0].lineSeries[0].lines[0].points.map((p) => p.id)).toEqual([50, 90]);
  });
});
