import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import {
  DEFAULT_CHART_LINE_COLOUR,
  resolveChartLineColour,
  resolveChartPointColours,
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
