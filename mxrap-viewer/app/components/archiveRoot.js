// Finds the folder inside an export zip that holds info.json.
// Exports can be zipped three ways:
//   info.json at the top level             -> ""
//   export/info.json (mXrap's own export)  -> "export/"
//   <Folder>/info.json, from macOS "Compress <Folder>", which also adds
//   __MACOSX/ resource-fork entries that must be ignored -> "<Folder>/"
// Only a single top-level folder is accepted, so an archive with two
// candidate folders is not guessed at.
export function findArchiveRoot(zip) {
    if (zip.file("info.json")) return "";
    const roots = Object.keys(zip.files)
        .filter((path) => !path.startsWith("__MACOSX/"))
        .map((path) => path.match(/^([^/]+\/)info\.json$/)?.[1])
        .filter(Boolean);
    return roots.length === 1 ? roots[0] : "";
}
