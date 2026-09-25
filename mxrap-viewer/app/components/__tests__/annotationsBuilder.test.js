import { describe, it, expect } from "vitest";
import { resolveLabelFont, resolveLabelStyle, DEFAULT_TEXT_COLOR, BARE_TEXT_COLOR } from "../annotationsBuilder";

describe("resolveLabelFont", () => {
  it("keeps the annotation's own weight/size and swaps only the family", () => {
    const annotation = { font: "700 32px Georgia, serif" };
    expect(resolveLabelFont(annotation, "Courier New, monospace")).toBe("700 32px Courier New, monospace");
  });

  it("falls back to the default weight/size/family when the annotation has none", () => {
    expect(resolveLabelFont({}, undefined)).toBe("600 24px Inter, system-ui, Arial, sans-serif");
  });

  it("keeps the annotation's own family when there is no override", () => {
    expect(resolveLabelFont({ font: "700 32px Georgia, serif" }, undefined)).toBe("700 32px Georgia, serif");
  });
});

describe("resolveLabelStyle", () => {
  it("uses the export's own background/text colours when there is no style override", () => {
    const annotation = { color: "#ff0000", background: "#0000ff" };
    const style = resolveLabelStyle(annotation, {});
    expect(style.hasBackground).toBe(true);
    expect(style.backgroundColor).toBe("#0000ff");
    expect(style.textColor).toBe("#ff0000");
  });

  it("has no background and a bare-text default colour when the export sets none", () => {
    const style = resolveLabelStyle({}, {});
    expect(style.hasBackground).toBe(false);
    expect(style.backgroundColor).toBeNull();
    expect(style.textColor).toBe(BARE_TEXT_COLOR);
  });

  it("defaults to a dark text colour once a background exists", () => {
    const style = resolveLabelStyle({ background: "#123456" }, {});
    expect(style.textColor).toBe(DEFAULT_TEXT_COLOR);
  });

  it("a cleared (empty string) background override means no background, distinct from unset", () => {
    const annotation = { background: "#0000ff" };
    expect(resolveLabelStyle(annotation, { backgroundColor: "" }).hasBackground).toBe(false);
    expect(resolveLabelStyle(annotation, {}).hasBackground).toBe(true);
  });

  it("style overrides take precedence over the annotation's own colours", () => {
    const annotation = { color: "#ff0000", background: "#0000ff" };
    const style = resolveLabelStyle(annotation, { textColor: "#00ff00", backgroundColor: "#111111" });
    expect(style.textColor).toBe("#00ff00");
    expect(style.backgroundColor).toBe("#111111");
  });
});
