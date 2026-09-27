import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import {
  resolveLabelFont,
  resolveLabelStyle,
  disposeAnnotations,
  DEFAULT_TEXT_COLOR,
  BARE_TEXT_COLOR,
} from "../annotationsBuilder";

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

  it.each([
    "italic bold 20px Arial",
    "20px Arial",
    "bold 20px/1.2 Arial",
    "Arial",
  ])("uses the export's own font verbatim when there is no override: %s", (font) => {
    expect(resolveLabelFont({ font }, undefined)).toBe(font);
    expect(resolveLabelFont({ font }, null)).toBe(font);
  });

  it.each([
    ["italic bold 20px Arial", "italic bold 20px Georgia, serif"],
    ["20px Arial", "20px Georgia, serif"],
    ["bold 20px/1.2 Arial", "bold 20px/1.2 Georgia, serif"],
    ["600 24.5px Inter, system-ui, sans-serif", "600 24.5px Georgia, serif"],
  ])("swaps only the family of %s", (font, expected) => {
    expect(resolveLabelFont({ font }, "Georgia, serif")).toBe(expected);
  });

  it("falls back to the default weight/size when the export's font has no size to keep", () => {
    expect(resolveLabelFont({ font: "Arial" }, "Georgia, serif")).toBe("600 24px Georgia, serif");
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

  it("keeps the export's own colours when the overrides are the app's default null state", () => {
    // ThreeScene passes { fontFamily: null, textColor: null, backgroundColor: null }
    // until the user changes something — null must mean "no override", not "no background".
    const annotation = { color: "#ff0000", background: "#ffffff", font: "700 32px Georgia, serif" };
    const style = resolveLabelStyle(annotation, { fontFamily: null, textColor: null, backgroundColor: null });
    expect(style.hasBackground).toBe(true);
    expect(style.backgroundColor).toBe("#ffffff");
    expect(style.textColor).toBe("#ff0000");
    expect(style.font).toBe("700 32px Georgia, serif");
  });

  it("stays without a background for a null override when the export has none", () => {
    const style = resolveLabelStyle({}, { backgroundColor: null });
    expect(style.hasBackground).toBe(false);
    expect(style.backgroundColor).toBeNull();
  });

  it("style overrides take precedence over the annotation's own colours", () => {
    const annotation = { color: "#ff0000", background: "#0000ff" };
    const style = resolveLabelStyle(annotation, { textColor: "#00ff00", backgroundColor: "#111111" });
    expect(style.textColor).toBe("#00ff00");
    expect(style.backgroundColor).toBe("#111111");
  });
});

describe("disposeAnnotations", () => {
  function makeEntry(kind) {
    const material = kind === "sprite" ? new THREE.SpriteMaterial() : new THREE.MeshBasicMaterial();
    const object = kind === "sprite" ? new THREE.Sprite(material) : new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    const spies = {
      material: vi.spyOn(material, "dispose"),
      geometry: vi.spyOn(object.geometry, "dispose"),
    };
    return { entry: { object }, spies };
  }

  it("removes every entry from the scene and disposes its material", () => {
    const scene = new THREE.Scene();
    const a = makeEntry("mesh");
    const b = makeEntry("sprite");
    scene.add(a.entry.object, b.entry.object);

    disposeAnnotations([a.entry, b.entry], scene);

    expect(scene.children).toHaveLength(0);
    expect(a.spies.material).toHaveBeenCalledTimes(1);
    expect(b.spies.material).toHaveBeenCalledTimes(1);
  });

  it("disposes a fixed-orientation label's own geometry but never a sprite's shared one", () => {
    const mesh = makeEntry("mesh");
    const sprite = makeEntry("sprite");

    disposeAnnotations([mesh.entry, sprite.entry]);

    expect(mesh.spies.geometry).toHaveBeenCalledTimes(1);
    expect(sprite.spies.geometry).not.toHaveBeenCalled();
  });

  it("tolerates a missing list and works without a scene", () => {
    expect(() => disposeAnnotations(undefined)).not.toThrow();
    expect(() => disposeAnnotations([makeEntry("mesh").entry])).not.toThrow();
  });
});
