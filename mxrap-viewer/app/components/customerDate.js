// Parse a customer timestamp cell to epoch milliseconds in UTC.
//
// The export's date columns look like "2023-05-01 00:31:38.892": a space
// separator and no timezone. Handing that straight to `new Date(...)` is not
// portable: engines disagree on whether a space-separated, zoneless string
// is local time, UTC, or invalid. So the accepted formats are matched
// explicitly here and a zoneless value is always read as UTC. ISO 8601
// strings with a trailing `Z` or a numeric offset are honoured. A value that
// is already a finite number is assumed to be epoch milliseconds and
// returned unchanged.
//
// Anything else, including `Date` objects (a CSV cell is never a Date),
// returns null. The colour and filter layers treat null the same as a
// missing value.
//
// Accepted limitations: the year must be >= 100 (four digits, no year-0..99
// special casing); UTC offsets beyond +/-14:00 are rejected.

const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * @param {string|number|null|undefined} value
 * @returns {number|null} epoch milliseconds (UTC), or null if unparseable
 */
export function parseCustomerDate(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (text === "") return null;

  const m = TIMESTAMP_RE.exec(text);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const millis = m[7] === undefined ? 0 : Number(m[7].padEnd(3, "0"));
  const zone = m[8];

  // `Date.UTC` maps years 0..99 to 1900..1999, which would silently mangle a
  // value. All real export data is modern; reject anything else.
  if (year < 100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInUtcMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let epoch = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  if (!Number.isFinite(epoch)) return null;

  if (zone && zone !== "Z") {
    const sign = zone[0] === "-" ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    const offsetHours = Number(digits.slice(0, 2));
    const offsetMinutes = Number(digits.slice(2, 4));
    // Reject impossible offsets (e.g. "+99:99"). Real civil UTC offsets never
    // exceed +/-14:00.
    if (offsetMinutes > 59) return null;
    if (offsetHours * 60 + offsetMinutes > 14 * 60) return null;
    epoch -= sign * (offsetHours * 60 + offsetMinutes) * 60_000;
  }

  return epoch;
}

function daysInUtcMonth(year, month) {
  // Day 0 of `month` (1-based) is the last day of that month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
