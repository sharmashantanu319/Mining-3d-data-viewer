import { describe, expect, it } from "vitest";
import { chartTextToPlain, parseChartText } from "../chartText";

describe("parseChartText", () => {
  it("splits lines on <br> in any form", () => {
    expect(chartTextToPlain("A<br>B<br />C<BR/>D")).toBe("A\nB\nC\nD");
  });

  it("applies allow-listed formatting to the runs inside", () => {
    const [line] = parseChartText("M<sub>L</sub> <strong>bold</strong>");
    expect(line.map((r) => [r.text, r.sub, r.bold])).toEqual([
      ["M", false, false],
      ["L", true, false],
      [" ", false, false],
      ["bold", false, true],
    ]);
  });

  it("treats a span with an underline text-decoration as underlined", () => {
    const [line] = parseChartText("<span style='text-decoration: underline;'><strong>Num</strong></span> x");
    expect(line[0]).toMatchObject({ text: "Num", underline: true, bold: true });
    expect(line[1]).toMatchObject({ text: " x", underline: false, bold: false });
  });

  it("drops scripts, event handlers and unknown tags, keeping only text", () => {
    const hostile = '<img src=x onerror="alert(1)">hi<script>alert(2)</script><a href="javascript:x" onclick="y">link</a>';
    const lines = parseChartText(hostile);
    const text = chartTextToPlain(hostile);
    expect(text).toBe("hialert(2)link");
    for (const run of lines.flat()) expect(run.text).not.toMatch(/[<>]/);
  });

  it("decodes entities as text, never as markup", () => {
    expect(chartTextToPlain("a &lt;b&gt; &amp; c")).toBe("a <b> & c");
  });

  it("copes with non-strings and stray angle brackets", () => {
    expect(chartTextToPlain(undefined)).toBe("");
    expect(chartTextToPlain("1 < 2")).toBe("1 < 2");
  });
});
