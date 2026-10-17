import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { findMarkerDefinition } from "../markerLookup";
import { checkMarkers } from "../markerValidation";
import { RAMP_HEADER } from "./fixtures/ramps";

// Same shape as the customer's stra-events/markers.json, where the colour
// and the size marker are both called "Event ML" (values made up).
const EVENT_ML_COLOUR = { name: "Event ML", type: "colour", input: "ML", inputType: "number", minimum: -4, maximum: 4, ramp: "magnitude.csv", nullColour: [0, 0, 0] };
const EVENT_ML_SIZE = { name: "Event ML", type: "size", input: "ML", inputType: "number", minimum: -2, maximum: 2 };

describe("findMarkerDefinition", () => {
  it("tells a colour and a size marker with the same name apart", () => {
    const definitions = [EVENT_ML_COLOUR, EVENT_ML_SIZE];
    expect(findMarkerDefinition(definitions, "Event ML", "colour")).toBe(EVENT_ML_COLOUR);
    expect(findMarkerDefinition(definitions, "Event ML", "size")).toBe(EVENT_ML_SIZE);
    expect(findMarkerDefinition([EVENT_ML_SIZE, EVENT_ML_COLOUR], "Event ML", "colour")).toBe(EVENT_ML_COLOUR);
  });

  it("accepts single-colour and untyped definitions as colour markers", () => {
    const cross = { name: "Cross/Grey", type: "single-colour", colour: "rgb(159,159,159)" };
    const untyped = { name: "Configuration", input: "Configuration", ramp: "config.csv" };
    expect(findMarkerDefinition([cross], "Cross/Grey", "colour")).toBe(cross);
    expect(findMarkerDefinition([untyped], "Configuration", "colour")).toBe(untyped);
  });

  it("never returns a size definition for a colour marker, or a colour one for a size marker", () => {
    expect(findMarkerDefinition([EVENT_ML_SIZE], "Event ML", "colour")).toBeNull();
    expect(findMarkerDefinition([EVENT_ML_COLOUR], "Event ML", "size")).toBeNull();
  });

  it("falls back to an untyped definition for a size marker", () => {
    const untyped = { name: "Old size", input: "ML", minimum: -2, maximum: 2 };
    expect(findMarkerDefinition([untyped], "Old size", "size")).toBe(untyped);
  });

  it("returns null for a missing name or no definitions", () => {
    expect(findMarkerDefinition([EVENT_ML_COLOUR], null, "colour")).toBeNull();
    expect(findMarkerDefinition([EVENT_ML_COLOUR], "", "colour")).toBeNull();
    expect(findMarkerDefinition(undefined, "Event ML", "colour")).toBeNull();
    expect(findMarkerDefinition([null, EVENT_ML_COLOUR], "Nope", "colour")).toBeNull();
  });
});

describe("checkMarkers with a shared colour/size name", () => {
  function eventsZip() {
    const zip = new JSZip();
    zip.file("marker-defs/stra-events/markers.json", JSON.stringify([EVENT_ML_COLOUR, EVENT_ML_SIZE]));
    zip.file("marker-defs/stra-events/magnitude.csv", `${RAMP_HEADER}\n,,0,1,1,0.667,1,1,linear,,0,HSV,HSV,HSV,0`);
    return zip;
  }
  const series = { type: "points", colourMarker: "Event ML", sizeMarker: "Event ML", markerMenu: "stra-events/markers", sizeMinimum: 10, sizeMaximum: 25, nullSizes: 4 };

  it("checks each definition once and finds nothing wrong", async () => {
    const rows = [{ ML: -1.5 }, { ML: 0.4 }];
    expect(await checkMarkers(eventsZip(), series, rows, "Events", "")).toEqual([]);
  });

  it("reports a missing input column once, not once per marker", async () => {
    const rows = [{ Magnitude: -1.5 }];
    expect(await checkMarkers(eventsZip(), series, rows, "Events", "")).toEqual([
      'Events: marker "Event ML" input column "ML" is missing.',
    ]);
  });
});
