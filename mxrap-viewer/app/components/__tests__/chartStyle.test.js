import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseExportFile } from "../parseExportFile";
import { resolveChartPointColours, resolveChartPointSizes } from "../chartColours";
import {
  applyChartSelections,
  chartMarkerValue,
  countDrawnChartPoints,
  getChartMarkerChoices,
  initialChartToggles,
} from "../chartStyle";

const realExport = readFileSync(
  new URL("../../../test-data/visualiser-export-2.zip", import.meta.url)
);

// The sample's Magnitude-Time chart: "Events > threshold" (events/markers,
// coloured Mag/Spheres), "Events < threshold" (generic/markers, Cross/Grey)
// and the cumulative line.
let chart;
beforeAll(async () => {
  const parsed = await parseExportFile(realExport);
  chart = parsed.charts[0];
});

const nameOf = (choice) => choice.name;

describe("getChartMarkerChoices", () => {
  it("offers the series' own colour and size markers, read from the rows it plots", () => {
    const above = getChartMarkerChoices(chart.series[0]);
    expect(above.colour.map(nameOf)).toEqual(["Mag/Spheres", "Event Date", "Moment"]);
    expect(above.size.map(nameOf)).toEqual(["ML"]);

    const below = getChartMarkerChoices(chart.series[1]);
    expect(below.colour.map(nameOf)).toEqual(["Cross/Grey", "Cross/Green"]);
    expect(below.size).toEqual([]);
  });

  it("leaves out a marker whose column the rows do not fill", () => {
    const series = {
      ...chart.series[0],
      points: { ...chart.series[0].points, rows: chart.series[0].points.rows.map(({ SeismicMoment, ...row }) => row) },
    };
    expect(getChartMarkerChoices(series).colour.map(nameOf)).toEqual(["Mag/Spheres", "Event Date"]);
  });

  it("has nothing to offer for a missing series", () => {
    expect(getChartMarkerChoices(null)).toEqual({ colour: [], size: [] });
  });
});

describe("applyChartSelections", () => {
  it("recolours a chart series by the colour marker chosen in Marker Style", () => {
    const [byDate] = applyChartSelections(chart.series, { 0: { colourMarker: "Event Date" } });
    expect(byDate.colourMarker).toBe("Event Date");

    // The date ramp runs from blue (HSV 0.667, 1, 1) at the earliest event
    // to dark red (HSV 0, 1, 0.776) at the latest.
    const colours = resolveChartPointColours(byDate);
    const times = byDate.points.x;
    const earliest = times.indexOf(Math.min(...times));
    const latest = times.indexOf(Math.max(...times));
    expect(colours[earliest]).toBe("rgba(0, 0, 255, 1)");
    expect(colours[latest]).toBe("rgba(198, 0, 0, 1)");
    expect(colours).toHaveLength(byDate.points.x.length);
  });

  it("switches a single-colour series to another single colour", () => {
    const [, green] = applyChartSelections(chart.series, { 1: { colourMarker: "Cross/Green" } });
    const colours = resolveChartPointColours(green);
    expect(new Set(colours)).toEqual(new Set(["rgba(0, 255, 0, 1)"]));
  });

  it("draws every point in the default colour when the colour marker is cleared", () => {
    const [plain] = applyChartSelections(chart.series, { 0: { colourMarker: null } });
    expect(resolveChartPointColours(plain)).toBeNull();
  });

  it("sizes chart points by the size marker and range chosen", () => {
    const [sized] = applyChartSelections(chart.series, { 0: { sizeMarker: "ML", minSize: 2, maxSize: 12 } });
    const sizes = resolveChartPointSizes(sized);
    // The ML size marker spans ML -2..2.
    const index = sized.points.rows.findIndex((row) => Number(row.ML) >= 2);
    expect(sizes[index]).toBe(12);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
  });

  it("shows or hides points with no colour value as switched", () => {
    const [shown] = applyChartSelections(chart.series, { 0: { showNullColours: true } });
    const [unchanged] = applyChartSelections(chart.series, { 0: {} });
    expect(shown.showNullColours).toBe(true);
    expect(unchanged.showNullColours).toBe(false);
  });

  it("leaves series without a selection as the export has them", () => {
    const applied = applyChartSelections(chart.series, { 0: { colourMarker: "Moment" } });
    expect(applied[1]).toBe(chart.series[1]);
    expect(applied[2]).toBe(chart.series[2]);
  });
});

describe("chartMarkerValue", () => {
  it("is the user's choice when made, otherwise the export's", () => {
    expect(chartMarkerValue(chart.series[0], {}, "colourMarker")).toBe("Mag/Spheres");
    expect(chartMarkerValue(chart.series[0], { colourMarker: "Moment" }, "colourMarker")).toBe("Moment");
    expect(chartMarkerValue(chart.series[0], { colourMarker: null }, "colourMarker")).toBe("");
    expect(chartMarkerValue(chart.series[0], undefined, "sizeMarker")).toBe("");
  });
});

describe("initialChartToggles / countDrawnChartPoints", () => {
  it("starts from the export's Points and Lines switches", () => {
    expect(initialChartToggles(chart)).toEqual({
      "0:points": true, "0:lines": false,
      "1:points": true, "1:lines": false,
      "2:points": false, "2:lines": true,
    });
  });

  it("counts the points of the series whose Points switch is on", () => {
    const toggles = initialChartToggles(chart);
    const above = chart.series[0].points.x.length;
    const below = chart.series[1].points.x.length;
    expect(countDrawnChartPoints(chart.series, toggles)).toBe(above + below);
    expect(countDrawnChartPoints(chart.series, { ...toggles, "1:points": false })).toBe(above);
  });
});
