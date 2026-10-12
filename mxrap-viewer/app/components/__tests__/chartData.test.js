import { describe, expect, it } from "vitest";
import {
  joinChartRows,
  filterChartRows,
  readAxisValue,
  buildChartSeriesColumns,
  orderChartColumns,
  groupChartColumns,
  computeAxisExtent,
  computeChartAxisRanges,
} from "../chartData";

describe("joinChartRows", () => {
  it("merges each additional row set onto the matching primary row by ID", () => {
    const primary = [{ ID: 1, DateTime: "t1" }, { ID: 2, DateTime: "t2" }];
    const additional = [{ ID: 2, AboveThreshold: 1 }, { ID: 1, AboveThreshold: 0 }];

    expect(joinChartRows(primary, [additional])).toEqual([
      { ID: 1, DateTime: "t1", AboveThreshold: 0 },
      { ID: 2, DateTime: "t2", AboveThreshold: 1 },
    ]);
  });

  it("merges multiple additional row sets in order", () => {
    const primary = [{ ID: 1 }];
    const setA = [{ ID: 1, a: "a" }];
    const setB = [{ ID: 1, b: "b" }];

    expect(joinChartRows(primary, [setA, setB])).toEqual([{ ID: 1, a: "a", b: "b" }]);
  });

  it("keeps a primary row unchanged when it has no match in an additional set", () => {
    const primary = [{ ID: 1, DateTime: "t1" }];
    expect(joinChartRows(primary, [[{ ID: 99, AboveThreshold: 1 }]])).toEqual([{ ID: 1, DateTime: "t1" }]);
  });

  it("returns the primary rows unchanged when there are no additional sets", () => {
    const primary = [{ ID: 1 }];
    expect(joinChartRows(primary, [])).toBe(primary);
  });
});

describe("filterChartRows", () => {
  const rows = [{ ID: 1, Above: 1 }, { ID: 2, Above: 0 }, { ID: 3, Above: "1" }];

  it("keeps only rows whose filter column reads as 1", () => {
    expect(filterChartRows(rows, "Above")).toEqual([{ ID: 1, Above: 1 }, { ID: 3, Above: "1" }]);
  });

  it("returns every row when there is no filter column", () => {
    expect(filterChartRows(rows, null)).toBe(rows);
  });
});

describe("readAxisValue", () => {
  it("reads a datetime column via parseCustomerDate", () => {
    expect(readAxisValue({ DateTime: "2023-05-01 00:31:38.892" }, "DateTime", "datetime")).toBe(Date.UTC(2023, 4, 1, 0, 31, 38, 892));
  });

  it("returns null for an unparseable datetime value", () => {
    expect(readAxisValue({ DateTime: "not a date" }, "DateTime", "datetime")).toBeNull();
  });

  it("reads a numeric/linear/log10 column, coercing numeric strings", () => {
    expect(readAxisValue({ ML: -1.5 }, "ML", "linear")).toBe(-1.5);
    expect(readAxisValue({ ML: "3.2" }, "ML", "log10")).toBe(3.2);
  });

  it("returns null for a missing or non-numeric value", () => {
    expect(readAxisValue({}, "ML", "linear")).toBeNull();
    expect(readAxisValue({ ML: "not a number" }, "ML", "linear")).toBeNull();
  });
});

describe("buildChartSeriesColumns", () => {
  const series = {
    axisX: { side: "bottom", column: "DateTime" },
    axisY: { side: "left", column: "ML" },
  };
  const axes = {
    bottom: { scale: "datetime" },
    left: { scale: "linear" },
  };

  it("extracts parallel x/y columns, converting the datetime axis", () => {
    const rows = [
      { DateTime: "2023-05-01 00:00:00", ML: -1.5 },
      { DateTime: "2023-05-02 00:00:00", ML: 0.5 },
    ];
    const columns = buildChartSeriesColumns(rows, series, axes);

    expect(columns.x).toEqual([Date.UTC(2023, 4, 1), Date.UTC(2023, 4, 2)]);
    expect(columns.y).toEqual([-1.5, 0.5]);
    expect(columns.rows).toEqual(rows);
  });

  it("drops a row whose x or y value doesn't resolve", () => {
    const rows = [
      { DateTime: "2023-05-01 00:00:00", ML: -1.5 },
      { DateTime: "not a date", ML: 0.5 },
      { DateTime: "2023-05-02 00:00:00", ML: "n/a" },
    ];
    const columns = buildChartSeriesColumns(rows, series, axes);

    expect(columns.x).toHaveLength(1);
    expect(columns.y).toEqual([-1.5]);
  });

  it("defaults an axis with no matching entry in `axes` to a linear scale", () => {
    const columns = buildChartSeriesColumns(
      [{ DateTime: 5, ML: 1 }],
      series,
      {},
    );
    expect(columns.x).toEqual([5]);
  });
});

describe("orderChartColumns", () => {
  it("orders ascending by x when no order column is given", () => {
    const columns = { x: [3, 1, 2], y: [30, 10, 20], rows: [{ id: "c" }, { id: "a" }, { id: "b" }] };
    const ordered = orderChartColumns(columns, null);

    expect(ordered.x).toEqual([1, 2, 3]);
    expect(ordered.y).toEqual([10, 20, 30]);
    expect(ordered.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("orders by the given column's values instead of x", () => {
    const columns = {
      x: [1, 2, 3],
      y: [10, 20, 30],
      rows: [{ DateTime: "2023-05-03" }, { DateTime: "2023-05-01" }, { DateTime: "2023-05-02" }],
    };
    const ordered = orderChartColumns(columns, "DateTime");

    expect(ordered.x).toEqual([2, 3, 1]);
  });

  it("does not mutate the input columns", () => {
    const columns = { x: [3, 1, 2], y: [30, 10, 20], rows: [{}, {}, {}] };
    orderChartColumns(columns, null);
    expect(columns.x).toEqual([3, 1, 2]);
  });
});

describe("groupChartColumns", () => {
  it("returns a single line with a null key when there is nothing to group by", () => {
    const columns = { x: [1, 2], y: [10, 20], rows: [{}, {}] };
    expect(groupChartColumns(columns, [])).toEqual([{ key: null, x: [1, 2], y: [10, 20], rows: columns.rows }]);
  });

  it("splits into one line per distinct combination of the group-by columns", () => {
    const rows = [
      { Material: "A", Type: "x" },
      { Material: "B", Type: "x" },
      { Material: "A", Type: "x" },
    ];
    const columns = { x: [1, 2, 3], y: [10, 20, 30], rows };
    const groups = groupChartColumns(columns, ["Material"]);

    expect(groups).toHaveLength(2);
    const groupA = groups.find((g) => g.key === "A");
    expect(groupA.x).toEqual([1, 3]);
    expect(groupA.y).toEqual([10, 30]);
  });
});

describe("computeAxisExtent", () => {
  it("returns the min/max across all given value arrays", () => {
    expect(computeAxisExtent([[3, 1], [5, -2]], "linear")).toEqual({ min: -2, max: 5 });
  });

  it("drops non-positive values for a log10 scale", () => {
    expect(computeAxisExtent([[0, -5, 2, 10]], "log10")).toEqual({ min: 2, max: 10 });
  });

  it("returns null when nothing finite/usable remains", () => {
    expect(computeAxisExtent([[]], "linear")).toBeNull();
    expect(computeAxisExtent([[0, -1]], "log10")).toBeNull();
  });
});

describe("computeChartAxisRanges", () => {
  const axes = {
    bottom: { enabled: true, scale: "datetime", minimum: null, maximum: null },
    left: { enabled: true, scale: "linear", minimum: null, maximum: null },
    right: { enabled: true, scale: "linear", minimum: 0, maximum: null },
    top: { enabled: false, scale: "linear", minimum: null, maximum: null },
  };
  const seriesList = [
    { axisX: { side: "bottom" }, axisY: { side: "left" }, points: { x: [1, 2, 3], y: [-1, 0, 1] } },
    { axisX: { side: "bottom" }, axisY: { side: "right" }, points: { x: [1, 2], y: [5, 10] } },
  ];

  it("derives a data-driven range for an axis with no fixed bounds", () => {
    expect(computeChartAxisRanges(axes, seriesList).bottom).toEqual({ min: 1, max: 3 });
    expect(computeChartAxisRanges(axes, seriesList).left).toEqual({ min: -1, max: 1 });
  });

  it("keeps a fixed bound and fills in the other end from the data", () => {
    expect(computeChartAxisRanges(axes, seriesList).right).toEqual({ min: 0, max: 10 });
  });

  it("resolves a disabled axis to null", () => {
    expect(computeChartAxisRanges(axes, seriesList).top).toBeNull();
  });

  it("resolves an enabled axis with no data and no fixed bounds to null", () => {
    const emptyAxes = { bottom: { enabled: true, scale: "linear", minimum: null, maximum: null } };
    expect(computeChartAxisRanges(emptyAxes, []).bottom).toBeNull();
  });
});
