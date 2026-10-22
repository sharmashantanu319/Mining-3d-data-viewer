import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildColourLegend, formatDateWithPattern, formatLegendValue } from "../colourLegend";
import { pickLegendSeriesIndices } from "../markerSelection";
import { buildAnnotation, CALLOUT_LEAD_X, CALLOUT_LEAD_Y } from "../annotationsBuilder";
import { parseExportFile } from "../parseExportFile";

const at = (iso) => Date.parse(iso);

describe("formatDateWithPattern (mXrap / Qt date format letters, in UTC)", () => {
  it("formats the sample export's legend formats", () => {
    expect(formatDateWithPattern(at("2023-05-20T17:34:52.780Z"), "yyyy-MM-dd")).toBe("2023-05-20");
    expect(formatDateWithPattern(at("2023-05-20T17:34:52.780Z"), "yyyy-MM-dd\n hh:mm ap")).toBe("2023-05-20\n 05:34 pm");
  });

  it("uses a 12-hour clock only when the format has AM/PM", () => {
    expect(formatDateWithPattern(at("2023-05-01T00:05:09.007Z"), "h:mm AP")).toBe("12:05 AM");
    expect(formatDateWithPattern(at("2023-05-01T12:05:09.007Z"), "h:mm a")).toBe("12:05 pm");
    expect(formatDateWithPattern(at("2023-05-01T17:05:09.007Z"), "hh:mm")).toBe("17:05");
    expect(formatDateWithPattern(at("2023-05-01T17:05:09.007Z"), "H:m:s.zzz")).toBe("17:5:9.007");
  });

  it("writes month and day names, two-digit years and quoted text", () => {
    expect(formatDateWithPattern(at("2023-05-01T08:00:00Z"), "dddd d MMMM yy")).toBe("Monday 1 May 23");
    expect(formatDateWithPattern(at("2023-05-01T08:00:00Z"), "ddd dd MMM yyyy 'at' HH t")).toBe("Mon 01 May 2023 at 08 UTC");
    expect(formatDateWithPattern(at("2023-05-01T08:00:00Z"), "''yy''")).toBe("'23'");
  });

  it("shows a dash for an invalid date", () => {
    expect(formatDateWithPattern(NaN, "yyyy")).toBe("—");
  });
});

describe("formatLegendValue", () => {
  it("uses the legend's date format when the export gives one", () => {
    const marker = { inputType: "date", legend: { dateFormat: "yyyy-MM-dd" } };
    expect(formatLegendValue(at("2023-05-31T23:45:16.650Z"), marker)).toBe("2023-05-31");
  });

  it("keeps the previous date style when the export gives no format", () => {
    const expected = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
      .format(new Date(at("2023-05-31T23:45:16.650Z")));
    expect(formatLegendValue(at("2023-05-31T23:45:16.650Z"), { inputType: "date", legend: {} })).toBe(expected);
    expect(formatLegendValue(at("2023-05-31T23:45:16.650Z"), { inputType: "date", legend: { dateFormat: "  " } })).toBe(expected);
  });

  it("shows numberDisplay \"exponential\" with numberOfDecimals fraction digits", () => {
    const marker = { inputType: "number", legend: { numberFormat: { mode: "exponential", decimals: 2 } } };
    expect(formatLegendValue(123456, marker)).toBe("1.23e5");
    expect(formatLegendValue(0.000321, marker)).toBe("3.21e-4");
    expect(formatLegendValue(-5, marker)).toBe("-5.00e0");
  });
});

describe("the sample export's Event Date legend", () => {
  let events;

  beforeAll(async () => {
    const buffer = readFileSync(new URL("../../../test-data/visualiser-export-2.zip", import.meta.url));
    const parsed = await parseExportFile(Object.assign(new Uint8Array(buffer), { name: "visualiser-export-2.zip", size: buffer.length }));
    events = parsed.scenes[0].pointClouds.find((series) => series.name === "Events");
  });

  it("labels its ends and middle in the export's two-line format", () => {
    // Event dates run from 2023-05-01 00:31:38.892 to 2023-05-31 23:45:16.650
    // (UTC); the middle tick is halfway, 2023-05-16 12:08:27.771.
    const legend = buildColourLegend({ ...events, colourMarker: "Event Date" });
    expect(legend.kind).toBe("ramp");
    expect(legend.ticks.map((tick) => tick.label)).toEqual([
      "2023-05-01\n 12:31 am",
      "2023-05-16\n 12:08 pm",
      "2023-05-31\n 11:45 pm",
    ]);
  });
});

describe("pickLegendSeriesIndices with the user's Show legend choices", () => {
  it("turns off a legend the export asks for", () => {
    expect(pickLegendSeriesIndices([{ legend: true }, { legend: true }], 0, { 1: false })).toEqual([0]);
  });

  it("adds a legend for a series the export leaves without one", () => {
    expect(pickLegendSeriesIndices([{ legend: true }, { legend: false }, { legend: false }], 0, { 2: true })).toEqual([0, 2]);
  });

  it("can turn off the Marker Style series' default legend", () => {
    expect(pickLegendSeriesIndices([{ legend: false }, { legend: false }], 1, { 1: false })).toEqual([]);
  });

  it("ignores choices that are not true or false", () => {
    expect(pickLegendSeriesIndices([{ legend: false }, { legend: false }], 1, { 0: "yes", 1: null })).toEqual([1]);
  });
});

describe("buildAnnotation callouts", () => {
  // A canvas stand-in: text measures 100 px wide, and drawing calls are kept.
  function stubCanvas() {
    const calls = [];
    const canvases = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const ctx = new Proxy(
          { calls },
          {
            get(target, key) {
              if (key === "measureText") return () => ({ width: 100 });
              if (key in target) return target[key];
              return (...args) => calls.push([key, ...args]);
            },
            set(target, key, value) {
              calls.push([`set ${String(key)}`, value]);
              target[key] = value;
              return true;
            },
          }
        );
        const canvas = { width: 0, height: 0, getContext: () => ctx };
        canvases.push(canvas);
        return canvas;
      },
    });
    return { calls, canvases };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("anchors the label's arrow tip on the location and keeps the text the same size", () => {
    const { calls } = stubCanvas();
    const annotation = { text: "Area of <b>interest</b>", x: 1, y: 2, z: 3, color: "rgb(255,0,0)", faceCamera: true, render2d: false, callout: true };
    const callout = buildAnnotation(annotation);
    const label = buildAnnotation({ ...annotation, callout: false });

    // Label canvas: 100 px of text + 4 px outline padding each side = 108 x 40.
    const width = 108 + CALLOUT_LEAD_X;
    const height = 40 + CALLOUT_LEAD_Y;
    expect(callout.center.x).toBeCloseTo(4 / width, 12);
    expect(callout.center.y).toBeCloseTo(4 / height, 12);
    expect([label.center.x, label.center.y]).toEqual([0.5, 0.5]);
    expect(callout.position.toArray()).toEqual([1, 2, 3]);
    // Drawn on top of the scene; plain labels still sit in it.
    expect(callout.material.depthTest).toBe(false);
    expect(label.material.depthTest).toBe(true);

    // The text is 10 units tall in both: the callout sprite is taller by its arrow.
    expect(callout.scale.y * (40 / height)).toBeCloseTo(10, 12);
    expect(callout.scale.x / callout.scale.y).toBeCloseTo(width / height, 12);
    expect(callout.userData.heightRatio).toBeCloseTo(height / 40, 12);
    expect(label.scale.toArray()).toEqual([27, 10, 1]);

    // The arrow runs from the label's lower-left corner to the tip, in the annotation's colour.
    expect(calls).toContainEqual(["moveTo", CALLOUT_LEAD_X + 2, 38]);
    expect(calls).toContainEqual(["lineTo", 4, height - 4]);
    expect(calls).toContainEqual(["set strokeStyle", "rgb(255,0,0)"]);
  });

  it("draws text series labels without an arrow", () => {
    const { calls } = stubCanvas();
    const sprite = buildAnnotation({ text: "M2.1", x: 0, y: 0, z: 0, faceCamera: true });
    expect([sprite.center.x, sprite.center.y]).toEqual([0.5, 0.5]);
    expect(sprite.userData.heightRatio).toBe(1);
    expect(calls.some(([name]) => name === "lineTo")).toBe(false);
  });
});
