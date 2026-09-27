import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSession, sanitizeAnnotationStyle, saveSession, sessionKeyFor } from "../viewerSession";
import { ANNOTATION_FONT_CHOICES } from "../annotationStyleOptions";

function memoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("sessionKeyFor", () => {
  it("keys by file name and size, not content", () => {
    expect(sessionKeyFor({ name: "export.zip", size: 1234 })).toBe(
      "mxrap-viewer-session:export.zip:1234"
    );
  });

  it("returns null for a missing file", () => {
    expect(sessionKeyFor(null)).toBeNull();
  });
});

describe("saveSession / loadSession", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    globalThis.localStorage = memoryLocalStorage();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  it("round-trips a session through localStorage", () => {
    const key = sessionKeyFor({ name: "export.zip", size: 1234 });
    saveSession(key, { sceneIndex: 1, projectionMode: "orthographic" });
    expect(loadSession(key)).toEqual({ sceneIndex: 1, projectionMode: "orthographic" });
  });

  it("round-trips the annotation style overrides", () => {
    const key = sessionKeyFor({ name: "export.zip", size: 1234 });
    const session = {
      annotationFont: "Georgia, 'Times New Roman', serif",
      annotationTextColor: "#ffffff",
      annotationBackgroundColor: null,
    };
    saveSession(key, session);
    expect(loadSession(key)).toEqual(session);
  });

  it("returns null when nothing has been saved for that key", () => {
    expect(loadSession(sessionKeyFor({ name: "other.zip", size: 1 }))).toBeNull();
  });

  it("returns null instead of throwing on corrupt stored JSON", () => {
    const key = sessionKeyFor({ name: "export.zip", size: 1234 });
    globalThis.localStorage.setItem(key, "{not json");
    expect(loadSession(key)).toBeNull();
  });

  it("fails silently instead of throwing when localStorage is unavailable", () => {
    globalThis.localStorage = undefined;
    const key = sessionKeyFor({ name: "export.zip", size: 1234 });
    expect(() => saveSession(key, { sceneIndex: 0 })).not.toThrow();
    expect(loadSession(key)).toBeNull();
  });
});

describe("sanitizeAnnotationStyle", () => {
  const georgia = ANNOTATION_FONT_CHOICES.find((choice) => choice.label.startsWith("Serif")).value;

  it("keeps valid values", () => {
    expect(
      sanitizeAnnotationStyle({
        annotationFont: georgia,
        annotationTextColor: "#ffffff",
        annotationBackgroundColor: "#1F2A27",
      })
    ).toEqual({ annotationFont: georgia, annotationTextColor: "#ffffff", annotationBackgroundColor: "#1F2A27" });
  });

  it("accepts null as 'no override' and maps the default font option to null", () => {
    expect(
      sanitizeAnnotationStyle({ annotationFont: "", annotationTextColor: null, annotationBackgroundColor: null })
    ).toEqual({ annotationFont: null, annotationTextColor: null, annotationBackgroundColor: null });
    expect(sanitizeAnnotationStyle({ annotationFont: null }).annotationFont).toBeNull();
  });

  it("drops a font that isn't one of the picker's choices", () => {
    expect(sanitizeAnnotationStyle({ annotationFont: "600 24px Papyrus" })).toEqual({});
  });

  it.each(["red", "rgb(0,0,255)", "#fff", "#12345g", 5, {}])("drops the invalid colour %s", (value) => {
    expect(sanitizeAnnotationStyle({ annotationTextColor: value, annotationBackgroundColor: value })).toEqual({});
  });

  it("ignores fields that are missing (e.g. a session saved before these settings existed)", () => {
    expect(sanitizeAnnotationStyle({ sceneIndex: 1 })).toEqual({});
  });

  it("returns nothing for a non-object session", () => {
    expect(sanitizeAnnotationStyle(null)).toEqual({});
    expect(sanitizeAnnotationStyle(undefined)).toEqual({});
    expect(sanitizeAnnotationStyle("x")).toEqual({});
  });
});
