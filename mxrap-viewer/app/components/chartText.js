// Turns the HTML-ish text an export puts in a chart's header, footer and
// annotations into safe, renderable pieces. The text comes from a file the
// user opened, so it is never inserted as raw HTML: it is tokenised, only a
// small allow-list of formatting tags is honoured and everything else is
// dropped, leaving plain text.

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

const ALLOWED_TAGS = new Set(["strong", "b", "em", "i", "u", "sub", "sup"]);

function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (match) => ENTITIES[match] ?? match);
}

/**
 * Lines of styled text runs. A `<br>` starts a new line; allow-listed tags
 * set flags on the runs inside them; a `<span style="text-decoration:
 * underline">` counts as underline. Unknown tags and every attribute are
 * discarded; stray `<` characters stay as text.
 *
 * @param {string} html
 * @returns {{text: string, bold: boolean, italic: boolean, underline: boolean, sub: boolean, sup: boolean}[][]}
 */
export function parseChartText(html) {
  const source = typeof html === "string" ? html : "";
  const lines = [[]];
  const stack = [];
  const flags = () => {
    const f = { bold: false, italic: false, underline: false, sub: false, sup: false };
    for (const tag of stack) {
      if (tag === "strong" || tag === "b") f.bold = true;
      else if (tag === "em" || tag === "i") f.italic = true;
      else if (tag === "u" || tag === "underline-span") f.underline = true;
      else if (tag === "sub") f.sub = true;
      else if (tag === "sup") f.sup = true;
    }
    return f;
  };

  const tokenPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>|([^<]+|<)/g;
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match[4] !== undefined) {
      const text = decodeEntities(match[4]);
      if (text) lines[lines.length - 1].push({ text, ...flags() });
      continue;
    }

    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attributes = match[3] ?? "";

    if (name === "br") {
      if (!closing) lines.push([]);
    } else if (name === "span") {
      if (closing) {
        const index = stack.lastIndexOf("span");
        const underlineIndex = stack.lastIndexOf("underline-span");
        const target = Math.max(index, underlineIndex);
        if (target >= 0) stack.splice(target, 1);
      } else {
        stack.push(/text-decoration\s*:\s*underline/i.test(attributes) ? "underline-span" : "span");
      }
    } else if (ALLOWED_TAGS.has(name)) {
      if (closing) {
        const index = stack.lastIndexOf(name);
        if (index >= 0) stack.splice(index, 1);
      } else {
        stack.push(name);
      }
    }
  }

  return lines;
}

/**
 * Plain-text version (line breaks kept, all formatting dropped).
 *
 * @param {string} html
 * @returns {string}
 */
export function chartTextToPlain(html) {
  return parseChartText(html)
    .map((line) => line.map((run) => run.text).join(""))
    .join("\n")
    .trim();
}
