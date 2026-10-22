import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import { drawChart, resolveRanges } from "../ChartView";
import { resolveChartSeriesColours } from "../chartColours";
import { initialChartToggles } from "../chartStyle";
import { chartPointDetails, findChartPointAt } from "../chartPointDetails";

afterEach(() => vi.unstubAllGlobals());

// The sample's Magnitude-Time chart: "Events > threshold" (665 dots, coloured
// by ML), "Events < threshold" (5,238 crosses) and the cumulative line.
let chart;
beforeAll(async () => {
  const parsed = await parseExportFile(readFileSync(
    new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
  ));
  chart = parsed.charts[0];
});

// A canvas that records each arc and the colour of each stroke.
function recordingCanvas() {
  const strokes = [];
  const ctx = Object.fromEntries([
    "setTransform", "clearRect", "beginPath", "moveTo", "lineTo",
    "fillText", "save", "restore", "translate", "rotate", "rect", "clip", "arc", "fill",
  ].map((name) => [name, vi.fn()]));
  ctx.stroke = vi.fn(() => strokes.push(ctx.strokeStyle));
  return { ctx, strokes, canvas: { clientWidth: 1000, clientHeight: 600, getContext: () => ctx } };
}

describe("findChartPointAt", () => {
  const targets = [
    { seriesIndex: 0, index: 0, x: 100, y: 100, r: 2.5 },
    { seriesIndex: 0, index: 1, x: 140, y: 100, r: 2.5 },
    { seriesIndex: 1, index: 7, x: 140, y: 100, r: 7.5 },
  ];

  it("picks the point under the mouse, within a few pixels of its edge", () => {
    expect(findChartPointAt(targets, 101, 101)).toEqual(targets[0]);
    expect(findChartPointAt(targets, 106, 100)).toEqual(targets[0]);
    expect(findChartPointAt(targets, 107, 100)).toBeNull();
    expect(findChartPointAt(targets, 300, 300)).toBeNull();
    expect(findChartPointAt([], 100, 100)).toBeNull();
  });

  it("picks the point drawn last where points overlap, as it is the one on top", () => {
    expect(findChartPointAt(targets, 140, 100)).toEqual(targets[2]);
    // A bigger point is easier to hit.
    expect(findChartPointAt(targets, 151, 100)).toEqual(targets[2]);
  });
});

describe("chartPointDetails", () => {
  it("describes a sample chart point, plotted values first", () => {
    const details = chartPointDetails(chart.series[0], 0);
    expect(details.seriesName).toBe("Events > threshold");
    expect(details.point.ID).toBe(3624578);
    expect(details.sections.map((section) => section.id)).toEqual(["display", "plotted", "location", "ids", "other"]);

    const [display, plotted, location, ids] = details.sections;
    // ML sets the colour (Mag/Spheres), so it is listed there, not again as the y value.
    expect(display.rows).toHaveLength(1);
    expect(display.rows[0]).toMatchObject({ label: "ML", value: -0.91, tag: "colour" });
    expect(display.rows[0].swatch).toMatch(/^rgba\(/);
    expect(plotted.title).toBe("On the chart");
    expect(plotted.rows).toEqual([{ label: "DateTime", value: "2023-05-01 10:28:12.704" }]);
    expect(location.rows.map((row) => row.value)).toEqual(["10305.60", "10114.00", "2646.10"]);
    expect(ids.rows).toEqual([{ label: "ID", value: 3624578 }]);

    // Every column appears once.
    const labels = details.sections.flatMap((section) => section.rows.map((row) => row.label));
    expect(labels.filter((label) => label === "DateTime")).toHaveLength(1);
    expect(labels.filter((label) => label === "ML")).toHaveLength(1);
  });

  it("lists a Time after Trigger point's plotted values, and no Location without X/Y/Z", () => {
    const series = {
      name: "Cumulative Events",
      axisX: { side: "bottom", column: "Hours after Trigger" },
      axisY: { side: "left", column: "CNE" },
      colourMarker: "Trigger",
      sizeMarker: null,
      markerDefinitions: [{
        name: "Trigger", type: "colour", input: "Trigger ID", inputType: "number", minimum: null, maximum: null,
        nullColour: [0, 0, 0],
        rampCsv: "Up to,Symbol,Start Colour (H),Start Colour (S),Start Colour (V),End Colour (H),End Colour (S),End Colour (V),Colour Ramp,Number of Colours,Transparency [0..100],Colour Space,Start Colour Colour Space,End Colour Colour Space,End Transparency [0..100]\n,,0.6666666666666666,1,1,0,1,1,sqrt,402,0,HSV,HSV,HSV,0",
      }],
      points: {
        x: [0.5, 10.81],
        y: [1, 5148],
        rows: [
          { ID: 6, "Trigger ID": 1, "Hours after Trigger": 0.5, CNE: 1, "CNE Group": 1, ML: -1.2 },
          { ID: 7, "Trigger ID": 2, "Hours after Trigger": 10.81, CNE: 5148, "CNE Group": 2, ML: -2.05 },
        ],
      },
      lines: [],
    };
    const details = chartPointDetails(series, 1);
    expect(details.sections.map((section) => section.id)).toEqual(["display", "plotted", "ids", "other"]);
    const [display, plotted, ids, other] = details.sections;
    expect(display.rows[0]).toMatchObject({ label: "Trigger ID", value: 2, tag: "colour", swatch: "rgba(255, 0, 0, 1)" });
    expect(plotted.rows).toEqual([
      { label: "Hours after Trigger", value: 10.81 },
      { label: "CNE", value: 5148 },
    ]);
    expect(ids.rows).toEqual([{ label: "ID", value: 7 }, { label: "CNE Group", value: 2 }]);
    expect(other.rows).toEqual([{ label: "ML", value: -2.05 }]);
  });

  it("gives nothing for a point that is not there", () => {
    expect(chartPointDetails(chart.series[0], 665)).toBeNull();
    expect(chartPointDetails(undefined, 0)).toBeNull();
  });
});

describe("drawChart and chart points", () => {
  it("returns where every drawn point is, and rings the selected one", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const colours = resolveChartSeriesColours(chart);
    const toggles = initialChartToggles(chart);
    const ranges = resolveRanges(chart, toggles);

    const plain = recordingCanvas();
    const targets = drawChart(plain.canvas, chart, ranges, toggles, colours);
    // 665 dots and 5,238 crosses are drawn; the cumulative series has no points shown.
    expect(targets).toHaveLength(665 + 5238);
    expect(targets.filter((target) => target.seriesIndex === 0)).toHaveLength(665);
    expect(targets.filter((target) => target.seriesIndex === 1)).toHaveLength(5238);

    // The point found at a target's position is that target (or one drawn on top of it).
    const first = targets[0];
    expect(findChartPointAt(targets, first.x, first.y)).not.toBeNull();

    const ringed = recordingCanvas();
    drawChart(ringed.canvas, chart, ranges, toggles, colours, [{ seriesIndex: 0, index: 0, kind: "selected" }]);
    expect(ringed.ctx.arc).toHaveBeenCalledWith(first.x, first.y, first.r + 3, 0, Math.PI * 2);
    expect(ringed.strokes.filter((colour) => colour === "#e8f7d1")).toHaveLength(1);
    expect(plain.strokes).not.toContain("#e8f7d1");
  });
});
