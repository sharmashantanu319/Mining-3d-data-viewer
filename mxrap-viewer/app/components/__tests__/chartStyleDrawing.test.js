// Follows a Marker Style choice from the sidebar all the way to the chart
// canvas: the choice is applied to the series (chartStyle.js), the colours are
// resolved exactly as ChartView resolves them (resolveChartSeriesColours),
// and drawChart is run on a canvas that records every colour it paints with.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import { drawChart } from "../ChartView";
import { resolveChartPointColours, resolveChartSeriesColours } from "../chartColours";
import { applyChartSelections, initialChartToggles } from "../chartStyle";

afterEach(() => vi.unstubAllGlobals());

describe("Marker Style colours reach the canvas", () => {
  const RAMP_HEADER = "Up to,Symbol,Start Colour (H),Start Colour (S),Start Colour (V),End Colour (H),End Colour (S),End Colour (V),Colour Ramp,Number of Colours,Transparency [0..100],Colour Space,Start Colour Colour Space,End Colour Colour Space,End Transparency [0..100]";

  // A canvas that records the colour of every filled dot and every stroke.
  function recordingCanvas() {
    const fills = [];
    const strokes = [];
    const ctx = Object.fromEntries([
      "setTransform", "clearRect", "beginPath", "moveTo", "lineTo",
      "fillText", "save", "restore", "translate", "rotate", "rect", "clip", "arc",
    ].map((name) => [name, vi.fn()]));
    ctx.fill = vi.fn(() => fills.push(ctx.fillStyle));
    ctx.stroke = vi.fn(() => strokes.push(ctx.strokeStyle));
    return { fills, strokes, canvas: { clientWidth: 1000, clientHeight: 600, getContext: () => ctx } };
  }

  it("draws the sample chart in the colours picked for it", async () => {
    const { charts: [chart] } = await parseExportFile(readFileSync(
      new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
    ));
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const draw = (selections) => {
      const styled = { ...chart, series: applyChartSelections(chart.series, selections) };
      const recorder = recordingCanvas();
      drawChart(recorder.canvas, styled, chart.axisRanges, initialChartToggles(chart), resolveChartSeriesColours(styled));
      return { ...recorder, styled };
    };

    const asExported = draw({});
    const picked = draw({ 0: { colourMarker: "Event Date" }, 1: { colourMarker: "Cross/Green" } });

    // "Events > threshold" is the only series drawn as filled dots: one fill
    // per event, in the colour its date gives it, from blue for the earliest
    // event to dark red for the latest.
    expect(picked.fills).toHaveLength(665);
    expect(picked.fills).toEqual(resolveChartPointColours(picked.styled.series[0]));
    expect(picked.fills).not.toEqual(asExported.fills);
    const times = picked.styled.series[0].points.x;
    expect(picked.fills[times.indexOf(Math.min(...times))]).toBe("rgba(0, 0, 255, 1)");
    expect(picked.fills[times.indexOf(Math.max(...times))]).toBe("rgba(198, 0, 0, 1)");

    // "Events < threshold" draws one stroke per cross, in the single colour
    // of its marker: the export's grey, or the green picked instead.
    expect(asExported.strokes.filter((colour) => colour === "rgba(159, 159, 159, 1)")).toHaveLength(5238);
    expect(picked.strokes.filter((colour) => colour === "rgba(0, 255, 0, 1)")).toHaveLength(5238);
    expect(picked.strokes).not.toContain("rgba(159, 159, 159, 1)");
  });

  it("gives each trigger its own colour, as in the client's Time after Trigger chart", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    // The client's "Trigger" marker reads "Trigger ID" through a ramp from
    // blue to red. One trigger is one colour: the 2021-10-17 slide has only
    // trigger 1, so all its points are blue; the 2019-08-08 slides have two.
    const triggerMarker = {
      name: "Trigger", type: "colour", input: "Trigger ID", inputType: "number", minimum: null, maximum: null,
      nullColour: [0, 0, 0], rampCsv: `${RAMP_HEADER}\n,,0.6666666666666666,1,1,0,1,1,sqrt,402,0,HSV,HSV,HSV,0`,
    };
    const chartFor = (triggers) => {
      const rows = triggers.map((trigger, i) => ({ "Trigger ID": trigger, "Hours after Trigger": i, CNE: i + 1 }));
      return {
        axes: { bottom: { enabled: true, scale: "linear" }, left: { enabled: true, scale: "linear" }, top: { enabled: false }, right: { enabled: false } },
        annotations: [],
        series: [{
          name: "Cumulative Events",
          axisX: { side: "bottom", column: "Hours after Trigger" },
          axisY: { side: "left", column: "CNE" },
          enablePoints: true, enableLines: false, showNullColours: false,
          colourMarker: "Trigger", sizeMarker: null, markerDefinitions: [triggerMarker],
          points: { x: rows.map((row) => row["Hours after Trigger"]), y: rows.map((row) => row.CNE), rows },
          lines: [],
        }],
      };
    };
    const ranges = { bottom: { min: 0, max: 4 }, left: { min: 0, max: 5 }, top: null, right: null };
    const fillsFor = (triggers) => {
      const chart = chartFor(triggers);
      const recorder = recordingCanvas();
      drawChart(recorder.canvas, chart, ranges, { "0:points": true }, resolveChartSeriesColours(chart));
      return recorder.fills;
    };

    const blue = "rgba(0, 0, 255, 1)";
    const red = "rgba(255, 0, 0, 1)";
    expect(fillsFor([1, 1, 2, 2])).toEqual([blue, blue, red, red]);
    expect(fillsFor([1, 1, 1])).toEqual([blue, blue, blue]);
  });
});
