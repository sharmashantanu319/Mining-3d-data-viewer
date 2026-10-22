import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { symbolFileCandidates, isShadingSprite, parseRgbColour } from "../markerSymbols";
import { markerSymbolLabel, resolveMarkerRenderOptions } from "../pointMarkerResolver";
import { getMarkerChoices } from "../markerSelection";
import { parseExportFile } from "../parseExportFile";

const HEADER = "Up to,Symbol,Start Colour (H),Start Colour (S),Start Colour (V),End Colour (H),End Colour (S),End Colour (V),Colour Ramp,Number of Colours,Transparency [0..100],Colour Space,Start Colour Colour Space,End Colour Colour Space,End Transparency [0..100]";
const rampWith = (symbol) => `${HEADER}\n,${symbol},0,1,1,0.6666666666666666,1,1,linear,,0,HSV,HSV,HSV,0`;
const points = [{ ID: 1, X: 0, Y: 0, Z: 0, ML: -1 }, { ID: 2, X: 1, Y: 1, Z: 1, ML: 1 }];
const colourDef = (symbol) => ({ name: "Event ML", type: "colour", input: "ML", inputType: "number", minimum: -2, maximum: 2, nullColour: [0, 0, 0], rampCsv: rampWith(symbol) });
const crossGrey = { name: "Cross/Grey", type: "single-colour", colour: "rgb(159,159,159)", symbol: "cross2.png", symbolAssets: { "cross2.png": "data:image/png;base64,AA==" } };

describe("marker symbol helpers", () => {
  it("also looks up mXrap built-in images without the mximages/!/ prefix", () => {
    expect(symbolFileCandidates("mximages/!/master ball sprite 64x64.png"))
      .toEqual(["mximages/!/master ball sprite 64x64.png", "master ball sprite 64x64.png"]);
    expect(symbolFileCandidates("mximages/sphere_64x64.png"))
      .toEqual(["mximages/sphere_64x64.png", "sphere_64x64.png"]);
    expect(symbolFileCandidates("cross2.png")).toEqual(["cross2.png"]);
    expect(symbolFileCandidates(null)).toEqual([]);
  });

  it("treats only the grey sphere sprites as shading sprites", () => {
    expect(isShadingSprite("master ball sprite 64x64.png")).toBe(true);
    expect(isShadingSprite("mximages/!/master ball sprite 64x64.png")).toBe(true);
    expect(isShadingSprite("sphere_64x64.png")).toBe(true);
    expect(isShadingSprite("Triaxial.png")).toBe(false);
    expect(isShadingSprite("cross2-red.png")).toBe(false);
  });

  it("parses rgb() colours to exact 0..1 channels and rejects anything else", () => {
    expect(parseRgbColour("rgb(159,159,159)")).toEqual({ r: 159 / 255, g: 159 / 255, b: 159 / 255 });
    expect(parseRgbColour(" rgb( 255 , 0 , 51 ) ")).toEqual({ r: 1, g: 0, b: 51 / 255 });
    expect(parseRgbColour("rgb(300,0,0)")).toBeNull();
    expect(parseRgbColour("#9f9f9f")).toBeNull();
    expect(parseRgbColour(undefined)).toBeNull();
  });
});

describe("point render options", () => {
  it("draws a ramp whose symbols are all sphere sprites as coloured shaded spheres, whatever the series is called", () => {
    const options = resolveMarkerRenderOptions({ name: "Response Events", colourMarker: "Event ML", points, markerDefinitions: [colourDef("master ball sprite 64x64.png")] });
    expect(options.renderAsShadedSphere).toBe(true);
    expect(options.symbolFn).toBeUndefined();
    expect(options.colorFn(points[0])).not.toEqual(options.colorFn(points[1]));
  });

  it("keeps a coloured icon symbol as a texture with its own colours", () => {
    const options = resolveMarkerRenderOptions({ name: "Sensors", colourMarker: "Event ML", points, markerDefinitions: [colourDef("Triaxial.png")] });
    expect(options.renderAsShadedSphere).toBe(false);
    expect(options.symbolFn(points[0])).toBe("Triaxial.png");
    expect(options.tintSymbols).toBeUndefined();
  });

  it("paints a single-colour marker one exact colour with its tinted symbol", () => {
    const options = resolveMarkerRenderOptions({ name: "Selected Triggers", colourMarker: "Cross/Grey", sizeMarker: null, sizeMinimum: 19, sizeMaximum: 10, points, markerDefinitions: [crossGrey] });
    expect(options.colorFn(points[0])).toEqual({ r: 159 / 255, g: 159 / 255, b: 159 / 255 });
    expect(options.colorFn(points[1])).toEqual({ r: 159 / 255, g: 159 / 255, b: 159 / 255 });
    expect(options.symbolFn(points[0])).toBe("cross2.png");
    expect(options.symbolAssets).toEqual({ "cross2.png": "data:image/png;base64,AA==" });
    expect(options.tintSymbols).toBe(true);
    expect(options.renderAsShadedSphere).toBe(false);
    expect([options.minPointSize, options.maxPointSize]).toEqual([10, 19]);
  });

  it("names what the points are drawn as, for the legend and the Marker Style panel alike", () => {
    expect(markerSymbolLabel({ name: "Response Events", colourMarker: "Event ML", points, markerDefinitions: [colourDef("master ball sprite 64x64.png")] }))
      .toBe("Shaded sphere");
    expect(markerSymbolLabel({ name: "Sensors", colourMarker: "Event ML", points, markerDefinitions: [colourDef("Triaxial.png")] }))
      .toBe("Icon per value");
    expect(markerSymbolLabel({ name: "Events", colourMarker: "Event ML", points, markerDefinitions: [colourDef("")] }))
      .toBe("Dot");
    expect(markerSymbolLabel({ name: "Selected Triggers", colourMarker: "Cross/Grey", points, markerDefinitions: [crossGrey] }))
      .toBe("Icon (cross2.png)");
    expect(markerSymbolLabel({ name: "Selected Triggers", colourMarker: "Cross/Grey", points, markerDefinitions: [{ ...crossGrey, symbol: undefined }] }))
      .toBe("Dot");
    expect(markerSymbolLabel({ name: "Minodes", colourMarker: null, points, markerDefinitions: [] })).toBe("Dot");
  });

  it("offers a single-colour marker in the Colour by choices", () => {
    expect(getMarkerChoices({ markerDefinitions: [crossGrey, colourDef("sphere_64x64.png")] }).colour.map((choice) => choice.name))
      .toEqual(["Cross/Grey", "Event ML"]);
  });
});

describe("parser symbol loading", () => {
  it("loads single-colour symbols and mximages/!/ prefixed symbols from marker-images", async () => {
    const zip = new JSZip();
    zip.file("info.json", JSON.stringify({ slides: [{ displays: [{ folder: "view" }] }] }));
    zip.file("view/config.json", JSON.stringify({ type: "3dview", series: [
      { type: "points", name: "Triggers", data: "p", markerMenu: "m/markers", colourMarker: "Cross/Grey" },
    ] }));
    zip.file("data/p.csv", "ID,X,Y,Z,Trigger ID\n1,0,0,0,1");
    zip.file("marker-defs/m/markers.json", JSON.stringify([
      { name: "Cross/Grey", type: "single-colour", colour: "rgb(159,159,159)", symbol: "cross2.png" },
      { name: "Trigger", type: "colour", input: "Trigger ID", inputType: "number", ramp: "trigger.csv", nullColour: [0, 0, 1] },
    ]));
    zip.file("marker-defs/m/trigger.csv", rampWith("mximages/!/master ball sprite 64x64.png"));
    zip.file("marker-images/cross2.png", new Uint8Array([1, 2, 3]));
    zip.file("marker-images/master ball sprite 64x64.png", new Uint8Array([4, 5, 6]));
    const parsed = await parseExportFile(await zip.generateAsync({ type: "uint8array" }));
    const [single, trigger] = parsed.scenes[0].pointClouds[0].markerDefinitions;
    expect(single.symbolAssets).toEqual({ "cross2.png": "data:image/png;base64,AQID" });
    expect(trigger.symbolAssets).toEqual({ "mximages/!/master ball sprite 64x64.png": "data:image/png;base64,BAUG" });
  });
});
