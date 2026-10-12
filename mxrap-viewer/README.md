# mXrap Viewer: developer and deployment guide

This folder holds the Mining 3D Data Viewer, a Next.js 16 / React 19 single-page application
that renders mXrap exports with Three.js. It has no backend: the export `.zip` is unpacked
(JSZip), its CSV files are parsed (PapaParse) and validated, and every scene is rendered in the
user's browser. For how to *use* the viewer, see the [user guide](../docs/USER_GUIDE.md).

## Requirements

- Node.js 22.12 or later (Next.js 16 and Vitest 5 both require it; CI uses Node 24)
- npm (bundled with Node.js)
- A desktop browser with WebGL enabled (recent Chrome, Edge, Firefox or Safari)

## Run locally

```bash
cd mxrap-viewer
npm ci          # install the exact dependency versions from package-lock.json
npm run dev     # start the development server
```

Open <http://localhost:3000> and click **Open Export**. A sample export is included in
`test-data/visualiser-export-2.zip` (two scenes, 5,903 seismic events, 71 sensors, a mine
surface, RMQ intervals and a Magnitude-Time chart). Before an export is opened the viewer
shows built-in demo data.

## Production build and hosting

```bash
npm run build   # compile an optimised production build into .next/
npm start       # serve it on http://localhost:3000 (use -p <port> for another port)
```

Because all processing happens in the browser, any host that can run a Next.js app works,
for example [Vercel](https://vercel.com/docs/frameworks/nextjs) (import the repository and set
the root directory to `mxrap-viewer`) or a server/VM running `npm start` behind a reverse
proxy. No environment variables, database or storage are needed.

The build downloads the Geist font from Google Fonts, so the build machine needs internet
access.

## Test and lint

```bash
npm test        # run all unit tests once (Vitest)
npm run lint    # ESLint
```

The [CI workflow](../.github/workflows/ci.yml) runs `npm ci`, lint, tests and a production build
on every pull request and on pushes to `Development`.

## Code layout

```text
app/
  page.js                 Application shell: state, file import, layout
  layout.js               Root layout and fonts
  components/
    *.jsx                 React components (Header, LeftSidebar, RightPanel, ThreeScene, ChartView, ...)
    parseExportFile.js    Reads info.json, scene configs and CSVs from the export
    validateExportFile.js Structural and data-reference checks before rendering
    *Builder.js           Turn parsed data into Three.js geometry (points, surfaces, lines, annotations)
    colour*/size*/marker* Colour and size mapping, legends and marker resolution
    chart*.js             Magnitude-Time chart parsing, scales and drawing
    __tests__/            Vitest unit tests (some load the real exports in test-data/)
test-data/                Sample exports used for manual and automated testing
```

Pure logic lives in plain `.js` modules so it can be unit-tested without a browser; React
components only wire that logic to the UI.

## Known limitations

- The whole export is held in browser memory, so very large exports may exhaust it.
- React components and WebGL output have no automated tests; they are checked manually.
- See the [issue list](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues) for
  open bugs and planned features.

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