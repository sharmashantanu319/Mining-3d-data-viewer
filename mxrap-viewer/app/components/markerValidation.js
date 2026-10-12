import { resolveColourMarker } from "./pointMarkerResolver";
import { normalizeSizeMarker } from "./sizeMapping";
import { parseCustomerDate } from "./customerDate";
import { parseColourRampCsv } from "./colourMapping";

export async function checkMarkers(zip, series, rows, label, root) {
  const warnings = [];
  if (series.type === "lines" && series.colourMarker === "RQD") {
    const missing = rows.filter((row) => row.RQD == null || row.RQD === "" || !Number.isFinite(Number(row.RQD))).length;
    if (missing) warnings.push(`${label}: ${missing} vertex row(s) have missing or invalid RQD values; these values use the missing-value colour.`);
  }
  let definitions = [];
  if (series.markerMenu) {
    const path = `${root}marker-defs/${series.markerMenu}.json`;
    const entry = zip.file(path);
    if (!entry) warnings.push(`${label}: marker definitions "${path}" are missing; fallback styling will be used.`);
    else {
      try {
        const parsed = JSON.parse(await entry.async("text"));
        if (!Array.isArray(parsed)) throw new Error("expected an array");
        definitions = parsed.filter((def) => def && typeof def === "object");
      } catch {
        warnings.push(`${label}: marker definitions are invalid; fallback styling will be used.`);
      }
    }
  }
  for (const name of [series.colourMarker, series.sizeMarker].filter(Boolean)) {
    const def = definitions.find((d) => d.name === name);
    if (!def) {
      warnings.push(series.type === "lines" && name === "RQD"
        ? `${label}: no RQD colour definition supplied; using the viewer's default 0–100 palette.`
        : `${label}: marker "${name}" is unavailable; fallback styling will be used.`);
      continue;
    }
    if (!rows.some((row) => Object.hasOwn(row, def.input))) {
      warnings.push(`${label}: marker "${name}" input column "${def.input}" is missing.`);
    }
    if (name === series.colourMarker) {
      const folder = series.markerMenu.split("/").slice(0, -1).join("/");
      const rampEntry = def.ramp ? zip.file(`${root}marker-defs/${folder}/${def.ramp}`) : null;
      const rampCsv = rampEntry ? await rampEntry.async("text") : null;
      const marker = resolveColourMarker({ ...series, points: rows, markerDefinitions: [{ ...def, rampCsv }] });
      if (!marker?.valid) warnings.push(`${label}: colour ramp for "${name}" is missing or invalid; fallback colours will be used.`);
      if (marker?.valid) {
        // Continuous interpolation is a normal default, not damaged data.
        for (const warning of marker.warnings ?? []) {
          if (warning.code !== "numberOfColours-missing") warnings.push(`${label}: ${warning.message ?? warning}`);
        }
        const symbols = new Set(parseColourRampCsv(rampCsv).segments.map((segment) => segment.symbol).filter(Boolean));
        if (def.nullSymbol) symbols.add(def.nullSymbol);
        for (const symbol of symbols) {
          if (!zip.file(`${root}marker-images/${symbol}`) && !zip.file(`${root}marker-defs/${folder}/${symbol}`)) {
            warnings.push(`${label}: marker symbol "${symbol}" is missing; affected symbols may not display.`);
          }
        }
      }
    }
    if (name === series.sizeMarker) {
      let dataMin = null;
      let dataMax = null;
      for (const row of rows) {
        const raw = row[def.input];
        if (raw == null || raw === "") continue;
        const value = def.inputType === "date" ? parseCustomerDate(raw) : Number(raw);
        if (!Number.isFinite(value)) continue;
        dataMin = dataMin == null ? value : Math.min(dataMin, value);
        dataMax = dataMax == null ? value : Math.max(dataMax, value);
      }
      const marker = normalizeSizeMarker(def, series, { dataMin, dataMax });
      if (!marker.valid) warnings.push(`${label}: size marker "${name}" is invalid; fallback sizes will be used.`);
    }
  }
  return warnings;
}
