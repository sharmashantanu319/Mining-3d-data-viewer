import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSession, saveSession, sessionKeyFor } from "../viewerSession";

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
