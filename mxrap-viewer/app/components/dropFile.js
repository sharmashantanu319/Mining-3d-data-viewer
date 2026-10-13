// Pure helpers for drag-and-drop loading of an export file. Kept free of
// React/DOM state so they can be unit-tested.

const EXPORT_EXTENSIONS = [".zip", ".json"]; // keep in step with Header's <input accept>

/** True if a drag event is carrying files (not text/links being dragged). */
export function dragHasFiles(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes("Files");
}

/**
 * Picks the export to open from a dropped FileList / array. Returns
 * `{ file }` for the first .zip/.json, or `{ error }` explaining why none
 * could be used. Only one export is opened at a time.
 */
export function pickExportFile(files) {
  const list = Array.from(files ?? []);
  if (list.length === 0) return { error: "No file was dropped." };
  const file = list.find((candidate) =>
    EXPORT_EXTENSIONS.some((extension) => candidate.name.toLowerCase().endsWith(extension))
  );
  if (!file) return { error: `Unsupported file "${list[0].name}". Drop an mXrap export (.zip).` };
  return { file };
}
