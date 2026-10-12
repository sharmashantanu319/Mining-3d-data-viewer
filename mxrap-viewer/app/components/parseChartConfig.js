// Validates a chart display's config.json into a clean description that
// chartData.js and the chart renderer can trust, so neither has to re-check
// for missing or malformed fields.
//
// Mirrors the degrade-safe pattern the rest of the parser uses: a chart
// series with no usable data reference is dropped with a console.warn
// instead of throwing, so one bad series (or a config that isn't a chart at
// all) doesn't fail the whole export.

const AXIS_SIDES = ["bottom", "left", "right", "top"];
const AXIS_SCALES = ["datetime", "linear", "log10"];

/**
 * @param {object} config  the display's parsed config.json
 * @param {string} [label]  the display folder name, used in warnings
 * @returns {object|null}  a validated chart description, or null if
 *   `config` isn't a chart display at all
 */
export function parseChartConfig(config, label = "chart") {
  if (!config || config.type !== "chart") return null;

  const axes = {};
  for (const side of AXIS_SIDES) {
    axes[side] = parseAxis(config.axes?.[side]);
  }

  const series = (Array.isArray(config.series) ? config.series : [])
    .map((entry, index) => parseChartSeries(entry, `${label} series ${index + 1}`))
    .filter(Boolean);

  const annotations = (Array.isArray(config.annotations) ? config.annotations : [])
    .map(parseChartAnnotation)
    .filter(Boolean);

  return {
    name: typeof config.name === "string" ? config.name : label,
    header: typeof config.header === "string" ? config.header : "",
    footer: typeof config.footer === "string" ? config.footer : "",
    axes,
    series,
    annotations,
  };
}

function parseAxis(rawAxis) {
  const scale = AXIS_SCALES.includes(rawAxis?.scale) ? rawAxis.scale : "linear";
  return {
    enabled: rawAxis?.enabled === true,
    title: typeof rawAxis?.title === "string" ? rawAxis.title : "",
    scale,
    minimum: Number.isFinite(rawAxis?.minimum) ? rawAxis.minimum : null,
    maximum: Number.isFinite(rawAxis?.maximum) ? rawAxis.maximum : null,
  };
}

function parseChartSeries(entry, label) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.data !== "string" || entry.data === "") {
    console.warn(`Skipping ${label}: no "data" file referenced.`);
    return null;
  }

  const axisX = parseSeriesAxisRef(entry.axisX);
  const axisY = parseSeriesAxisRef(entry.axisY);
  if (!axisX || !axisY) {
    console.warn(`Skipping ${label}: missing or invalid axisX/axisY.`);
    return null;
  }

  return {
    name: entry.name ?? label,
    data: entry.data,
    dataAdditional: Array.isArray(entry["data-additional"])
      ? entry["data-additional"].filter((ref) => typeof ref === "string" && ref !== "")
      : [],
    filter: typeof entry.filter === "string" && entry.filter !== "" ? entry.filter : null,
    enablePoints: entry.enablePoints !== false,
    enableLines: entry.enableLines === true,
    pointsVisible: entry.pointsVisible !== false,
    linesVisible: entry.linesVisible === true,
    legend: entry.legend === true,
    markerMenu: entry.markerMenu ?? null,
    colourMarker: entry.colourMarker ?? null,
    showNullColours: entry.showNullColours === true,
    sizeMarker: entry.sizeMarker ?? null,
    sizeMinimum: Number.isFinite(entry.sizeMinimum) ? entry.sizeMinimum : null,
    sizeMaximum: Number.isFinite(entry.sizeMaximum) ? entry.sizeMaximum : null,
    nullSizes: Number.isFinite(entry.nullSizes) ? entry.nullSizes : null,
    lineOverrideColour: entry.lineOverrideColour ?? null,
    linesGroupBy: Array.isArray(entry.linesGroupBy)
      ? entry.linesGroupBy.filter((column) => typeof column === "string" && column !== "")
      : [],
    linePlotOrder: typeof entry.linePlotOrder === "string" && entry.linePlotOrder !== ""
      ? entry.linePlotOrder
      : null,
    axisX,
    axisY,
  };
}

function parseSeriesAxisRef(ref) {
  if (!ref || typeof ref !== "object") return null;
  if (!AXIS_SIDES.includes(ref.side)) return null;
  if (typeof ref.column !== "string" || ref.column === "") return null;
  return { side: ref.side, column: ref.column };
}

function parseChartAnnotation(raw) {
  const location = raw?.location;
  const text = raw?.text;
  if (!location || typeof location !== "object") return null;
  if (text === undefined || text === null || String(text).trim() === "") return null;

  const axisLocation = {};
  for (const side of AXIS_SIDES) {
    if (location[side] !== undefined) axisLocation[side] = location[side];
  }
  if (Object.keys(axisLocation).length === 0) return null;

  return {
    text: String(text),
    location: axisLocation,
    color: raw.colour ?? raw.color ?? null,
  };
}
