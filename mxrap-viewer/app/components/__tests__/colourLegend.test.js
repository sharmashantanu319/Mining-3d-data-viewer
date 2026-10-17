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

  it("does not repeat a tick label when there are no decimals to tell them apart", () => {
    // The customer's "Trigger" legend: no fixed range, no decimals.
    const trigger = (values) => series({
      points: values.map((value) => ({ ML: value })),
      markerDefinitions: [{
        ...series().markerDefinitions[0],
        minimum: null,
        maximum: null,
        legend: { title: "Trigger", numberDisplay: "fixedDecimal", numberOfDecimals: 0 },
      }],
    });
    expect(buildColourLegend(trigger([1, 2])).ticks.map(({ position, label }) => [position, label])).toEqual([[0, "1"], [1, "2"]]);
    expect(buildColourLegend(trigger([1, 1])).ticks.map(({ position, label }) => [position, label])).toEqual([[0.5, "1"]]);
    expect(buildColourLegend(trigger([0, 4])).ticks.map(({ label }) => label)).toEqual(["0", "2", "4"]);
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

  it("reports the full dataset's range when a data-derived domain has been narrowed by filtering", () => {
    const withoutConfiguredRange = series({
      markerDefinitions: [
        { ...series().markerDefinitions[0], minimum: undefined, maximum: undefined },
      ],
    });
    const filteredSeries = { ...withoutConfiguredRange, points: [{ ML: 0 }, { ML: 1 }] };
    const legend = buildColourLegend(filteredSeries, undefined, withoutConfiguredRange);
    expect(legend.fullRange).toEqual({ min: -2, max: 2, minLabel: "-2", maxLabel: "2" });
  });

  it("omits the full range when the domain is explicitly configured, even if filtered", () => {
    const filteredSeries = { ...series(), points: [{ ML: 0 }, { ML: 1 }] };
    const legend = buildColourLegend(filteredSeries, undefined, series());
    expect(legend.fullRange).toBeNull();
  });

  it("omits the full range when the visible range hasn't actually been narrowed", () => {
    const legend = buildColourLegend(series(), undefined, series());
    expect(legend.fullRange).toBeNull();
  });

  it("reports a narrowed full range on just the data-derived end of a mixed domain (max configured)", () => {
    const mixedMaxConfigured = series({
      markerDefinitions: [
        { ...series().markerDefinitions[0], minimum: undefined, maximum: 2 },
      ],
    });
    const filtered = { ...mixedMaxConfigured, points: [{ ML: -1 }, { ML: 2 }] };
    const legend = buildColourLegend(filtered, undefined, mixedMaxConfigured);
    // The min end is data-derived and has narrowed (-2 -> -1); the max end
    // is configured and can never differ, so it stays 2 on both sides.
    expect(legend.fullRange).toEqual({ min: -2, max: 2, minLabel: "-2", maxLabel: "2" });
  });

  it("reports a narrowed full range on just the data-derived end of a mixed domain (min configured)", () => {
    const mixedMinConfigured = series({
      markerDefinitions: [
        { ...series().markerDefinitions[0], minimum: -2, maximum: undefined },
      ],
    });
    const filtered = { ...mixedMinConfigured, points: [{ ML: -2 }, { ML: 1 }] };
    const legend = buildColourLegend(filtered, undefined, mixedMinConfigured);
    // The max end is data-derived and has narrowed (2 -> 1); the min end is
    // configured and stays -2 on both sides.
    expect(legend.fullRange).toEqual({ min: -2, max: 2, minLabel: "-2", maxLabel: "2" });
  });

  it("falls back to the full series when the visible set is empty but the full series is valid", () => {
    const withoutConfiguredRange = series({
      markerDefinitions: [
        { ...series().markerDefinitions[0], minimum: undefined, maximum: undefined },
      ],
    });
    const hidden = { ...withoutConfiguredRange, points: [] };
    const legend = buildColourLegend(hidden, undefined, withoutConfiguredRange);
    expect(legend.kind).not.toBe("error");
    expect(legend.valid).toBe(true);
    expect(legend.noVisiblePoints).toBe(true);
    expect(legend.ticks.map((tick) => tick.value)).toEqual([-2, 0, 2]);
  });

  it("still reports an error when the visible set is empty and the full series is also invalid", () => {
    const invalidFull = series({
      markerDefinitions: [
        { name: "Magnitude", input: "ML", rampCsv: "bad,csv\n1,2" },
      ],
      points: [],
    });
    const legend = buildColourLegend(invalidFull, undefined, invalidFull);
    expect(legend.kind).toBe("error");
  });

  it("does not fall back when the visible set is non-empty, even if narrower than the full one", () => {
    const withoutConfiguredRange = series({
      markerDefinitions: [
        { ...series().markerDefinitions[0], minimum: undefined, maximum: undefined },
      ],
    });
    const narrowed = { ...withoutConfiguredRange, points: [{ ML: 0 }] };
    const legend = buildColourLegend(narrowed, undefined, withoutConfiguredRange);
    expect(legend.noVisiblePoints).toBe(false);
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

  it("ignores the full-range argument for a categorical legend", () => {
    const categoricalDef = {
      ...series().markerDefinitions[0],
      legend: {
        title: "Sensor type",
        categories: [
          { value: -2, description: "Uniaxial" },
          { value: 2, description: "Triaxial" },
        ],
      },
    };
    const categorical = series({ markerDefinitions: [categoricalDef] });
    const narrowed = { ...categorical, points: [{ ML: -2 }] };
    const legend = buildColourLegend(narrowed, undefined, categorical);
    expect(legend.kind).toBe("categorical");
    expect(legend.fullRange).toBeUndefined();
  });

  it("labels ticks as dates for a date-scaled marker", () => {
    const dateSeries = series({
      points: [
        { ML: Date.UTC(2023, 0, 1) },
        { ML: Date.UTC(2023, 5, 1) },
        { ML: Date.UTC(2023, 11, 31) },
      ],
      markerDefinitions: [
        {
          ...series().markerDefinitions[0],
          inputType: "date",
          scale: "date",
          minimum: Date.UTC(2023, 0, 1),
          maximum: Date.UTC(2023, 11, 31),
        },
      ],
    });
    const legend = buildColourLegend(dateSeries);
    expect(legend.ticks[0].label).toMatch(/2023/);
    expect(legend.ticks[0].label).not.toBe("—");
  });

  it("resolves a logarithmic marker's domain and full range in log space", () => {
    const logDef = {
      ...series().markerDefinitions[0],
      scale: "logarithmic",
      minimum: undefined,
      maximum: undefined,
    };
    const full = series({
      points: [{ ML: 1e5 }, { ML: 1e13 }],
      markerDefinitions: [logDef],
    });
    const narrowed = { ...full, points: [{ ML: 1e8 }, { ML: 1e10 }] };
    const legend = buildColourLegend(narrowed, undefined, full);
    expect(legend.ticks.map((tick) => tick.value)).toEqual([1e8, 1e9, 1e10]);
    expect(legend.fullRange.min).toBe(1e5);
    expect(legend.fullRange.max).toBe(1e13);
  });
});

describe("single-colour marker legend", () => {
  const series = {
    name: "Selected Triggers",
    colourMarker: "Cross/Grey",
    points: [{ x: 0, y: 0, z: 0 }],
    markerDefinitions: [{ name: "Cross/Grey", type: "single-colour", colour: "rgb(159,159,159)", symbol: "cross2.png" }],
  };

  it("shows one swatch instead of a colour-configuration error", () => {
    const legend = buildColourLegend(series);
    expect(legend.kind).toBe("categorical");
    expect(legend.valid).toBe(true);
    expect(legend.title).toBe("Cross/Grey");
    expect(legend.input).toBeNull();
    expect(legend.nullEntry).toBeNull();
    expect(legend.categories).toEqual([{ value: null, label: "All points", colour: "rgba(159, 159, 159, 1)" }]);
    expect(legend.symbolLabel).toBe("cross2.png");
  });

  it("reports an unreadable single colour as an error legend", () => {
    const broken = { ...series, markerDefinitions: [{ ...series.markerDefinitions[0], colour: "grey" }] };
    expect(buildColourLegend(broken).kind).toBe("error");
  });
});

describe("legend number display", () => {
  const exp = (sigDigits) => ({ inputType: "number", legend: { numberFormat: { mode: "automaticExponential", sigDigits } } });

  it("uses e-notation for very small and very large values under automaticExponential", () => {
    expect(formatLegendValue(3.1086244689504383e-15, exp(2))).toBe("3.1e-15");
    expect(formatLegendValue(3.4e-8, exp(2))).toBe("3.4e-8");
    expect(formatLegendValue(1e13, exp(2))).toBe("1.0e13");
    expect(formatLegendValue(-0.00012345, exp(3))).toBe("-1.23e-4");
  });

  it("keeps ordinary magnitudes as plain numbers under automaticExponential", () => {
    expect(formatLegendValue(0.37630996500485625, exp(2))).toBe("0.38");
    expect(formatLegendValue(0, exp(2))).toBe("0");
    expect(formatLegendValue(12345, exp(6))).toBe(new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(12345));
  });

  it("keeps the whole name when the bracket is part of it", () => {
    const legend = buildColourLegend(series({
      markerDefinitions: [{ ...series().markerDefinitions[0], legend: { title: "P[ML within R]" } }],
    }));
    expect(legend.title).toBe("P[ML within R]");
    expect(legend.units).toBeNull();
  });
});
