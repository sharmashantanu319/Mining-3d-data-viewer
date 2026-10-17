import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import {
  DARK_PLOT_NEUTRAL_LINE_COLOUR,
  DEFAULT_CHART_LINE_COLOUR,
  resolveChartLineColour,
  resolveChartPointColours,
  resolveChartPointSizes,
} from "../chartColours";

const realExport = readFileSync(
  new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
);

describe("resolveChartLineColour", () => {
  it("uses the export's override colour, else the default", () => {
    expect(resolveChartLineColour({ lineOverrideColour: "rgb(0,0,127)" })).toBe("rgb(0,0,127)");
    expect(resolveChartLineColour({ lineOverrideColour: null })).toBe(DEFAULT_CHART_LINE_COLOUR);
    expect(resolveChartLineColour({ lineOverrideColour: "  " })).toBe(DEFAULT_CHART_LINE_COLOUR);
  });

  it("draws a black or near-black grey line light grey so it shows on the dark plot", () => {
    expect(resolveChartLineColour({ lineOverrideColour: "rgb(0,0,0)" })).toBe(DARK_PLOT_NEUTRAL_LINE_COLOUR);
    expect(resolveChartLineColour({ lineOverrideColour: "rgb(40, 40, 40)" })).toBe(DARK_PLOT_NEUTRAL_LINE_COLOUR);
    expect(resolveChartLineColour({ lineOverrideColour: "rgb(60,60,60)" })).toBe("rgb(60,60,60)");
    expect(resolveChartLineColour({ lineOverrideColour: "rgb(0,0,40)" })).toBe("rgb(0,0,40)");
  });
});

describe("resolveChartPointSizes", () => {
  // The client's response chart: sized by "Event ML" from 2 to 15, nulls 4,
  // with a colour marker of the same name in the same menu.
  const series = {
    sizeMarker: "Event ML",
    sizeMinimum: 2,
    sizeMaximum: 15,
    nullSizes: 4,
    markerDefinitions: [
      { name: "Event ML", type: "colour", input: "ML", inputType: "number", minimum: -4, maximum: 4 },
      { name: "Event ML", type: "size", input: "ML", inputType: "number", minimum: -2, maximum: 2 },
    ],
    points: { x: [1, 2, 3, 4, 5], y: [1, 2, 3, 4, 5], rows: [{ ML: -2 }, { ML: 0 }, { ML: 2 }, { ML: "" }, { ML: 5 }] },
  };

  it("gives each point its size-marker size in pixels", () => {
    expect(resolveChartPointSizes(series)).toEqual([2, 8.5, 15, 4, 15]);
  });

  it("returns null without a usable size marker", () => {
    expect(resolveChartPointSizes({ ...series, sizeMarker: null })).toBeNull();
    expect(resolveChartPointSizes({ ...series, sizeMarker: "Missing" })).toBeNull();
    expect(resolveChartPointSizes({ ...series, points: { x: [], y: [], rows: [] } })).toBeNull();
  });
});

describe("resolveChartPointColours", () => {
  it("returns null when there is nothing to colour by", () => {
    expect(resolveChartPointColours(null)).toBeNull();
    expect(resolveChartPointColours({ points: { rows: [] }, colourMarker: "x", markerDefinitions: [] })).toBeNull();
    expect(
      resolveChartPointColours({ points: { rows: [{ ML: 1 }] }, colourMarker: "x", markerDefinitions: [] })
    ).toBeNull();
  });

  describe("against the real Magnitude-Time chart", () => {
    let chart;
    beforeAll(async () => {
      ({ charts: [chart] } = await parseExportFile(realExport));
    });

    it("loads each series' marker definitions", () => {
      expect(chart.series.every((s) => s.markerDefinitions.length > 0)).toBe(true);
    });

    it("colours every above-threshold event from the Mag/Spheres ramp", () => {
      const series = chart.series[0];
      const colours = resolveChartPointColours(series);
      expect(colours).toHaveLength(series.points.x.length);
      expect(colours.every((c) => /^rgba\(\d+, \d+, \d+, [\d.]+\)$/.test(c))).toBe(true);
      expect(new Set(colours).size).toBeGreaterThan(1);
    });

    it("gives larger and smaller magnitudes different colours", () => {
      const series = chart.series[0];
      const colours = resolveChartPointColours(series);
      const ml = series.points.y;
      const hi = ml.indexOf(Math.max(...ml));
      const lo = ml.indexOf(Math.min(...ml));
      expect(colours[hi]).not.toBe(colours[lo]);
    });
  });
});
