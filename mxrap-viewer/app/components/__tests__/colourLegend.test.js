import { describe, expect, it } from "vitest";
import { buildColourLegend, buildSceneColourLegends, formatLegendValue } from "../colourLegend";
import { rampCsv, rampRow } from "./fixtures/ramps";

function series(overrides = {}) {
  return {
    name: "Events",
    colourMarker: "Magnitude",
    showNullColours: true,
    legend: true,
    points: [{ ML: -2 }, { ML: 0 }, { ML: 2 }],
    markerDefinitions: [
      {
        name: "Magnitude",
        input: "ML",
        inputType: "number",
        minimum: -2,
        maximum: 2,
        nullColour: [0.5, 0.5, 0.5],
        legend: { title: "Magnitude [ML]", numberOfDecimals: 1 },
        rampCsv: rampCsv([
          rampRow({
            upTo: "",
            start: [1, 0, 0],
            end: [0, 0, 1],
            space: "RGB",
            startSpace: "RGB",
            endSpace: "RGB",
          }),
        ]),
      },
    ],
    ...overrides,
  };
}

describe("buildColourLegend", () => {
  it("builds a sampled ramp from the exact normalized marker used by rendering", () => {
    const legend = buildColourLegend(series(), 5);
    expect(legend.kind).toBe("ramp");
    expect(legend.title).toBe("Magnitude");
    expect(legend.units).toBe("ML");
    expect(legend.input).toBe("ML");
    expect(legend.samples).toHaveLength(5);
    expect(legend.samples[0].colour).not.toBe(legend.samples[4].colour);
    expect(legend.ticks.map((tick) => tick.value)).toEqual([-2, 0, 2]);
  });

  it("includes the configured null colour and visibility state", () => {
    const visible = buildColourLegend(series());
    const hidden = buildColourLegend(series({ showNullColours: false }));
    expect(visible.nullEntry.colour).toBe("rgba(128, 128, 128, 1)");
    expect(visible.nullEntry.visible).toBe(true);
    expect(hidden.nullEntry.visible).toBe(false);
  });

  it("returns an error model instead of throwing for an invalid ramp", () => {
    const invalid = series({
      markerDefinitions: [
        { name: "Magnitude", input: "ML", rampCsv: "bad,csv\n1,2" },
      ],
    });
    const legend = buildColourLegend(invalid);
    expect(legend.kind).toBe("error");
    expect(legend.valid).toBe(false);
    expect(legend.errors.length).toBeGreaterThan(0);
  });

  it("formats date legends in UTC", () => {
    const marker = { inputType: "date", legend: {} };
    expect(formatLegendValue(Date.UTC(2023, 4, 2), marker)).toMatch(/2023/);
  });

  it("only builds legends for series whose legend flag is enabled", () => {
    const legends = buildSceneColourLegends([series(), series({ legend: false })]);
    expect(legends).toHaveLength(1);
  });

  it("updates a data-derived legend range when the visible points change", () => {
    const withoutConfiguredRange = series({
      markerDefinitions: [
        {
          ...series().markerDefinitions[0],
          minimum: undefined,
          maximum: undefined,
        },
      ],
    });
    const full = buildColourLegend(withoutConfiguredRange);
    const filtered = buildColourLegend({
      ...withoutConfiguredRange,
      points: [{ ML: 0 }, { ML: 2 }],
    });
    expect(full.ticks[0].value).toBe(-2);
    expect(filtered.ticks[0].value).toBe(0);
    expect(filtered.ticks[2].value).toBe(2);
  });

  it("builds labelled swatches for a categorical legend", () => {
    const categorical = series({
      markerDefinitions: [
        {
          ...series().markerDefinitions[0],
          legend: {
            title: "Sensor type",
            categories: [
              { value: -2, description: "Uniaxial" },
              { value: 2, description: "Triaxial" },
            ],
          },
        },
      ],
    });
    const legend = buildColourLegend(categorical);
    expect(legend.kind).toBe("categorical");
    expect(legend.categories.map((category) => category.label)).toEqual([
      "Uniaxial",
      "Triaxial",
    ]);
    expect(legend.categories[0].colour).not.toBe(legend.categories[1].colour);
  });
});
