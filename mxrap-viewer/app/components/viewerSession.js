// Per-file viewer session persistence (scene, filters, marker selections,
// panel/legend visibility, projection mode, camera position) via
// localStorage, so reopening the same export can offer to pick up where
// the user left off instead of starting from scratch every time.
//
// The file's name+size is used as a lightweight "same file" fingerprint —
// not a content hash, which would be expensive for a large export and is
// more precision than this needs.

const STORAGE_PREFIX = "mxrap-viewer-session:";

export function sessionKeyFor(file) {
  if (!file) return null;
  return `${STORAGE_PREFIX}${file.name}:${file.size}`;
}

export function loadSession(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    // Storage disabled/unavailable (private browsing, quota, corrupt JSON,
    // no localStorage global e.g. during SSR) — the feature is a
    // nice-to-have, so fail silently rather than breaking the viewer.
    return null;
  }
}

export function saveSession(key, session) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Same rationale as loadSession: never let a storage failure surface.
  }
}
