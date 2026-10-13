# Mining 3D Data Viewer — mXrap Web Viewer

A browser-based prototype for exploring underground mining data exported from **mXrap**. Developed for the CITS5206 group project, it brings 3D mine geometry, seismic events, sensor data, rock mass quality (RMQ) intervals and selected charts into one interactive workspace.

**Project status:** Working academic MVP on the `Development` branch, with further acceptance testing and handover checks required. The application reads supported mXrap export ZIP files locally in the browser; it is **not** a replacement for all desktop mXrap features.

## Quick start

**Requirements:** Node.js **24** (used in CI), npm (bundled with Node.js), Git and a modern browser with WebGL enabled.

From a terminal:

```bash
git clone https://github.com/sharmashantanu319/Mining-3d-data-viewer.git
cd Mining-3d-data-viewer
git switch Development
cd mxrap-viewer
npm ci
npm run dev
```

Open **http://localhost:3000**. Stop the development server using `Ctrl+C`.

> **Important:** The Node.js application and `package.json` live in `mxrap-viewer/`, **not** at the repository root. If `npm` reports that it cannot find `package.json`, check your working directory. The current MVP features described here are from `Development`; do not assume the default `main` branch contains them until the final release merge.

### Production-mode local run

From `mxrap-viewer/`:

```bash
npm ci
npm run build
npm run start
```

Browse to **http://localhost:3000**. This starts the locally built Next.js application; no public hosted deployment is claimed here.

## Demonstration in under five minutes

1. Start the app. Its initial 3D scene is **mock demonstration data**, not evidence that an mXrap export has loaded.
2. Use **Open Export** (top bar) and select `mxrap-viewer/test-data/visualiser-export-2.zip` from this repository. The app validates the archive, then loads its supported displays. The file is selected through the browser; it is not loaded automatically.
3. In the **Scene** panel, switch between the available 3D views. Orbit/pan/zoom in the central viewport; use the viewport toolbar for **Fit Scene**, **Reset View**, **Perspective** and **Orthographic** camera options.
4. In **Layers**, toggle point, surface and RMQ line series as available. Use **Marker Style**, **Filters** and **Annotations** to adjust presentation. Hover/click event points for the corresponding information in the details panel. Controls depend on what the selected export contains.
5. When the uploaded export includes chart data, select the **Chart** tab to inspect the **Magnitude–Time** plot. Toggle the displayed point/line series, then return to **3D View**.
6. Expand the **Import report** if shown to inspect warnings and data-series load/skip counts. A rejected export shows validation errors instead of attempting to render invalid data.

A smaller additional archive, `mxrap-viewer/test-data/test-export-big.zip`, is provided for testing. For an exact browser acceptance test, compare expected views with reference screenshots from the client; a successful import alone does not establish visual parity.

## What is implemented

| Area | Current MVP capability |
| --- | --- |
| Import | Browser-based selection of supported mXrap ZIP exports, structural/data-reference validation, error messages and import diagnostics |
| 3D geometry | Mine surfaces from vertices/faces, with view/camera navigation and per-layer visibility |
| Seismic/sensors | Point series, symbol and colour/size marker mapping, configurable legends, visibility and point inspection |
| Exploration | Numeric/date/category filtering, annotation controls, scene picker, per-scene camera handling and session-restoration support |
| RMQ | Interval line-series loading/rendering with RQD colouring, legend and line visibility controls |
| Charts | Parsed chart displays, a Chart tab, Magnitude–Time plot, multiple configured axes and per-series point/line toggles |
| Quality assurance | Vitest unit tests, ESLint and production build checks in GitHub Actions on `Development` |

**Scope qualification:** Feature presence is verified from the current `Development` source and merged PRs; the latest CI build passed, but complete visual browser testing and final client acceptance should be recorded separately.

## Supported input format

The project currently targets the **mXrap visualiser export ZIP schema** supplied for this capstone, rather than arbitrary mining datasets or generic standalone CSVs. An export typically contains:

```text
export.zip
├── info.json
├── data/
│   ├── <series>-vertices.csv
│   ├── <series>-faces.csv
│   └── <other referenced series>.csv
├── marker-defs/
│   └── ...
├── s1-3dview/config.json
├── s1-mag-time-chart/config.json
└── s2-3dview/config.json
```

Exact files and display folders depend on the export. The application follows slide/display configurations and reads relevant surface, point, annotation, line and chart references. Missing or malformed data can be reported as blocking errors or recoverable warnings. **A ZIP containing only charts and no 3D views is not currently supported by the main workspace.** The file picker advertises `.zip,.json`, but the implemented loading/validation path expects an mXrap ZIP archive; use ZIP files for the documented workflow.

Files are parsed in the browser using JSZip and Papa Parse. The team has not implemented server-side storage, database ingestion or streaming of extremely large export archives.

## Running the checks

From `mxrap-viewer/`:

```bash
npm ci
npm run lint
npm test
npm run build
```

For interactive test development, use `npm run test:watch`. The CI workflow at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs installation, lint, tests and build on Node.js 24. See [GitHub Actions](https://github.com/sharmashantanu319/Mining-3d-data-viewer/actions) for actual results; a passing CI run is not equivalent to client acceptance testing.

### Suggested manual acceptance checklist

- Import `visualiser-export-2.zip`; confirm surfaces, seismic markers and sensor symbols have the expected appearance.
- Switch to **RMQ 3D View**; confirm coloured interval lines appear, layer toggles work and camera controls remain usable.
- Hide/show surfaces and lines; check the visible scene and Fit Scene response.
- Open the **Chart** tab; confirm axes, event points, cumulative line and annotation; toggle Points/Lines and return to the 3D view.
- Check legends, marker changes, filter/reset behaviour and scene-dependent settings.
- Import a deliberately malformed ZIP; confirm readable errors rather than a blank view.
- Record browser/OS, dataset, expected vs actual results and screenshots in the final test/handover evidence.

## Project structure

```text
Mining-3d-data-viewer/
├── README.md                     # Repository entry point
├── docs/                         # Requirements and project documentation
├── meetings/                     # Client/team meeting records
├── tech-docs/                    # Technology evaluation documents
├── .github/workflows/ci.yml      # CI on Development
└── mxrap-viewer/
    ├── README.md                 # This application guide
    ├── package.json
    ├── app/
    │   ├── page.js               # Viewer orchestration and UI state
    │   └── components/           # Rendering, parsing, validation, charts, tests
    ├── test-data/                 # Example export ZIP archives
    └── vitest.config.mjs
```

**Core technologies:** Next.js 16, React 19, Three.js, JSZip, Papa Parse, Vitest and ESLint. Rendering and interface behaviour depend on the browser/WebGL implementation.

## Troubleshooting

| Problem | Action |
| --- | --- |
| `ENOENT` or `package.json` missing | Enter `mxrap-viewer/` before running npm commands. |
| PowerShell blocks `npm.ps1` | Use Windows Command Prompt (`cmd`) or run `npm.cmd` from PowerShell; do not change machine security policy just for this project. |
| Port 3000 is in use | Stop the other server, or use `npm run dev -- -p 3001` and open http://localhost:3001. |
| App opens with mock points | Select an export using **Open Export**; startup mock data is not the supplied client dataset. |
| ZIP fails validation | Confirm it is a supported mXrap export with `info.json`, referenced configs and data files; inspect the reported errors. |
| Chart tab missing | Load an export containing a chart display; the initial mock scene has no charts. |
| 3D scene appears blank/slow | Verify WebGL support, try the supplied test ZIP and reset/fit the camera; keep in mind that large exports may exceed browser memory. |

## Known limitations and future work

- **Browser validation:** RMQ, chart and visibility changes have source-level and automated-test evidence, but the team still needs to record full visual acceptance checks with the client's reference output. See [open issues](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues).
- **Large exports:** There is no agreed maximum file-size guard or streaming pipeline yet. Extremely large ZIPs may exhaust browser resources ([issue #101](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues/101)).
- **Partial desktop parity:** Not every mXrap display, chart behaviour or desktop workflow is implemented; some advanced chart cases are covered by unit tests but have not been verified using representative client exports.
- **Additional features:** Drag-and-drop import and image snapshots are in [PR #120](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/120) and [PR #121](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/121), respectively, and should not be represented as released before integration.
- **Release branches:** `Development` currently contains newer features than `main`; final handover should use a reviewed, tested release merge and updated documentation.

## Project evidence and handover

- [Business requirements](../docs/Business_Requirements_Analysis_Group12_.pdf)
- [Client meeting notes, 25 September 2026](../meetings/minutres-2026-09-24.md)
- [Chart scoping and design decisions](../docs/chart-module-scoping.md) — historical proposal; some choices changed during implementation
- [Three.js versus VTK.js technology analysis](../tech-docs/VTK.js%20vs%20Three.js%20-%20Technology%20Selection%20Analysis.docx)
- [Pull requests and implementation history](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pulls?q=is%3Apr)
- [Tracked issues and future work](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues)

### Responsible use of generative AI

The earlier application README explicitly recorded that a contributor used **Claude to assist in generating `test-export-big.zip`**, with subsequent browser testing. Any additional GenAI-assisted design, coding, tests or documentation must be disclosed accurately by the team in its final report, including how outputs were checked, modified and integrated. Do not treat model-generated code or sample data as independently verified solely because it was generated.

## Maintainers and licence

Group project repository: [sharmashantanu319/Mining-3d-data-viewer](https://github.com/sharmashantanu319/Mining-3d-data-viewer). Implementation history and reviews are available through [GitHub pull requests](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pulls?q=is%3Apr). No repository software licence is declared here; do not assume third-party reuse permissions.
