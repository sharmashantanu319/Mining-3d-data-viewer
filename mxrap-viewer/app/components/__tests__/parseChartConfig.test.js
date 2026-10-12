import { describe, expect, it, vi } from "vitest";
import { parseChartConfig } from "../parseChartConfig";

const validSeries = {
  name: "Events > threshold",
  data: "s1-events",
  "data-additional": ["s1-events-mag-time"],
  filter: "AboveThreshold",
  enablePoints: true,
  enableLines: false,
  pointsVisible: true,
  linesVisible: false,
  legend: true,
  markerMenu: "events/markers",
  colourMarker: "Mag/Spheres",
  sizeMinimum: 10,
  sizeMaximum: 20,
  axisX: { side: "bottom", column: "DateTime" },
  axisY: { side: "left", column: "ML" },
};

describe("parseChartConfig", () => {
  it("returns null for a config that isn't a chart display", () => {
    expect(parseChartConfig({ type: "3dview" })).toBeNull();
    expect(parseChartConfig(null)).toBeNull();
    expect(parseChartConfig(undefined)).toBeNull();
  });

  it("parses axes with a default linear scale and null bounds", () => {
    const chart = parseChartConfig({
      type: "chart",
      axes: {
        bottom: { enabled: true, title: "Date", scale: "datetime", minimum: null, maximum: null },
        left: { enabled: true, title: "ML", scale: "linear", minimum: null, maximum: 5 },
        right: { enabled: true, title: "Cumulative", scale: "linear", minimum: 0, maximum: null },
      },
      series: [],
    });

    expect(chart.axes.bottom).toEqual({ enabled: true, title: "Date", scale: "datetime", minimum: null, maximum: null });
    expect(chart.axes.left).toEqual({ enabled: true, title: "ML", scale: "linear", minimum: null, maximum: 5 });
    expect(chart.axes.right).toEqual({ enabled: true, title: "Cumulative", scale: "linear", minimum: 0, maximum: null });
    // An axis missing from the config entirely still resolves to a disabled default.
    expect(chart.axes.top).toEqual({ enabled: false, title: "", scale: "linear", minimum: null, maximum: null });
  });

  it("falls back to a linear scale for an unrecognised axis scale string", () => {
    const chart = parseChartConfig({
      type: "chart",
      axes: { bottom: { enabled: true, scale: "not-a-real-scale" } },
      series: [],
    });

    expect(chart.axes.bottom.scale).toBe("linear");
  });

  it("parses a well-formed series with all its fields", () => {
    const chart = parseChartConfig({ type: "chart", series: [validSeries] });

    expect(chart.series).toHaveLength(1);
    expect(chart.series[0]).toMatchObject({
      name: "Events > threshold",
      data: "s1-events",
      dataAdditional: ["s1-events-mag-time"],
      filter: "AboveThreshold",
      enablePoints: true,
      enableLines: false,
      markerMenu: "events/markers",
      colourMarker: "Mag/Spheres",
      sizeMinimum: 10,
      sizeMaximum: 20,
      axisX: { side: "bottom", column: "DateTime" },
      axisY: { side: "left", column: "ML" },
    });
  });

  it("drops a series with no data file, warning instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chart = parseChartConfig({ type: "chart", series: [{ ...validSeries, data: undefined }] });

    expect(chart.series).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no "data" file referenced'));
    warn.mockRestore();
  });

  it("drops a series with a missing or invalid axisX/axisY", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(parseChartConfig({ type: "chart", series: [{ ...validSeries, axisX: undefined }] }).series).toEqual([]);
    expect(parseChartConfig({ type: "chart", series: [{ ...validSeries, axisY: { side: "nowhere", column: "ML" } }] }).series).toEqual([]);
    expect(parseChartConfig({ type: "chart", series: [{ ...validSeries, axisX: { side: "bottom", column: "" } }] }).series).toEqual([]);

    warn.mockRestore();
  });

  it("keeps a well-formed series alongside a dropped one, matching every other degrade-safe parser here", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chart = parseChartConfig({
      type: "chart",
      series: [validSeries, { ...validSeries, data: "" }],
    });

    expect(chart.series).toHaveLength(1);
    warn.mockRestore();
  });

  it("defaults linesGroupBy/linePlotOrder/lineOverrideColour and drops non-string group-by entries", () => {
    const chart = parseChartConfig({
      type: "chart",
      series: [{ ...validSeries, linesGroupBy: ["Material", 5, ""], linePlotOrder: "DateTime", lineOverrideColour: "rgb(0,0,127)" }],
    });

    expect(chart.series[0].linesGroupBy).toEqual(["Material"]);
    expect(chart.series[0].linePlotOrder).toBe("DateTime");
    expect(chart.series[0].lineOverrideColour).toBe("rgb(0,0,127)");

    const withoutOverrides = parseChartConfig({ type: "chart", series: [validSeries] });
    expect(withoutOverrides.series[0].linesGroupBy).toEqual([]);
    expect(withoutOverrides.series[0].linePlotOrder).toBeNull();
    expect(withoutOverrides.series[0].lineOverrideColour).toBeNull();
  });

  it("parses annotations with axis-coordinate locations, dropping ones with no text or no location", () => {
    const chart = parseChartConfig({
      type: "chart",
      annotations: [
        { location: { bottom: "2023-05-19 18:01:18.254", right: 400 }, colour: "rgb(0,0,255)", text: "A spike" },
        { location: { bottom: "2023-05-19" }, text: "" },
        { text: "no location" },
      ],
    });

    expect(chart.annotations).toEqual([
      { text: "A spike", location: { bottom: "2023-05-19 18:01:18.254", right: 400 }, color: "rgb(0,0,255)" },
    ]);
  });

  it("uses the config's name, or the given label as a fallback", () => {
    expect(parseChartConfig({ type: "chart", name: "Magnitude-Time" }, "s1-mag-time-chart").name).toBe("Magnitude-Time");
    expect(parseChartConfig({ type: "chart" }, "s1-mag-time-chart").name).toBe("s1-mag-time-chart");
  });
});
