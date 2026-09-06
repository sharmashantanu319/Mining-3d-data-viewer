// A minimal tolerant JSON reader.
//
// This is `JSON.parse` with exactly one fallback: if the strict parse fails
// with a SyntaxError, a second attempt is made after removing trailing
// commas: a comma that directly precedes a closing `}` or `]` and is itself
// preceded by a value. Nothing else is touched: no comment stripping,
// no quote repair, no number coercion. The scan is string-aware, so a comma
// inside a string literal is never removed.
//
// Why: the customer's marker configuration files are hand-authored and at
// least one (`marker-defs/sensors/markers.json`) contains a trailing comma
// after the last category object. Strict `JSON.parse` rejects it. One
// malformed marker menu must not stop the whole viewer from loading, so the
// export loader parses marker JSON through here and reports a structured
// error only if the tolerant pass also fails.

/**
 * @param {string} text
 * @returns {{ value: unknown, recovered: boolean }}
 *   `recovered` is true when the trailing-comma pass was needed.
 * @throws {SyntaxError} if the text is still not valid JSON after that pass.
 */
export function parseJsonLenient(text) {
  try {
    return { value: JSON.parse(text), recovered: false };
  } catch (firstError) {
    if (!(firstError instanceof SyntaxError)) throw firstError;

    const stripped = stripTrailingCommas(text);
    if (stripped === text) throw firstError;

    return { value: JSON.parse(stripped), recovered: true };
  }
}

function isJsonWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Remove commas that are genuinely trailing: preceded by a value and
 * followed (past whitespace) by `}` or `]`. A comma with no value before it
 * (`{,}`, `[,,]`) is left in place so `JSON.parse` still reports it.
 */
function stripTrailingCommas(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  let lastSignificant = ""; // last non-whitespace char seen outside a string

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      lastSignificant = ch;
      continue;
    }

    if (ch === ",") {
      const precededByValue =
        lastSignificant !== "" &&
        lastSignificant !== "{" &&
        lastSignificant !== "[" &&
        lastSignificant !== ",";

      let j = i + 1;
      while (j < text.length && isJsonWhitespace(text[j])) j++;
      const followedByClose =
        j < text.length && (text[j] === "}" || text[j] === "]");

      if (precededByValue && followedByClose) {
        // Drop the comma. Any whitespace between it and the bracket is
        // emitted normally on the following iterations.
        continue;
      }

      out += ch;
      lastSignificant = ch;
      continue;
    }

    out += ch;
    if (!isJsonWhitespace(ch)) lastSignificant = ch;
  }

  return out;
}
