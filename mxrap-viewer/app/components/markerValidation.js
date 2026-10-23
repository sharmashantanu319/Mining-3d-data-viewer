import { resolveColourMarker } from "./pointMarkerResolver";
import { normalizeSizeMarker } from "./sizeMapping";
import { parseCustomerDate } from "./customerDate";
import { parseColourRampCsv } from "./colourMapping";
import { symbolFileCandidates, isSingleColourDefinition, parseRgbColour } from "./markerSymbols";
import { findBorrowedMarkerMenu } from "./markerFallback";
import { findMarkerDefinition } from "./markerLookup";

// Marker conditions that are normal for the customer's exports, not problems:
// a marker whose minimum/maximum are null takes its colour range from the
// data (the customer leaves them null on purpose, e.g. "P[ML within R]",
// "Trigger", "Material"), and a column holding one value draws one colour.
// When the caller passes a `notes` array they are reported there instead of
// as warnings, so the warning count only shows things worth acting on.
export const MARKER_NOTE_CODES = new Set(["data-derived-bound", "degenerate-domain"]);

export async function checkMarkers(zip, series, rows, label, root, notes = null) {
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
  // Checked per role: the colour and size marker can share a name and still
  // be two different definitions (markerLookup.js).
  const roles = [["colour", series.colourMarker], ["size", series.sizeMarker]].filter(([, name]) => Boolean(name));
  for (const [role, name] of roles) {
    let def = findMarkerDefinition(definitions, name, role);
    let defMenu = series.markerMenu;
    if (!def && role === "colour" && series.type !== "lines") {
      const menu = await findBorrowedMarkerMenu(zip, root, name, Object.keys(rows[0] ?? {}), series.markerMenu);
      if (menu) {
        try {
          def = findMarkerDefinition(JSON.parse(await zip.file(`${root}marker-defs/${menu}.json`).async("text")), name, "colour");
        } catch {
          def = undefined;
        }
        if (def) {
          defMenu = menu;
          // Said plainly first; the files involved are kept at the end for
          // whoever fixes the export.
          warnings.push(`${label}: the colours for "${name}" are missing from this series' own marker file, so the same-named colours from another series are used (marker-defs/${menu}.json instead of marker-defs/${series.markerMenu}.json).`);
        }
      }
    }
    if (!def) {
      if (series.type === "lines" && name === "RQD") {
        // Nothing in the viewer can change this, and the legend already
        // names the colours as its default palette, so it is reported with
        // the notes rather than counted as a warning.
        (notes ?? warnings).push(`${label}: no RQD colour definition supplied; using the viewer's default 0–100 palette.`);
      } else {
        warnings.push(`${label}: marker "${name}" is unavailable; fallback styling will be used.`);
      }
      continue;
    }
    if (isSingleColourDefinition(def)) {
      const folder = series.markerMenu.split("/").slice(0, -1).join("/");
      if (!parseRgbColour(def.colour)) warnings.push(`${label}: single-colour marker "${name}" has an unreadable colour; fallback colour will be used.`);
      if (def.symbol && !symbolFileCandidates(def.symbol).some((symbol) => zip.file(`${root}marker-images/${symbol}`) || zip.file(`${root}marker-defs/${folder}/${symbol}`))) {
        warnings.push(`${label}: marker symbol "${def.symbol}" is missing; affected symbols may not display.`);
      }
      continue;
    }
    if (!rows.some((row) => Object.hasOwn(row, def.input))) {
      warnings.push(`${label}: marker "${name}" input column "${def.input}" is missing.`);
    }
    if (role === "colour") {
      const folder = defMenu.split("/").slice(0, -1).join("/");
      const rampEntry = def.ramp ? zip.file(`${root}marker-defs/${folder}/${def.ramp}`) : null;
      const rampCsv = rampEntry ? await rampEntry.async("text") : null;
      const marker = resolveColourMarker({ ...series, points: rows, markerDefinitions: [{ ...def, rampCsv }] });
      if (!marker?.valid) warnings.push(`${label}: colour ramp for "${name}" is missing or invalid; fallback colours will be used.`);
      if (marker?.valid) {
        // Continuous interpolation is a normal default, not damaged data.
        for (const warning of marker.warnings ?? []) {
          if (warning.code === "numberOfColours-missing") continue;
          const text = `${label}: ${warning.message ?? warning}`;
          if (notes && MARKER_NOTE_CODES.has(warning.code)) notes.push(text);
          else warnings.push(text);
        }
        const symbols = new Set(parseColourRampCsv(rampCsv).segments.map((segment) => segment.symbol).filter(Boolean));
        if (def.nullSymbol) symbols.add(def.nullSymbol);
        for (const symbol of symbols) {
          if (!symbolFileCandidates(symbol).some((name) => zip.file(`${root}marker-images/${name}`) || zip.file(`${root}marker-defs/${folder}/${name}`))) {
            warnings.push(`${label}: marker symbol "${symbol}" is missing; affected symbols may not display.`);
          }
        }
      }
    }
    if (role === "size") {
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
  // A colour and a size marker reading the same missing column would
  // otherwise report it twice.
  return [...new Set(warnings)];
}
