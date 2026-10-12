# Contributor notes — Hongfei Peng

> Historical individual contribution and testing notes preserved verbatim from the `Development` branch's previous `mxrap-viewer/README.md` when the group README was rewritten for project handover. These notes are the contributor's own account; consult linked PRs for details.

## My Contributions (Hongfei Peng)

The modules below were designed and implemented by me. See the linked pull requests for full design decisions and testing details.

- **`app/components/ThreeScene.jsx`** — Core Three.js scene setup (Scene/Camera/Renderer/Lights), reading camera position/focal/up from scene data, and full teardown-and-rebuild on scene switch, per the client's confirmed requirement.
  → PR #8: https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/8
  → PR #11: https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/11

- **`app/components/cameraControls.js`** *(camera position/focal/up handling contributed here; also extended by teammates for projection-mode switching)* — Dynamic near/far calculation based on camera-to-target distance, avoiding WebGL depth-precision issues at real mine-scale coordinates.
  → PR #11: https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/11

- **`app/components/geometryBuilder.js`** — Converts raw `{vertices, faces}` data into Three.js `BufferGeometry`, including an ID-to-array-index mapping for non-contiguous vertex IDs, and `DoubleSide` material rendering (required so surfaces stay visible from any camera angle, matching MXRAP's behaviour).
  → PR #8: https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/8

- **`app/components/parseExportFile.js`** — Parses the client's real export zip structure (`info.json` + `slides`/`displays` + CSVs under `data/`) into scene data.
  → PR #12: https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/12

- **`app/components/validateExportFile.js`** — Validates an uploaded export file's structural completeness and data-reference integrity *before* parsing/rendering, collecting all issues into a single report. Originally implemented by me; since extended by teammates (annotation-rendering support, fixes per tickets #78–80).
  → PR #26: https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/26

- **`test-data/test-export-big.zip`** — Test export matching the real export schema, generated with Claude's help and tested in the browser.

### Bugs found and fixed along the way

- Blank render despite correctly parsed data (WebGL depth-precision issue): https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues/94
- Camera not reading real focal point from export data: https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues/95

### Testing

During development I tested `parseExportFile.js` and `validateExportFile.js` in the browser using constructed test zip files (a valid file, plus files with a missing CSV and an invalid vertex reference).

Formal unit tests for these modules (`app/components/__tests__/parseExportFile.test.js`, `validateExportFile.test.js`) were subsequently added by a teammate (Viktor) using Vitest:

```bash
npx vitest run app/components/__tests__/parseExportFile.test.js
npx vitest run app/components/__tests__/validateExportFile.test.js
```
