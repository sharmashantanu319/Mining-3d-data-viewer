// Saving a snapshot of the 3D view: a file name, and either writing into a
// folder the user picked once (File System Access API, Chromium only) or
// falling back to an ordinary browser download.

/** e.g. "mxrap-Stage 1 events-2026-10-06_14-03-22.png" — safe on every OS. */
export function snapshotFilename(sceneTitle, now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const title = String(sceneTitle ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 60);
  return `mxrap${title ? `-${title}` : ""}-${stamp}.png`;
}

export function canPickFolder() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Asks the user for a folder to save snapshots into. Returns null if cancelled. */
export async function pickSnapshotFolder() {
  try {
    return await window.showDirectoryPicker({ id: "mxrap-snapshots", mode: "readwrite" });
  } catch (error) {
    if (error?.name === "AbortError") return null;
    throw error;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves `blob` into `folderHandle` when there is one that still grants write
 * permission; otherwise downloads it. Returns where it went:
 * "folder" | "download".
 */
export async function saveSnapshot(blob, filename, folderHandle) {
  if (folderHandle) {
    try {
      let permission = await folderHandle.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") permission = await folderHandle.requestPermission?.({ mode: "readwrite" });
      if (permission === "granted") {
        const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return "folder";
      }
    } catch (error) {
      console.warn("Could not save into the chosen folder; downloading instead.", error);
    }
  }
  downloadBlob(blob, filename);
  return "download";
}
