# Mining 3D Data Viewer — mXrap Web Viewer

A browser-based prototype for exploring underground mining data exported from **mXrap**. Developed for the CITS5206 group project, it brings 3D mine geometry, seismic events, sensor data, rock mass quality (RMQ) intervals and selected charts into one interactive workspace.

This folder holds the application: a Next.js 16 / React 19 single-page app that renders exports with Three.js. It has no backend: the export ZIP is unpacked (JSZip), its CSV files are parsed (Papa Parse) and validated, and every scene is rendered in the user's browser. For how to use each panel and control, see the [user guide](../docs/USER_GUIDE.md).

**Project status:** Working academic MVP, with further acceptance testing and handover checks required. The application reads supported mXrap export ZIP files locally in the browser; it is **not** a replacement for all desktop mXrap features.

## Quick start

**Requirements:** Node.js **24** (used in CI; 22.12 or later also works), npm (bundled with Node.js), Git and a modern desktop browser with WebGL enabled (recent Chrome, Edge, Firefox or Safari).

From a terminal:

```bash
git clone https://github.com/sharmashantanu319/Mining-3d-data-viewer.git
cd Mining-3d-data-viewer/mxrap-viewer
npm ci          # install the exact dependency versions from package-lock.json
npm run dev     # start the development server
```

Open **http://localhost:3000**. Stop the development server using `Ctrl+C`.

> **Important:** The Node.js application and `package.json` live in `mxrap-viewer/`, **not** at the repository root. If `npm` reports that it cannot find `package.json`, check your working directory. Pull requests are merged into `Development` first and released to `main` after review and testing.

## Production build and hosting

From `mxrap-viewer/`:

```bash
npm ci
npm run build   # compile an optimised production build into .next/
npm start       # serve it on http://localhost:3000 (use -p <port> for another port)
```

Because all processing happens in the browser, any host that can run a Next.js app works, for example [Vercel](https://vercel.com/docs/frameworks/nextjs) (import the repository and set the root directory to `mxrap-viewer`) or a server/VM running `npm start` behind a reverse proxy. No environment variables, database or storage are needed. No public hosted deployment is claimed here.

### Static website

Because everything runs in the browser, the viewer can also be built as a plain static website that needs no Node.js server to host:

1. In `next.config.mjs`, add `output: "export",` inside `nextConfig`.
2. Run `npm run build`. The site is written to `out/` (about 2 MB).
3. Copy the contents of `out/` to any static web host or web server. To try it locally: `python3 -m http.server 8080 --directory out`, then open http://localhost:8080.

`npm start` does not work while `output: "export"` is set, so leave the setting out when you want to use `npm start`. This was checked by serving `out/` from a plain static file server at the site root and loading `visualiser-export-2.zip` (3D view, chart and Colour by). Hosting under a sub-path, such as a GitHub Pages project site, also needs `basePath` in `next.config.mjs`; that case has not been tested.

The interface fonts (Inter and JetBrains Mono) are bundled in `app/fonts`, so building and running the viewer need no internet access once `npm ci` has installed the dependencies.

## Demonstration in under five minutes

1. Start the app. Its initial 3D scene is **mock demonstration data**, not evidence that an mXrap export has loaded.
2. Use **Open Export** (top bar) and select `mxrap-viewer/test-data/visualiser-export-2.zip` from this repository. The app validates the archive, then loads its supported displays. The file is selected through the browser; it is not loaded automatically.
3. In the **Scene** panel, switch between the available 3D views. Orbit/pan/zoom in the central viewport; use the viewport toolbar for **Fit**, **Reset**, the **Top**, **Front** and **Side** plan/section views, and the **Perspective** / **Orthographic** switch.
4. In **Layers**, toggle point, surface and RMQ line series as available. Use **Marker Style**, **Filters** and **Annotations** to adjust presentation. Hover/click event points for the corresponding information in the details panel. Controls depend on what the selected export contains.
5. When the uploaded export includes chart data, select the **Chart** tab to inspect the **Magnitude–Time** plot. Toggle the displayed point/line series, then return to **3D View**.
6. Expand the **Import report** if shown to inspect warnings and data-series load/skip counts. A rejected export shows validation errors instead of attempting to render invalid data.

A smaller additional archive, `mxrap-viewer/test-data/test-export-big.zip`, is provided for testing. For an exact browser acceptance test, compare expected views with reference screenshots from the client; a successful import alone does not establish visual parity.

## What is implemented

| Area | Current MVP capability |
| --- | --- |
| Import | Browser-based selection of supported mXrap ZIP exports, a configurable compressed-size limit, structural/data-reference validation, error messages and import diagnostics |
| 3D geometry | Mine surfaces from vertices/faces, with camera navigation (fit, reset, plan and section views, perspective/orthographic), a coordinate grid in orthographic plan and section views, an XYZ axis indicator and per-layer visibility |
| Seismic/sensors | Point series, symbol and colour/size marker mapping, configurable legends, visibility and point inspection |
| Exploration | Numeric/date/category filtering, annotation controls, scene picker, per-scene settings (each scene opens as exported and is remembered as you left it: camera, projection, layers, filters, marker style) and session-restoration support |
| RMQ | Interval line-series loading/rendering with RQD colouring, legend and line visibility controls |
| Charts | Parsed chart displays, a Chart tab, Magnitude–Time plot, multiple configured axes, per-series point/line toggles with axes that fit the shown series, and chart-only exports |
| Quality assurance | Vitest unit tests, ESLint and production build checks in GitHub Actions on every pull request and on pushes to `Development` and `main` |

**Scope qualification:** Feature presence is verified from the current source and merged PRs; CI checks lint, tests and the build, but complete visual browser testing and final client acceptance should be recorded separately.

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

Exact files and display folders depend on the export. The application follows slide/display configurations and reads relevant surface, point, annotation, line and chart references. Missing or malformed data can be reported as blocking errors or recoverable warnings. A ZIP with only charts and no 3D views opens straight on its charts. The file picker advertises `.zip,.json`, but the implemented loading/validation path expects an mXrap ZIP archive; use ZIP files for the documented workflow.

Files are parsed in the browser using JSZip and Papa Parse. The team has not implemented server-side storage, database ingestion or streaming of extremely large export archives.

## Import ZIP file-size limit

The viewer checks the **compressed ZIP input size** before JSZip decompresses it. The default is **100 MB (100,000,000 bytes)**. To change the limit, edit the tracked [`viewer.config.json`](viewer.config.json) file in this folder:

```json
{
  "imports": {
    "maxCompressedZipMB": 100
  }
}
```

Set `maxCompressedZipMB` to a positive number in **decimal MB**, then restart `npm run dev` or rebuild and redeploy the production application. No environment variable is required. Missing or invalid values fall back to 100 MB; keep the value finite and realistic for available browser memory.

A file larger than the limit is rejected with a readable validation error before decompression. This **does not limit the expanded ZIP size or bound memory use**: a small compressed ZIP can expand greatly. Very large exports still require size-aware/streamed loading beyond the current MVP.

## Running the checks

From `mxrap-viewer/`:

```bash
npm ci
npm run lint    # ESLint
npm test        # run all unit tests once (Vitest)
npm run build
```

For interactive test development, use `npm run test:watch`. The CI workflow at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs installation, lint, tests and build on Node.js 24 for every pull request and for pushes to `Development` and `main`. See [GitHub Actions](https://github.com/sharmashantanu319/Mining-3d-data-viewer/actions) for actual results; a passing CI run is not equivalent to client acceptance testing.

### Suggested manual acceptance checklist

- Import `visualiser-export-2.zip`; confirm surfaces, seismic markers and sensor symbols have the expected appearance.
- Switch to **RMQ 3D View**; confirm coloured interval lines appear, layer toggles work and camera controls remain usable.
- Hide/show surfaces and lines; check the visible scene and the Fit, Top, Front and Side responses.
- Open the **Chart** tab; confirm axes, event points, cumulative line and annotation; toggle Points/Lines and return to the 3D view.
- Check legends, marker changes, filter/reset behaviour and scene-dependent settings.
- Import a deliberately malformed ZIP; confirm readable errors rather than a blank view.
- Record browser/OS, dataset, expected vs actual results and screenshots in the final test/handover evidence.

## Project structure

```text
Mining-3d-data-viewer/
├── README.md                     # Repository entry point
├── docs/                         # Requirements, user guide and project documentation
├── meetings/                     # Client/team meeting records
├── tech-docs/                    # Technology evaluation documents
├── .github/workflows/ci.yml      # CI: lint, tests and build
└── mxrap-viewer/
    ├── README.md                 # This application guide
    ├── package.json
    ├── viewer.config.json        # Import ZIP size limit
    ├── app/                      # Application source (see below)
    ├── test-data/                # Example export ZIP archives
    └── vitest.config.mjs
```

Inside `app/`:

```text
app/
  page.js                 Application shell: state, file import, layout
  layout.js               Root layout
  globals.css             Styles and the bundled @font-face fonts
  fonts/                  Inter and JetBrains Mono (SIL Open Font License 1.1)
  components/
    *.jsx                 React components (Header, LeftSidebar, RightPanel, ThreeScene, ChartView, ...)
    parseExportFile.js    Reads info.json, scene configs and CSVs from the export
    validateExportFile.js Structural and data-reference checks before rendering
    *Builder.js           Turn parsed data into Three.js geometry (points, surfaces, lines, annotations)
    colour*/size*/marker* Colour and size mapping, legends and marker resolution
    chart*.js             Magnitude-Time chart parsing, scales and drawing
    __tests__/            Vitest unit tests (some load the real exports in test-data/)
```

Pure logic lives in plain `.js` modules so it can be unit-tested without a browser; React components only wire that logic to the UI.

**Core technologies:** Next.js 16, React 19, Three.js, JSZip, Papa Parse, Vitest and ESLint. Rendering and interface behaviour depend on the browser/WebGL implementation.

## Troubleshooting

| Problem | Action |
| --- | --- |
| `ENOENT` or `package.json` missing | Enter `mxrap-viewer/` before running npm commands. |
| PowerShell blocks `npm.ps1` | Use Windows Command Prompt (`cmd`) or run `npm.cmd` from PowerShell; do not change machine security policy just for this project. |
| Port 3000 is in use | Stop the other server, or use `npm run dev -- -p 3001` and open http://localhost:3001. |
| App opens with mock points | Select an export using **Open Export**; startup mock data is not the supplied client dataset. |
| ZIP fails validation | Confirm it is a supported mXrap export with `info.json`, referenced configs and data files; inspect the reported errors. |
| ZIP is rejected as too large | Raise `maxCompressedZipMB` in `viewer.config.json` (see [Import ZIP file-size limit](#import-zip-file-size-limit)), then restart or rebuild. |
| Chart tab missing | Load an export containing a chart display; the initial mock scene has no charts. |
| 3D scene appears blank/slow | Verify WebGL support, try the supplied test ZIP and reset/fit the camera; keep in mind that large exports may exceed browser memory. |

## Known limitations and future work

- **Large exports:** ZIP files above the compressed-size limit are rejected before decompression, but the expanded size is not bounded and the whole allowed export is held in browser memory, so high-compression archives may exhaust it even below the limit. There is no streaming pipeline ([issue #101](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues/101)). The largest export tested is the client's TestResponseViewer, 20.4 MB (92.8 MB uncompressed); load time and memory use for larger exports have not been measured.
- **Browsers:** The team's recorded browser checks used Chromium only. Firefox and Safari should work with WebGL enabled but have not been checked.
- **Interface tests:** React components and WebGL output have no automated tests; they are checked by hand in the browser.
- **Partial desktop parity:** Not every mXrap display or option is implemented, for example CIE colour spaces, clipping, a dashboard layout of several displays and slide text. Charts have been checked against two real exports (the sample and TestResponseViewer). The full list, with next steps, is in [Requirements status](../docs/REQUIREMENTS_STATUS.md).
- **Additional features:** Drag-and-drop import and image snapshots are in [PR #120](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/120) and [PR #121](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pull/121), respectively; their checks have not passed and they are not part of the release.
- **Release branches:** Pull requests are merged into `Development` and released to `main` after review and testing.

## Project evidence and handover

- [Business requirements](../docs/Business_Requirements_Analysis_Group12_.pdf)
- [Requirements status](../docs/REQUIREMENTS_STATUS.md): every requirement and client request, with what was delivered
- [Architecture](../docs/ARCHITECTURE.md): modules, data flow and design decisions
- [Client meeting notes, 25 September 2026](../meetings/minutres-2026-09-24.md)
- [Chart scoping and design decisions](../docs/chart-module-scoping.md) — historical proposal; some choices changed during implementation
- [Three.js versus VTK.js technology analysis](../tech-docs/VTK.js%20vs%20Three.js%20-%20Technology%20Selection%20Analysis.docx)
- [Pull requests and implementation history](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pulls?q=is%3Apr)
- [Tracked issues and future work](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues)

### Responsible use of generative AI

The earlier application README explicitly recorded that a contributor used **Claude to assist in generating `test-export-big.zip`**, with subsequent browser testing. Any additional GenAI-assisted design, coding, tests or documentation must be disclosed accurately by the team in its final report, including how outputs were checked, modified and integrated. Do not treat model-generated code or sample data as independently verified solely because it was generated.

## Maintainers and licence

Group project repository: [sharmashantanu319/Mining-3d-data-viewer](https://github.com/sharmashantanu319/Mining-3d-data-viewer). Implementation history and reviews are available through [GitHub pull requests](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pulls?q=is%3Apr). No repository software licence is declared here; do not assume third-party reuse permissions.
