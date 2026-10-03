# Chart module scoping: Magnitude-Time chart

Status: proposal for discussion at the next client meeting (client Action 6, 25 Sept 2026 meeting).
Nothing in this document is implemented yet.

## 1. Summary

The client wants the viewer to show the mXrap **Magnitude-Time chart** that ships alongside the 3D
view in an export: event magnitude over time as points, plus a cumulative event count as a line on
a second axis.

- **Feasible for the MVP**, and it fits the "data stays in the browser" architecture: the chart is
  another client-side view built from CSV files that are already in the export.
- **Recommended library: uPlot** (22 KB gzipped, multiple axes, time and log scales built in).
  Legend-coloured points and lines need a small custom draw step on top of it.
- **Effort:** about 8 developer-days for the full MVP feature set, in seven small PRs. A thin
  first slice (chart appears, both axes, points and lines) is about 5 developer-days.
- **Blockers:** none for the thin slice. A few questions for Matt (section 8) affect the later PRs.

## 2. What the client asked for (meeting of 25 Sept, section 2.4)

| Requirement | MVP? |
| :--- | :--- |
| Three axes: bottom (date/time), left (Local Magnitude), right (cumulative events) | Yes |
| Logarithmic scale option (for example log10 of the cumulative count) | Yes |
| Each series can show points and/or lines independently, with initial visibility from `pointsVisible` / `linesVisible` | Yes |
| Line colour: a fixed override colour, otherwise interpolated from the colour legend by event value | Yes |
| Lines plot in ascending X order by default, or in the order of a specified column (`linePlotOrder`) | Yes |
| `linesGroupBy`: split one series into several lines by the values of a column | Yes |
| Data is filtered **before** export, so no live filtering in the viewer | Out of scope |
| Axis bounds fixed to the full dataset | Yes (acceptable for MVP) |
| Axis bounds that re-fit when series are toggled | Nice-to-have |

## 3. What the sample export contains

The sample export (`visualiser-export-2`) has one chart, `s1-mag-time-chart/config.json`, in the
same slide as the 3D view. Everything below is read from that file and from the CSVs it references.

**Chart-level fields:** `type: "chart"`, `name`, `header`, `footer`, `axes`, `series`, `annotations`.

**Axes.** `bottom`, `left`, `right` and `top`, each with `enabled`, `title`, `scale`, `minimum`,
`maximum`. The sample uses `scale: "datetime"` (bottom) and `"linear"` (left, right); the right axis
sets `minimum: 0` and the others use `null` (auto). `top` is disabled. The exact string for a log
scale does not appear in the sample (question 1 in section 8).

**Series.** The chart has three series over the same data:

| Series | Rows used | X | Y | Points | Lines |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Events > threshold | `AboveThreshold` = 1 (665 rows) | `DateTime`, bottom | `ML`, left | visible | off |
| Events < threshold | `BelowThreshold` = 1 (5,238 rows) | `DateTime`, bottom | `ML`, left | visible | off |
| Cumulative number of events | `AboveThreshold` = 1 | `DateTime`, bottom | `CumulativeNumberOfEvents`, right | hidden | visible, colour `rgb(0,0,127)` |

Per-series fields: `enablePoints` / `enableLines` (which toggles the UI offers), `pointsVisible` /
`linesVisible` (initial state), `legend`, `markerMenu`, `colourMarker`, `showNullColours`,
`sizeMarker`, `sizeMinimum`, `sizeMaximum`, `nullSizes`, `lineOverrideColour`, `linesGroupBy`,
`linePlotOrder`, `axisX` and `axisY` (`side` plus `column`), `filter` and `data-additional`.

**How the data is joined.** A chart series does not carry its own data. It points at a folder that
the 3D view already uses (`"data": "s1-events"`) and adds extra columns from
`"data-additional": ["s1-events-mag-time"]`:

- `s1-events.csv` has `ID, DateTime, X, Y, Z, ML, ...` (5,903 rows).
- `s1-events-mag-time.csv` has `ID, AboveThreshold, BelowThreshold, CumulativeNumberOfEvents` with
  the same 5,903 IDs in the same order.
- The `filter` value names one of the extra columns; a row belongs to the series when that column is
  1. `CumulativeNumberOfEvents` is filled only for above-threshold rows (1 to 665) and empty for the
  rest.

**Other things in the file.**

- `header` and `footer` are **HTML** (`<br>`, `<sub>`, `<span style=...>`, `<strong>`).
- `annotations` use axis coordinates, not 3D coordinates:
  `{ "location": { "bottom": "2023-05-19 18:01:18.254", "right": 400 }, "colour": ..., "text": ... }`.
- The slide in `info.json` lists the 3D view and the chart as two displays of one slide.

## 4. What the viewer does today

- `parseExportFile.js` skips any display whose `type` is not `3dview` (it logs
  `Skipping non-3dview display`), and `validateExportFile.js` skips them too. A chart is never
  parsed or checked.
- The parsed result is a flat list of scenes, one per 3D display. The slide structure (a 3D view and
  a chart sitting in the same slide) is lost, so there is nowhere for a chart to attach.
- An export made only of charts parses to zero scenes, an edge case the viewer has to handle when
  chart displays become a first-class part of the parse result.
- Reusable as they are: `customerDate.js` (timestamp cells to epoch ms), `readCsv` and
  `loadMarkerDefinitions` in the parser, `colourMapping.js` and `pointMarkerResolver.js` (colour
  ramps and marker colour for a value), `sizeMapping.js`, and `colourLegend.js`.

## 5. Proposed design

**Data.** Parse each chart display into a plain object next to the scenes, keyed by slide:
`{ slideIndex, title, header, footer, axes, series[], annotations[] }`. Each series is resolved to
column arrays: read the `data` CSV and every `data-additional` CSV, join them by `ID`, and keep the
rows whose `filter` column is 1. Store the columns (typed arrays for X and Y), not row objects, so
large series stay small.

**Pure modules first** (unit-testable without a browser, matching the rest of the code):

- `parseChartConfig.js`: the config to a validated chart description, with clear errors.
- `chartData.js`: join and filter rows, order the line (ascending X, or by `linePlotOrder`), split
  by `linesGroupBy`, compute axis extents and ticks for `datetime`, `linear` and `log10`.
- `chartColours.js`: per-point and per-segment colour, using the same colour resolution as the 3D
  points (legend ramp, or `lineOverrideColour`).

**Rendering.** A `ChartView` React component that owns one chart instance, created on the client
only, with a cleanup that destroys it. Toggle buttons per series for points and lines, driven by
`enablePoints` / `enableLines`, starting from `pointsVisible` / `linesVisible`.

**Where it appears.** A slide can hold a 3D view and a chart. Proposed: keep the scene picker for
the 3D views, and add a "Chart" tab beside the 3D canvas when the current slide has a chart. This
is the main UX choice to confirm with Matt (question 4).

**Header, footer and annotation text is HTML from a file the user opened.** It must not be inserted
as raw HTML. Convert it with an allow-list (`br`, `sub`, `sup`, `strong`, `em`, `u`, and `span`
with only `text-decoration` and `color`) or fall back to plain text with line breaks. This needs a
unit test with hostile input.

## 6. Library options

Sizes are the minified and gzipped size of each package's distributed bundle, measured for this
document (npm `uplot@1.6.32`, `d3@7.9.0`, `chart.js@4.5.1`, `plotly.js-basic-dist@4.1.1`). The
modular D3 figure is an estimate, and Recharts was not measured.

| Option | Size (gzip) | Multi-axis, time, log | Per-point colour | Fit for this project |
| :--- | :--- | :--- | :--- | :--- |
| **uPlot** | 22 KB | Built in (several y scales, time scale, log distribution) | Custom draw step needed | **Recommended.** Smallest, canvas-based, made for large time series |
| Chart.js | 70 KB | Multiple axes yes; a time scale needs a separate date adapter; log yes | Yes (scriptable options) | Reasonable fallback, about three times the size |
| D3 (modular: scale, axis, shape) | estimated 25 to 30 KB for the parts needed (the full bundle is 92 KB) | Everything is built by hand | Full control | Most flexible, most work; axes, zoom and hit-testing are ours to write |
| Plotly (basic bundle) | 557 KB | Yes | Yes | Too heavy for a static site; not recommended |
| Recharts | not measured | Limited | Awkward | SVG, slows down with many points; not recommended |
| Direct canvas | 0 KB | All by hand | Full control | Only worth it if a library blocks us |

**Why uPlot.** It gives the three-axis layout, a real time axis and a log scale out of the box, and
it is built to draw tens of thousands of points quickly. It also loads without error under Node,
so it does not break the Next.js prerender step (it should still be created inside an effect, on
the client). Its weak spot is colour: a series has one stroke and one fill, so per-point colours
and colour-interpolated line segments have to be drawn by us in a `draw` hook. That is a small
amount of canvas code, but it is the riskiest piece, so the first PR includes a spike for it
(section 7, PR C).

**Data volume.** The sample chart has 5,903 points. The client says event data can reach millions
for the 3D view. A canvas chart is comfortable to roughly 100,000 points; beyond that the chart
needs down-sampling (per-pixel min/max buckets). This is listed as a follow-up, not MVP.

## 7. Implementation plan

Estimates are developer-days for one person, including tests, excluding review turnaround.

| PR | Scope | Depends on | Days |
| :--- | :--- | :--- | :---: |
| A. `feat: parse chart displays` | Keep slide structure; parse chart configs; validate chart references; join `data` + `data-additional` by ID and apply `filter`. Tests against the sample export | none | 1.5 |
| B. `feat: chart data and axes (pure)` | `chartData.js`: line ordering, `linesGroupBy`, axis extents, datetime, linear and log10 | A | 1.5 |
| C. `feat: chart view with points and lines` | Add uPlot; `ChartView`; three axes; per-series point and line toggles; spike for the custom draw step | B | 2 |
| D. `feat: chart colours` | Per-point colour from the legend, per-segment line colour, `lineOverrideColour`, size mapping | C | 1.5 |
| E. `feat: chart text and annotations` | Sanitised header, footer and annotation text; annotations in axis coordinates | C | 1 |
| F. `feat: show the chart in the workspace` | Chart tab on the slide, empty and error states, session persistence of toggles | C | 1 |
| G. `perf: chart down-sampling` (nice-to-have) | Min/max bucketing above a point-count threshold | C | 1 to 2 |

**MVP total (A to F): about 8.5 developer-days.** The thin slice for the 6 Oct demo is A, B, C and
F, about 6 developer-days; D and E follow, and they can run in parallel with C once B has merged.

## 8. Risks and open questions

Questions for Matt:

1. What is the `scale` string for a logarithmic axis in the config (for example `"log10"`)? The
   sample only has `"datetime"` and `"linear"`.
2. Are there charts other than Magnitude-Time (bar, histogram, scatter of other columns)? The
   config format looks general, but the requirement is for this one chart only.
3. How is a line coloured "by the legend" when a line segment joins two events with different
   values: the value at the start, at the end, or a blend across the segment?
4. Should the chart sit beside the 3D view, in a tab, or on its own page? mXrap shows them as
   separate displays on one slide.
5. Can we get a second chart export with `linesGroupBy` set and a log axis? The sample has neither,
   so those two features would be built from the description alone.
6. Is `top` axis support needed? The sample has it disabled.
7. Time zone: `DateTime` cells have no zone. The viewer reads them as UTC (`customerDate.js`). Is that
   what mXrap shows?

Risks:

- Custom colouring in uPlot (section 6) could take longer than estimated. Mitigation: the spike in
  PR C, with Chart.js as the fallback.
- Only one sample chart, with no grouping and no log axis, so those features are untested against
  real data until Matt sends more.
- The slide restructure in PR A touches the parser result that the scene picker and session code
  read. Keep the existing `scenes` array unchanged and add the chart data beside it, so the 3D
  path is not disturbed.
- Untrusted HTML in `header`, `footer` and annotation text (section 5).
