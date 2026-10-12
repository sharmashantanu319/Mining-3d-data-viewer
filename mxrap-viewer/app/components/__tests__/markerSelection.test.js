import { describe, expect, it } from "vitest";
import { applyMarkerSelections, getMarkerChoices } from "../markerSelection";

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
