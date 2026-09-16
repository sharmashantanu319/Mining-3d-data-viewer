// Build a point-cloud series from parsed export CSV rows.
//
// parseExportFile.js reads the zip and the CSV; this does the pure part:
// pull the position out of each row, keep the rest of the columns on the
// point so the colour / size / filter layers can read them (ML, DateTime,
// SeismicMoment, ...), and carry the series' marker settings onto the
// result. No `three` import, no file IO.

const X_KEYS = ["X", "x", "Location X"];
const Y_KEYS = ["Y", "y", "Location Y"];
const Z_KEYS = ["Z", "z", "Location Z"];

function readCoord(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * @param {object[]} rows  parsed rows of the series' data CSV
 * @param {object} series  the series entry from a display's config.json
 * @param {object[]} [markerDefinitions]  the series' markerMenu entries
 *   (markers.json, with each def's ramp CSV text attached as `rampCsv` by
 *   parseExportFile.js), used by pointMarkerResolver.js to resolve real
 *   per-point colour/size. Empty for mock data / series with no markerMenu.
 * @returns {PointSeries}
 */
export function buildPointSeries(rows, series, markerDefinitions = []) {
  const s = series ?? {};
  const source = Array.isArray(rows)
    ? rows.filter((r) => r && typeof r === "object")
    : [];

  const points = [];
  let droppedNoXYZ = 0;
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    const row = source[sourceIndex];
    const x = readCoord(row, X_KEYS);
    const y = readCoord(row, Y_KEYS);
    const z = readCoord(row, Z_KEYS);
    if (x === null || y === null || z === null) {
      droppedNoXYZ += 1;
      continue;
    }
    points.push({ ...row, x, y, z, sourceIndex });
  }

  return {
    name: s.name ?? null,
    data: s.data ?? null,
    markerMenu: s.markerMenu ?? null,
    colourMarker: s.colourMarker ?? null,
    sizeMarker: s.sizeMarker ?? null,
    sizeMinimum: s.sizeMinimum,
    sizeMaximum: s.sizeMaximum,
    nullSizes: s.nullSizes,
    showNullColours: s.showNullColours === true,
    distanceAttenuation: s.distanceAttenuation ?? null,
    visible: s.visible !== false,
    legend: s.legend === true,
    clipping: s.clipping === true,
    markerDefinitions: Array.isArray(markerDefinitions) ? markerDefinitions : [],
    points,
    stats: { totalRows: source.length, rendered: points.length, droppedNoXYZ },
  };
}
