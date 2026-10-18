import { describe, expect, it } from "vitest";
import { applyMarkerSelections, getMarkerChoices } from "../markerSelection";
import { pickLegendSeriesIndices } from "../markerSelection";

const DEFINITIONS = [
  { name: "Magnitude", type: "colour", input: "ML", ramp: "magnitude.csv" },
  { name: "Date", type: "colour", input: "DateTime", ramp: "date.csv" },
  { name: "Configuration", input: "Configuration", ramp: "config.csv" },
  { name: "ML size", type: "size", input: "ML" },
  { name: "Broken" },
  null,
];

describe("getMarkerChoices", () => {
  it("lists explicit and inferred colour definitions plus size definitions", () => {
    const choices = getMarkerChoices({ markerDefinitions: DEFINITIONS });
    expect(choices.colour.map((choice) => choice.name)).toEqual([
      "Magnitude",
      "Date",
      "Configuration",
    ]);
    expect(choices.size.map((choice) => choice.name)).toEqual(["ML size"]);
  });

  // The TestHazards "Minodes" series: its menu holds the seismic-event
  // markers, plus "P[ML within R]" borrowed from the painted-hazard menu.
  const MINODES = {
    colourMarker: "P[ML within R]",
    sizeMarker: null,
    markerDefinitions: [
      { name: "Mag/Spheres", type: "colour", input: "ML", ramp: "magnitude.csv" },
      { name: "Event Date", type: "colour", input: "DateTime", ramp: "date.csv" },
      { name: "Moment", type: "colour", input: "SeismicMoment", ramp: "moment.csv" },
      { name: "ML", type: "size", input: "ML" },
      { name: "Cross/Grey", type: "single-colour", colour: "rgb(159,159,159)" },
      { name: "P[ML within R]", type: "colour", input: "P[ML within R]", ramp: "pml.csv" },
    ],
    points: [{ ID: 7, X: 1, Y: 2, Z: 3, "Span (meters)": 12.7, "P[ML within R]": 0.01, x: 1, y: 2, z: 3, sourceIndex: 0 }],
  };

  it("only offers markers whose input column the series has", () => {
    const choices = getMarkerChoices(MINODES);
    expect(choices.colour.map((choice) => choice.name)).toEqual(["Cross/Grey", "P[ML within R]"]);
    expect(choices.size).toEqual([]);
  });

  it("keeps the markers in use listed even when their column is missing", () => {
    const choices = getMarkerChoices(MINODES, { colour: "Mag/Spheres", size: "ML" });
    expect(choices.colour.map((choice) => choice.name)).toEqual(["Mag/Spheres", "Cross/Grey", "P[ML within R]"]);
    expect(choices.size.map((choice) => choice.name)).toEqual(["ML"]);
  });

  it("does not offer a marker whose column is empty in every row", () => {
    const emptyDates = MINODES.points.map((point) => ({ ...point, DateTime: "" }));
    const choices = getMarkerChoices({ ...MINODES, points: [...emptyDates, { ...emptyDates[0], DateTime: null }] });
    expect(choices.colour.map((choice) => choice.name)).toEqual(["Cross/Grey", "P[ML within R]"]);
  });

  it("offers a marker whose column has a value in any row, not only the first", () => {
    const points = [
      { ...MINODES.points[0], ML: "" },
      { ...MINODES.points[0], ID: 8, ML: NaN },
      { ...MINODES.points[0], ID: 9, ML: -0.4 },
    ];
    const choices = getMarkerChoices({ ...MINODES, points });
    expect(choices.colour.map((choice) => choice.name)).toEqual(["Mag/Spheres", "Cross/Grey", "P[ML within R]"]);
    expect(choices.size.map((choice) => choice.name)).toEqual(["ML"]);
  });

  it("offers every marker when there are no points to check", () => {
    const choices = getMarkerChoices({ ...MINODES, points: [] });
    expect(choices.colour).toHaveLength(5);
    expect(choices.size).toHaveLength(1);
  });

  it("deduplicates definitions by name and ignores malformed entries", () => {
    const choices = getMarkerChoices({
      markerDefinitions: [...DEFINITIONS, { ...DEFINITIONS[0] }],
    });
    expect(choices.colour.filter((choice) => choice.name === "Magnitude")).toHaveLength(1);
  });
});

describe("applyMarkerSelections", () => {
  it("overrides only explicitly selected marker fields", () => {
    const original = [{ colourMarker: "Magnitude", sizeMarker: "ML size", points: [] }];
    const result = applyMarkerSelections(original, { 0: { colourMarker: "Date" } });
    expect(result[0].colourMarker).toBe("Date");
    expect(result[0].sizeMarker).toBe("ML size");
    expect(original[0].colourMarker).toBe("Magnitude");
  });

  it("preserves an explicit null size selection", () => {
    const result = applyMarkerSelections(
      [{ colourMarker: "Magnitude", sizeMarker: "ML size" }],
      { 0: { sizeMarker: null } }
    );
    expect(result[0].sizeMarker).toBeNull();
  });

  it("leaves sizeMinimum/sizeMaximum untouched with no min/max/invert selection", () => {
    const result = applyMarkerSelections(
      [{ sizeMinimum: 1, sizeMaximum: 25 }],
      { 0: { colourMarker: "Date" } }
    );
    expect(result[0].sizeMinimum).toBe(1);
    expect(result[0].sizeMaximum).toBe(25);
  });

  it("overrides sizeMinimum/sizeMaximum from explicit Min size / Max size", () => {
    const result = applyMarkerSelections(
      [{ sizeMinimum: 1, sizeMaximum: 25 }],
      { 0: { minSize: 5, maxSize: 40 } }
    );
    expect(result[0].sizeMinimum).toBe(5);
    expect(result[0].sizeMaximum).toBe(40);
  });

  it("invert swaps the resolved min/max without requiring the user to re-enter them", () => {
    const result = applyMarkerSelections(
      [{ sizeMinimum: 1, sizeMaximum: 25 }],
      { 0: { minSize: 5, maxSize: 40, invertSize: true } }
    );
    expect(result[0].sizeMinimum).toBe(40);
    expect(result[0].sizeMaximum).toBe(5);
  });

  it("invert alone (no min/max touched) swaps the series' existing range", () => {
    const result = applyMarkerSelections(
      [{ sizeMinimum: 1, sizeMaximum: 25 }],
      { 0: { invertSize: true } }
    );
    expect(result[0].sizeMinimum).toBe(25);
    expect(result[0].sizeMaximum).toBe(1);
  });

  it("a partial override (only Min size touched) keeps the series' existing max", () => {
    const result = applyMarkerSelections(
      [{ sizeMinimum: 1, sizeMaximum: 25 }],
      { 0: { minSize: 8 } }
    );
    expect(result[0].sizeMinimum).toBe(8);
    expect(result[0].sizeMaximum).toBe(25);
  });

  it("turning invert back off restores the non-inverted order", () => {
    const result = applyMarkerSelections(
      [{ sizeMinimum: 1, sizeMaximum: 25 }],
      { 0: { minSize: 5, maxSize: 40, invertSize: false } }
    );
    expect(result[0].sizeMinimum).toBe(5);
    expect(result[0].sizeMaximum).toBe(40);
  });
});

describe("pickLegendSeriesIndices", () => {
  it("uses the series the export marks legend: true", () => {
    expect(pickLegendSeriesIndices([{ legend: false }, { legend: true }, { legend: true }], 0)).toEqual([1, 2]);
  });

  it("falls back to the Marker Style series when the export marks none", () => {
    expect(pickLegendSeriesIndices([{ legend: false }, { legend: false }], 1)).toEqual([1]);
    expect(pickLegendSeriesIndices([{}, {}], 0)).toEqual([0]);
  });

  it("returns nothing for an out-of-range index or no series", () => {
    expect(pickLegendSeriesIndices([{ legend: false }], 3)).toEqual([]);
    expect(pickLegendSeriesIndices([], 0)).toEqual([]);
    expect(pickLegendSeriesIndices(undefined, 0)).toEqual([]);
  });
});
