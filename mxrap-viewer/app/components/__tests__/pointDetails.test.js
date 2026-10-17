import { describe, expect, it } from "vitest";
import { describePointSeries, formatDetailNumber, groupPointDetails, pointStatusLabel } from "../pointDetails";
import { rampCsv, rampRow } from "./fixtures/ramps";

// Column sets copied from the customer's TestResponseViewer and TestHazards
// exports (values made up).
const eventPoint = {
  ID: 5148, DateTime: "2021-10-17 16:24:51.068", X: 10182.1836, Y: 10211.1104, Z: 3067.8786,
  ML: -2.055203, "Trigger ID": 1, "Hours after Trigger": 10.813074, CNE: 5148, "CNE Group": 1,
  x: 10182.1836, y: 10211.1104, z: 3067.8786, sourceIndex: 5147,
};
const mlRamp = rampCsv([rampRow({ upTo: "", start: [0, 1, 1], end: [0.6667, 1, 1], space: "HSV" })]);
const eventSeries = {
  name: "Response Events",
  colourMarker: "Event ML",
  sizeMarker: "Event ML",
  points: [eventPoint, { ...eventPoint, ML: 1 }],
  markerDefinitions: [
    { name: "Event ML", type: "colour", input: "ML", inputType: "number", minimum: -4, maximum: 4, nullColour: [0, 0, 0], rampCsv: mlRamp },
    { name: "Event ML", type: "size", input: "ML", inputType: "number", minimum: -2, maximum: 2 },
  ],
};

const sectionsOf = (point, series) => groupPointDetails(point, describePointSeries(series));
const labels = (sections) => Object.fromEntries(sections.map((s) => [s.title, s.rows.map((r) => r.label)]));

describe("groupPointDetails", () => {
  it("groups an event's columns, lists each column once and drops the duplicate position", () => {
    const sections = sectionsOf(eventPoint, eventSeries);
    expect(labels(sections)).toEqual({
      "Colour & size": ["ML"],
      Location: ["X", "Y", "Z"],
      Time: ["DateTime", "Hours after Trigger"],
      "IDs & groups": ["ID", "Trigger ID", "CNE Group"],
      "Other data": ["CNE"],
    });
    const [display, location] = sections;
    expect(display.rows[0]).toMatchObject({ value: -2.055203, tag: "colour · size" });
    expect(display.rows[0].swatch).toMatch(/^rgba\(/);
    expect(location.rows.map((r) => r.value)).toEqual(["10182.18", "10211.11", "3067.88"]);
    expect(location.rows.every((r) => r.numeric === true)).toBe(true);
  });

  it("shows colour and size separately when they read different columns", () => {
    const series = {
      ...eventSeries,
      sizeMarker: "By hours",
      markerDefinitions: [...eventSeries.markerDefinitions, { name: "By hours", type: "size", input: "Hours after Trigger" }],
    };
    const [display, , time] = sectionsOf(eventPoint, series);
    expect(display.rows.map((r) => [r.label, r.tag])).toEqual([["ML", "colour"], ["Hours after Trigger", "size"]]);
    expect(time.rows.map((r) => r.label)).toEqual(["DateTime"]);
  });

  it("groups a hazard node's columns", () => {
    const point = { ID: 7, X: 10250.14, Y: 10246.46, Z: 2860.5, "Span (meters)": 12.7151, "P[ML within R]": 0.0104, "P[ppv>design]": 0.0325, x: 10250.14, y: 10246.46, z: 2860.5, sourceIndex: 0 };
    const series = {
      name: "Minodes", colourMarker: "P[ML within R]", sizeMarker: null, points: [point],
      markerDefinitions: [{ name: "P[ML within R]", type: "colour", input: "P[ML within R]", scale: "logarithmic", minimum: 1e-15, maximum: 1, nullColour: [1, 0.941, 1], rampCsv: mlRamp }],
    };
    expect(labels(sectionsOf(point, series))).toEqual({
      "Colour & size": ["P[ML within R]"],
      Location: ["X", "Y", "Z"],
      "IDs & groups": ["ID"],
      "Other data": ["Span (meters)", "P[ppv>design]"],
    });
  });

  it("shows a single-colour marker as one colour for every point", () => {
    const point = { ID: 3168418, DateTime: "2021-10-16 23:55:55.502", X: 1, Y: 2, Z: 3, ML: -1.92, x: 1, y: 2, z: 3, sourceIndex: 0 };
    const series = { name: "Selected Triggers", colourMarker: "Cross/Grey", points: [point], markerDefinitions: [{ name: "Cross/Grey", type: "single-colour", colour: "rgb(159,159,159)", symbol: "cross2.png" }] };
    const [display, , , , other] = sectionsOf(point, series);
    expect(display.rows).toEqual([{ label: "Colour", value: "Cross/Grey", tag: "same for every point", swatch: "rgba(159, 159, 159, 1)" }]);
    expect(other.rows.map((r) => r.label)).toEqual(["ML"]);
  });

  it("falls back to plain groups when the series has no markers", () => {
    expect(labels(groupPointDetails({ x: 1, y: 2, z: 3, magnitude: 2.5 }, describePointSeries({ name: "Demo" })))).toEqual({
      Location: ["X", "Y", "Z"],
      "Other data": ["magnitude"],
    });
  });

  it("uses the missing-value colour when the colour column is empty", () => {
    const series = { ...eventSeries, markerDefinitions: [{ ...eventSeries.markerDefinitions[0], nullColour: [1, 0.941, 1] }] };
    const [display] = sectionsOf({ ...eventPoint, ML: "" }, series);
    expect(display.rows[0].swatch).toBe("rgba(255, 240, 255, 1)");
  });
});

describe("formatDetailNumber", () => {
  it("keeps tiny and huge values readable instead of rounding them to 0", () => {
    expect(formatDetailNumber(3.1086244689504383e-15)).toBe("3.109e-15");
    expect(formatDetailNumber(2.5e13)).toBe("2.5e13");
    expect(formatDetailNumber(9.1e-5)).toBe("9.1e-5");
    expect(formatDetailNumber(1e-5)).toBe("1e-5");
    expect(formatDetailNumber(-1.01e-7)).toBe("-1.01e-7");
    expect(formatDetailNumber(5148)).toBe("5148");
    expect(formatDetailNumber(0)).toBe("0");
    expect(formatDetailNumber(-2.055203)).toBe((-2.055203).toLocaleString(undefined, { maximumFractionDigits: 6 }));
    expect(formatDetailNumber(5165195.5)).toBe((5165195.5).toLocaleString(undefined, { maximumFractionDigits: 6, useGrouping: false }));
    expect(formatDetailNumber(5165195.5)).not.toContain(",");
  });
});

describe("pointStatusLabel", () => {
  it("names a customer point by its ID column, not its row index", () => {
    expect(pointStatusLabel({ ID: 3626505, X: 1, Y: 2, Z: 3 }, 1444)).toBe("ID 3626505");
  });

  it("uses the demo scenes' lowercase id", () => {
    expect(pointStatusLabel({ id: 101, x: 0, y: 0, z: 0 }, undefined)).toBe("ID 101");
  });

  it("falls back to the 1-based data row when there is no ID", () => {
    expect(pointStatusLabel({ X: 1, Y: 2, Z: 3, ID: "" }, 1444)).toBe("Row 1445");
    expect(pointStatusLabel({ X: 1 }, 0)).toBe("Row 1");
    expect(pointStatusLabel({ X: 1 }, undefined)).toBeNull();
  });
});
