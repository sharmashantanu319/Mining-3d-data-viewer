import { describe, it, expect } from "vitest";
import { buildPointSeries } from "../pointSeriesData";

// An "Events"-shaped series entry from a 3dview config.json.
const EVENTS_SERIES = {
  name: "Events",
  type: "points",
  data: "s1-events",
  markerMenu: "events/markers",
  colourMarker: "Mag/Spheres",
  sizeMarker: null,
  sizeMinimum: 1,
  sizeMaximum: 25,
  nullSizes: 4,
  showNullColours: false,
  distanceAttenuation: "cartoon",
  visible: true,
  legend: true,
  clipping: true,
};

function eventRows() {
  return [
    { ID: 1, X: 10, Y: 20, Z: 30, ML: -1.5, DateTime: "2023-05-01 00:00:00" },
    { ID: 2, X: 11, Y: 21, Z: 31, ML: 0.5, DateTime: "2023-05-01 01:00:00" },
    { ID: 3, X: 12, Y: 22, Z: 32, ML: 2.1, DateTime: "2023-05-01 02:00:00" },
  ];
}

describe("buildPointSeries", () => {
  it("pulls x/y/z from the X/Y/Z columns and keeps every other column", () => {
    const series = buildPointSeries(eventRows(), EVENTS_SERIES);
    expect(series.points).toHaveLength(3);
    expect(series.points[0]).toMatchObject({
      x: 10,
      y: 20,
      z: 30,
      ML: -1.5,
      DateTime: "2023-05-01 00:00:00",
      ID: 1,
    });
  });

  it("carries the series marker settings onto the result", () => {
    const series = buildPointSeries(eventRows(), EVENTS_SERIES);
    expect(series).toMatchObject({
      name: "Events",
      markerMenu: "events/markers",
      colourMarker: "Mag/Spheres",
      sizeMarker: null,
      sizeMinimum: 1,
      sizeMaximum: 25,
      nullSizes: 4,
      showNullColours: false,
      distanceAttenuation: "cartoon",
      visible: true,
      legend: true,
      clipping: true,
    });
  });

  it("drops rows with no usable X/Y/Z and counts them", () => {
    const rows = [
      ...eventRows(),
      { ID: 4, X: "", Y: 5, Z: 6 },
      { ID: 5, Y: 5, Z: 6 },
    ];
    const series = buildPointSeries(rows, EVENTS_SERIES);
    expect(series.points).toHaveLength(3);
    expect(series.stats).toEqual({ totalRows: 5, rendered: 3, droppedNoXYZ: 2 });
  });

  it("coerces numeric string coordinates", () => {
    const series = buildPointSeries([{ ID: 1, X: "10.5", Y: "20", Z: "30" }], EVENTS_SERIES);
    expect(series.points[0]).toMatchObject({ x: 10.5, y: 20, z: 30 });
  });

  it("reads Location X/Y/Z as a fallback", () => {
    const series = buildPointSeries(
      [{ ID: 1, "Location X": 1, "Location Y": 2, "Location Z": 3 }],
      EVENTS_SERIES
    );
    expect(series.points[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it("applies sensible defaults for optional flags", () => {
    const series = buildPointSeries([{ X: 1, Y: 1, Z: 1 }], { type: "points", data: "x" });
    expect(series).toMatchObject({
      visible: true,
      legend: false,
      clipping: false,
      showNullColours: false,
    });
  });

  it("handles a non-array rows argument without throwing", () => {
    const series = buildPointSeries(null, EVENTS_SERIES);
    expect(series.points).toEqual([]);
    expect(series.stats.totalRows).toBe(0);
  });

  it("does not mutate the input rows", () => {
    const rows = eventRows();
    const snapshot = JSON.stringify(rows);
    Object.freeze(rows);
    buildPointSeries(rows, EVENTS_SERIES);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
