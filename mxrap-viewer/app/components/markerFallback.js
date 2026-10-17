// Fallback for a colour marker that is missing from a series' own marker
// menu. Some exports put the wrong markers.json in a menu folder (e.g. the
// TestHazards export: "Minodes" asks for "P[ML within R]", but its
// hazard-minodes/markers.json holds the seismic-event markers, while
// hazard-painted/markers.json defines "P[ML within R]").
//
// The definition is borrowed from another menu in the same export only when
// it is unambiguous: exactly one other menu defines a colour marker with
// that name, and the series' data has the column that marker reads. The
// caller reports the borrow as a warning so it stays visible.

const COLOUR_TYPES = new Set(["colour", "single-colour"]);

export async function findBorrowedMarkerMenu(zip, root, name, columns, ownMenu) {
  if (!name) return null;
  const prefix = `${root}marker-defs/`;
  const matches = [];
  for (const path of Object.keys(zip.files)) {
    if (!path.startsWith(prefix) || !path.endsWith(".json") || zip.files[path].dir) continue;
    const menu = path.slice(prefix.length, -".json".length);
    if (menu === ownMenu) continue;
    let definitions;
    try {
      definitions = JSON.parse(await zip.file(path).async("text"));
    } catch {
      continue;
    }
    if (!Array.isArray(definitions)) continue;
    const found = definitions.some((def) =>
      def && def.name === name && COLOUR_TYPES.has(def.type) &&
      (def.type === "single-colour" || columns.includes(def.input)));
    if (found) matches.push(menu);
  }
  return matches.length === 1 ? matches[0] : null;
}
