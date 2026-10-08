import { buildPointSeries } from "./pointSeriesData";
import { buildLineSeries } from "./lineSeriesData";

export function requireColumns(rows, groups, label) {
  const columns = Object.keys(rows[0] ?? {});
  return groups.filter((aliases) => !aliases.some((key) => columns.includes(key)))
    .map((aliases) => `${label}: missing required column ${aliases.join(" / ")}.`);
}

export function validId(id) {
  return (typeof id === "number" && Number.isFinite(id)) || (typeof id === "string" && id.trim() !== "");
}

export function checkIds(rows, key, label, required = true) {
  if (!required && !Object.hasOwn(rows[0] ?? {}, key)) return [];
  const seen = new Set();
  let missing = 0;
  let duplicates = 0;
  for (const row of rows) {
    const id = row[key];
    if (!validId(id)) { missing++; continue; }
    if (seen.has(id)) duplicates++;
    seen.add(id);
  }
  return [
    ...(missing ? [`${label}: ${missing} row(s) have missing or invalid ${key} values.`] : []),
    ...(duplicates ? [`${label}: ${duplicates} duplicate ${key} value(s); IDs must be unique.`] : []),
  ];
}

export function checkPointData(rows, series, label) {
  const errors = [
    ...requireColumns(rows, [["X", "x", "Location X"], ["Y", "y", "Location Y"], ["Z", "z", "Location Z"]], label),
    ...checkIds(rows, "ID", label, false),
  ];
  const { stats } = buildPointSeries(rows, series);
  if (!stats.rendered) errors.push(`${label}: no points have valid coordinates.`);
  const warnings = stats.droppedNoXYZ ? [`${label}: ${stats.droppedNoXYZ} point(s) skipped because coordinates are missing or invalid.`] : [];
  return { errors, warnings, summary: { label, kind: "points", total: stats.totalRows, loaded: stats.rendered, skipped: stats.droppedNoXYZ } };
}

export function checkLineData(vertices, membership, series, label) {
  const errors = [
    ...requireColumns(vertices, [["ID"], ["X", "Location X"], ["Y", "Location Y"], ["Z", "Location Z"]], `${label} vertices`),
    ...requireColumns(membership, [["LineID"], ["VertexID"]], `${label} lines`),
    ...checkIds(vertices, "ID", `${label} vertices`),
  ];
  const known = new Set(vertices.map((v) => v.ID));
  const counts = new Map();
  let unknown = 0;
  let invalidMembership = 0;
  for (const row of membership) {
    if (!validId(row.LineID)) { invalidMembership++; continue; }
    counts.set(row.LineID, (counts.get(row.LineID) ?? 0) + 1);
    if (!validId(row.VertexID)) invalidMembership++;
    if (!known.has(row.VertexID)) unknown++;
  }
  const short = [...counts.values()].filter((count) => count < 2).length;
  const built = buildLineSeries(vertices, membership, series);
  const total = counts.size;
  const loaded = built.lines.length;
  if (!loaded) errors.push(`${label}: no valid lines remain.`);
  const warnings = [
    ...(unknown ? [`${label}: ${unknown} unknown vertex reference(s); affected lines are skipped.`] : []),
    ...(short ? [`${label}: ${short} line(s) have fewer than two vertices and are skipped.`] : []),
    ...(invalidMembership ? [`${label}: ${invalidMembership} membership row(s) have invalid LineID or VertexID values.`] : []),
    ...(total > loaded ? [`${label}: ${total - loaded} of ${total} line(s) skipped because their membership or coordinates are invalid.`] : []),
  ];
  return { errors, warnings, summary: { label, kind: "lines", total, loaded, skipped: total - loaded } };
}
