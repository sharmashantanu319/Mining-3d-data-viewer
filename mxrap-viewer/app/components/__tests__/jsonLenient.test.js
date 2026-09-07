import { describe, it, expect } from "vitest";
import { parseJsonLenient } from "../jsonLenient";

describe("parseJsonLenient", () => {
  it("parses valid JSON without recovery", () => {
    const r = parseJsonLenient('{"a": 1, "b": [2, 3]}');
    expect(r).toEqual({ value: { a: 1, b: [2, 3] }, recovered: false });
  });

  it("recovers a trailing comma before }", () => {
    const r = parseJsonLenient('[{"a":1,}]');
    expect(r.recovered).toBe(true);
    expect(r.value).toEqual([{ a: 1 }]);
  });

  it("recovers nested trailing commas before ] and }", () => {
    const r = parseJsonLenient('{"a":1,"b":[1,2,],}');
    expect(r.recovered).toBe(true);
    expect(r.value).toEqual({ a: 1, b: [1, 2] });
  });

  it("does not touch a comma inside a string literal", () => {
    const r = parseJsonLenient('{"s":"x,}"}');
    expect(r).toEqual({ value: { s: "x,}" }, recovered: false });
  });

  it("handles an escaped quote inside a string", () => {
    const r = parseJsonLenient('{"s":"x\\",}y"}');
    expect(r.value).toEqual({ s: 'x",}y' });
  });

  it("recovers a trailing comma with whitespace/newlines before the bracket", () => {
    const r = parseJsonLenient('{\n  "a": 1,\n}\n');
    expect(r.recovered).toBe(true);
    expect(r.value).toEqual({ a: 1 });
  });

  it("still throws on genuinely broken JSON (missing brace)", () => {
    expect(() => parseJsonLenient('{"a":1')).toThrow(SyntaxError);
  });

  it("still throws on a leading comma (not a trailing comma)", () => {
    expect(() => parseJsonLenient("{,}")).toThrow(SyntaxError);
  });

  it("recovers the real-world sensors marker shape (trailing comma after last object)", () => {
    const text = `[
      { "name": "Configuration", "categories": [
        { "value": 1, "description": "Uniaxial" },
        { "value": 3, "description": "Triaxial", }
      ] }
    ]`;
    const r = parseJsonLenient(text);
    expect(r.recovered).toBe(true);
    expect(r.value[0].categories).toHaveLength(2);
  });
});
