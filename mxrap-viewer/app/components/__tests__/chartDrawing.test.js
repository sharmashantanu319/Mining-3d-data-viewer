import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import { drawChart } from "../ChartView";
import { resolveChartLineColour, resolveChartPointColours } from "../chartColours";

afterEach(() => vi.unstubAllGlobals());

describe("real Magnitude-Time export to canvas", () => {
  it("plots both event groups, the cumulative line and annotation, and honours visibility toggles", async () => {
    const { charts: [chart] } = await parseExportFile(readFileSync(
      new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
    ));
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    const ctx = Object.fromEntries([
      "setTransform", "clearRect", "beginPath", "moveTo", "lineTo", "stroke",
      "fillText", "save", "restore", "translate", "rotate", "rect", "clip", "arc", "fill",
    ].map((name) => [name, vi.fn()]));
    const canvas = { clientWidth: 1000, clientHeight: 600, getContext: () => ctx };
    const toggles = { "0:points": true, "1:points": true, "2:lines": true };
    const colours = chart.series.map((series) => ({
      pointColours: resolveChartPointColours(series),
      lineColour: resolveChartLineColour(series),
      lineColours: series.lines.map(() => null),
    }));
    drawChart(canvas, chart, chart.axisRanges, toggles, colours);
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1200);
    // 665 above-threshold events are circular markers. 5,238 below-threshold
    // events use crosses; one further circle marks the spike annotation.
    expect(ctx.arc).toHaveBeenCalledTimes(666);
    expect(ctx.fill).toHaveBeenCalledTimes(665);
    expect(ctx.fillText.mock.calls.flat()).toContain("Local Magnitude");
    expect(ctx.fillText.mock.calls.flat()).toContain("Cumulative Events");
    expect(ctx.fillText.mock.calls.flat()).toContain("A large spike");
    const visibleLineCount = ctx.lineTo.mock.calls.length;
    Object.values(ctx).forEach((value) => { if (vi.isMockFunction(value)) value.mockClear(); });
    drawChart(canvas, chart, chart.axisRanges, {}, colours);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.fill).not.toHaveBeenCalled();
    // Removing all series removes both crosses and cumulative line segments.
    expect(visibleLineCount - ctx.lineTo.mock.calls.length).toBe(5238 * 2 + 664);
  });
});

describe("chart point sizes", () => {
  function mockCanvas() {
    const ctx = Object.fromEntries([
      "setTransform", "clearRect", "beginPath", "moveTo", "lineTo", "stroke",
      "fillText", "save", "restore", "translate", "rotate", "rect", "clip", "arc", "fill",
    ].map((name) => [name, vi.fn()]));
    return { ctx, canvas: { clientWidth: 1000, clientHeight: 600, getContext: () => ctx } };
  }
  const axes = {
    bottom: { enabled: true, title: "", scale: "linear" },
    left: { enabled: true, title: "", scale: "linear" },
    top: { enabled: false },
    right: { enabled: false },
  };
  const ranges = { bottom: { min: 0, max: 2 }, left: { min: 0, max: 2 }, top: null, right: null };
  const seriesWith = (colourMarker) => ({
    axisX: { side: "bottom" }, axisY: { side: "left" }, enablePoints: true, enableLines: false,
    colourMarker, points: { x: [0, 1, 2], y: [0, 1, 2], rows: [] }, lines: [],
  });

  it("draws each point as wide as its size-marker size", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const { ctx, canvas } = mockCanvas();
    const chart = { axes, series: [seriesWith(null)], annotations: [] };
    drawChart(canvas, chart, ranges, { "0:points": true }, [{ pointColours: null, pointSizes: [2, 8.5, 15], lineColour: "", lineColours: [] }]);
    expect(ctx.arc.mock.calls.map((call) => call[2])).toEqual([1, 4.25, 7.5]);
  });

  it("keeps the default size without a size marker, and sizes crosses too", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const { ctx, canvas } = mockCanvas();
    drawChart(canvas, { axes, series: [seriesWith(null)], annotations: [] }, ranges, { "0:points": true },
      [{ pointColours: null, pointSizes: null, lineColour: "", lineColours: [] }]);
    expect(ctx.arc.mock.calls.map((call) => call[2])).toEqual([2.5, 2.5, 2.5]);

    const crosses = mockCanvas();
    drawChart(crosses.canvas, { axes, series: [seriesWith("Cross/Grey")], annotations: [] }, ranges, { "0:points": true },
      [{ pointColours: null, pointSizes: [2, 8.5, 15], lineColour: "", lineColours: [] }]);
    // Plot area starts at x = 64 and ends at y = 556; the first cross is 2 px wide.
    expect(crosses.ctx.lineTo).toHaveBeenCalledWith(65, 556);
    expect(crosses.ctx.lineTo).toHaveBeenCalledWith(64, 557);
  });
});
