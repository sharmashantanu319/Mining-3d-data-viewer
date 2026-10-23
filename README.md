# Mining 3D Data Viewer (mXrap Web Viewer)

A browser-based viewer for mXrap exports, built by CITS5206 Group 12 (UWA, Semester 2 2026)
for the Australian Centre for Geomechanics. Open an mXrap export `.zip` and explore its mine
surfaces, seismic events, sensors, annotations, RMQ intervals and Magnitude-Time charts in an
interactive 3D workspace, without an mXrap installation or licence.

All imported data is unpacked, parsed and rendered **in the browser**. The application has no
backend and no database, and it never uploads export data to a server. It is a working academic
MVP, not a replacement for every desktop mXrap feature.

## Quick start

Requires Git, [Node.js](https://nodejs.org/) 24 (the version CI uses; 22.12 or later also
works), npm and a browser with WebGL enabled.

```bash
git clone https://github.com/sharmashantanu319/Mining-3d-data-viewer.git
cd Mining-3d-data-viewer/mxrap-viewer
npm ci
npm run dev
```

Open <http://localhost:3000>, click **Open Export** (top right) and choose
`mxrap-viewer/test-data/visualiser-export-2.zip` from the cloned repository (the path is
relative to the repository root, not the terminal's current folder). Until an export is opened,
the viewer shows built-in demo data.

`main` holds the released version. `Development` is the integration branch: pull requests are
merged there first and released to `main` after review and testing.

Full setup, build, hosting and troubleshooting instructions are in the
[application guide](mxrap-viewer/README.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [User guide](docs/USER_GUIDE.md) | How to load an export and use every panel and control |
| [Application guide](mxrap-viewer/README.md) | Install, run, test, build and host the viewer; supported input and known limitations |
| [Business requirements analysis](docs/Business_Requirements_Analysis_Group12_.pdf) | Client requirements and agreed MVP |
| [Requirements status](docs/REQUIREMENTS_STATUS.md) | Every requirement and client request, with what was delivered, what is partly done and suggested next steps |
| [Architecture](docs/ARCHITECTURE.md) | Modules, data flow from export to screen, and key design decisions |
| [Chart module scoping](docs/chart-module-scoping.md) | Design of the Magnitude-Time chart |
| [Technology selection](tech-docs/) | VTK.js vs Three.js analysis |
| [Meeting minutes](meetings/) | Client and facilitator meetings |
| [CI results](https://github.com/sharmashantanu319/Mining-3d-data-viewer/actions) | Lint, test and build runs |
| [Pull requests](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pulls?q=is%3Apr) | Implementation history and reviews |
| [Issues](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues) | Known bugs, limitations and planned features |

## Repository layout

```text
mxrap-viewer/   Next.js application (source in app/, tests in app/components/__tests__/)
docs/           Requirements and their status, user guide, architecture and design documents
tech-docs/      Technology selection analysis
meetings/       Meeting minutes
.github/        CI workflow (lint, test and build on every pull request)
```
