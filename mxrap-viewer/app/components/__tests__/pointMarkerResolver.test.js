import { describe, it, expect } from "vitest";
import { resolveColourMarker, resolveMarkerRenderOptions } from "../pointMarkerResolver";
import { rampCsv, rampRow } from "./fixtures/ramps";

// A markers.json `type: "colour"` entry (see events/markers.json), with its
// ramp CSV text already attached as `rampCsv` by
// parseExportFile.js's loadMarkerDefinitions.
const ML_COLOUR_DEF = {
  name: "Mag/Spheres",
  type: "colour",
  input: "ML",
  inputType: "number",
  scale: "linear",
  minimum: -4,
  maximum: 4,
  nullColour: [0, 0, 0],
  // A single row with a blank "Up to" spans the whole domain (its lower
  // bound is the overall minimum, since there's no descending row below
  // it) — a plain start-to-end gradient across [-4, 4].
  rampCsv: rampCsv([rampRow({ upTo: "", start: [0, 1, 1], end: [0.667, 1, 1] })]),
};

const ML_SIZE_DEF = {
  name: "ML",
  type: "size",
  input: "ML",
  inputType: "number",
  scale: "linear",
  minimum: -2,
  maximum: 2,
};

const SERIES = {
  colourMarker: "Mag/Spheres",
  sizeMarker: null,
  sizeMinimum: 1,
  sizeMaximum: 25,
  nullSizes: 4,
  showNullColours: false,
  distanceAttenuation: "cartoon",
  markerDefinitions: [ML_COLOUR_DEF, ML_SIZE_DEF],
  points: [
    { x: 0, y: 0, z: 0, ML: -4 },
    { x: 1, y: 1, z: 1, ML: 0 },
    { x: 2, y: 2, z: 2, ML: 4 },
  ],
};

describe("resolveMarkerRenderOptions", () => {
  it("exposes the same normalized colour marker used by rendering", () => {
    const marker = resolveColourMarker(SERIES);
    expect(marker.valid).toBe(true);
    expect(marker.input).toBe("ML");
    expect(marker.legend.stops.length).toBeGreaterThan(1);
  });

  it("returns null when the series has no marker definitions (mock data)", () => {
    expect(resolveMarkerRenderOptions({ ...SERIES, markerDefinitions: [] })).toBeNull();
    expect(resolveMarkerRenderOptions({ ...SERIES, markerDefinitions: undefined })).toBeNull();
    expect(resolveMarkerRenderOptions(null)).toBeNull();
  });

  it("resolves a colorFn from the named colour marker definition", () => {
    const options = resolveMarkerRenderOptions(SERIES);
    expect(options.colorFn).toBeInstanceOf(Function);

    const atMin = options.colorFn(SERIES.points[0]);
    const atMax = options.colorFn(SERIES.points[2]);
    // start colour (H=0) vs end colour (H=0.667) at the domain endpoints.
    expect(atMin).not.toEqual(atMax);
    expect(Number.isFinite(atMin.r)).toBe(true);
    expect(Number.isFinite(atMin.g)).toBe(true);
    expect(Number.isFinite(atMin.b)).toBe(true);
  });

  it("resolves per-point symbols and their cached assets", () => {
    const symbolDefinition = {
      ...ML_COLOUR_DEF,
      rampCsv: rampCsv([
        rampRow({
          upTo: "",
          symbol: "event.png",
          start: [0, 1, 1],
          end: [0.667, 1, 1],
        }),
      ]),
      symbolAssets: { "event.png": "data:image/png;base64,abc" },
    };
    const options = resolveMarkerRenderOptions({
      ...SERIES,
      markerDefinitions: [symbolDefinition, ML_SIZE_DEF],
    });
    expect(options.symbolFn(SERIES.points[0])).toBe("event.png");
    expect(options.symbolAssets).toEqual({ "event.png": "data:image/png;base64,abc" });
  });

  it("omits colorFn when colourMarker names a definition that isn't there", () => {
    const options = resolveMarkerRenderOptions({ ...SERIES, colourMarker: "Nonexistent" });
    expect(options.colorFn).toBeUndefined();
  });

  it("draws unknown configurations as null-colour dots while retaining known symbols", () => {
    const definition = {
      ...ML_COLOUR_DEF,
      nullSymbol: "Sphere-Question.png",
      nullColour: [0, 0, 1],
      rampCsv: rampCsv([rampRow({ symbol: "Triaxial.png" })]),
    };
    const options = resolveMarkerRenderOptions({ ...SERIES, markerDefinitions: [definition] });
    expect(options.symbolFn({ ML: null })).toBeNull();
    expect(options.symbolFn({})).toBeNull();
    expect(options.colorFn({ ML: null })).toEqual({ r: 0, g: 0, b: 1 });
    expect(options.symbolFn({ ML: 1 })).toBe("Triaxial.png");
  });

  it("omits colorFn when colourMarker is null (no colour marker selected)", () => {
    const options = resolveMarkerRenderOptions({ ...SERIES, colourMarker: null });
    expect(options.colorFn).toBeUndefined();
  });

  it("no sizeMarker selected -> constant sizeFn at the sizeMinimum/sizeMaximum midpoint", () => {
    const options = resolveMarkerRenderOptions(SERIES);
    expect(options.sizeFn(SERIES.points[0])).toBeCloseTo(13); // (1 + 25) / 2
    expect(options.minPointSize).toBe(1);
    expect(options.maxPointSize).toBe(25);
  });

  it("with a sizeMarker selected, sizeFn maps the input to the size range", () => {
    const series = { ...SERIES, sizeMarker: "ML" };
    const options = resolveMarkerRenderOptions(series);
    expect(options.sizeFn({ ML: -2 })).toBeCloseTo(1);
    expect(options.sizeFn({ ML: 2 })).toBeCloseTo(25);
    expect(options.sizeFn({ ML: 0 })).toBeCloseTo(13);
  });

  it("derives the colour domain from the data when the definition has no minimum/maximum", () => {
    const series = {
      ...SERIES,
      markerDefinitions: [{ ...ML_COLOUR_DEF, minimum: undefined, maximum: undefined }],
    };
    const options = resolveMarkerRenderOptions(series);
    expect(options.colorFn).toBeInstanceOf(Function);
    // Domain falls back to the data's own ML range (-4..4), same as the
    // explicit-minimum/maximum case, so the endpoints still differ.
    expect(options.colorFn(series.points[0])).not.toEqual(options.colorFn(series.points[2]));
  });

  it("passes distanceAttenuation through from the series", () => {
    const options = resolveMarkerRenderOptions(SERIES);
    expect(options.distanceAttenuation).toBe("cartoon");
  });

  it("degrades safely when the ramp CSV is malformed: no colorFn, still returns sizeFn", () => {
    const series = {
      ...SERIES,
      markerDefinitions: [{ ...ML_COLOUR_DEF, rampCsv: "not,a,valid,ramp\n1,2,3,4" }],
    };
    const options = resolveMarkerRenderOptions(series);
    expect(options.colorFn).toBeUndefined();
    expect(options.sizeFn).toBeInstanceOf(Function);
    expect(Number.isFinite(options.sizeFn(series.points[0]))).toBe(true);
  });
});
