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
});
