import { describe, it, expect } from "vitest";
import {
  ANNOTATION_FONT_CHOICES,
  contrastRatio,
  isHexColour,
  pickReadableTextColour,
  toHexColour,
} from "../annotationStyleOptions";

describe("ANNOTATION_FONT_CHOICES", () => {
  it("offers family lists only, never a full size/weight shorthand", () => {
    for (const { value } of ANNOTATION_FONT_CHOICES) {
      expect(value).not.toMatch(/\d+px/);
    }
  });

  it("has an empty default option", () => {
    expect(ANNOTATION_FONT_CHOICES[0].value).toBe("");
  });
});

describe("isHexColour", () => {
  it("accepts only #rrggbb", () => {
    expect(isHexColour("#a1B2c3")).toBe(true);
    expect(isHexColour("#abc")).toBe(false);
    expect(isHexColour("rgb(0,0,255)")).toBe(false);
    expect(isHexColour(null)).toBe(false);
    expect(isHexColour(undefined)).toBe(false);
  });
});

describe("toHexColour", () => {
  it.each([
    ["#ff0000", "#ff0000"],
    ["#FF0000", "#ff0000"],
    ["#f00", "#ff0000"],
    ["#f008", "#ff0000"],
    ["#ff000080", "#ff0000"],
    ["rgb(0,0,255)", "#0000ff"],
    ["rgb(255, 128, 0)", "#ff8000"],
    ["rgba(0, 0, 255, 0.5)", "#0000ff"],
    ["rgb(0 0 255 / 50%)", "#0000ff"],
    ["rgb(100%, 0%, 0%)", "#ff0000"],
    ["rgb(300, -5, 0)", "#ff0000"],
    ["  RGB(1,2,3)  ", "#010203"],
  ])("normalises %s", (input, expected) => {
    expect(toHexColour(input)).toBe(expected);
  });

  it.each(["red", "hsl(0, 100%, 50%)", "rgb(1,2)", "rgb(a,b,c)", "", "#12", "#ggg", null, undefined, 42])(
    "returns null for %s",
    (input) => {
      expect(toHexColour(input)).toBeNull();
    }
  );
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(contrastRatio("#fedcba", "#123456"), 10);
  });
});

describe("pickReadableTextColour", () => {
  it("picks dark text for a light background when the current text is light", () => {
    expect(pickReadableTextColour("#ffffff", "#e7ecea")).toBe("#000000");
  });

  it("picks light text for a dark background when the current text is dark", () => {
    expect(pickReadableTextColour("#1f2a27", "#000000")).toBe("#e7ecea");
  });

  it("returns null when the current text colour already reads well", () => {
    expect(pickReadableTextColour("#1f2a27", "#e7ecea")).toBeNull();
    expect(pickReadableTextColour("#ffffff", "rgb(0,0,255)")).toBeNull();
  });

  it("seeds a colour when the current text colour can't be parsed", () => {
    expect(pickReadableTextColour("#ffffff", "red")).toBe("#000000");
    expect(pickReadableTextColour("#ffffff", undefined)).toBe("#000000");
  });

  it("returns null when the background can't be parsed", () => {
    expect(pickReadableTextColour("not-a-colour", "#000000")).toBeNull();
    expect(pickReadableTextColour(null, "#000000")).toBeNull();
  });
});
