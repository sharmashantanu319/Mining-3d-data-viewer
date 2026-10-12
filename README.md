# Mining 3D Data Viewer

A browser-based viewer for mXrap exports, built by CITS5206 Group 12 (UWA, Semester 2 2026)
for the Australian Centre for Geomechanics. Open an mXrap export `.zip` and explore its seismic
events, sensors, mine surfaces, annotations, RMQ intervals and Magnitude-Time charts in an
interactive 3D view, without an mXrap installation or licence.

All imported data is unpacked, parsed and rendered **in the browser**. The application has no
backend and no database, and it never uploads export data to a server.

## Quick start

Requires [Node.js](https://nodejs.org/) 22.12 or later (CI uses Node 24).

```bash
git clone https://github.com/sharmashantanu319/Mining-3d-data-viewer.git
cd Mining-3d-data-viewer
git checkout Development
cd mxrap-viewer
npm ci
npm run dev
```

Open <http://localhost:3000>, click **Open Export** (top right) and choose an export `.zip`.
A sample export is included at `mxrap-viewer/test-data/visualiser-export-2.zip`.

Full setup, build and hosting instructions are in [mxrap-viewer/README.md](mxrap-viewer/README.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [User guide](docs/USER_GUIDE.md) | How to load an export and use every panel and control |
| [Developer and deployment guide](mxrap-viewer/README.md) | Install, run, test, build and host the viewer; code layout |
| [Business requirements analysis](docs/Business_Requirements_Analysis_Group12_.pdf) | Client requirements and agreed MVP |
| [Chart module scoping](docs/chart-module-scoping.md) | Design of the Magnitude-Time chart |
| [Technology selection](tech-docs/) | VTK.js vs Three.js analysis |
| [Meeting minutes](meetings/) | Client and facilitator meetings |
| [Open issues](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues) | Known bugs and planned features |

## Repository layout

```text
mxrap-viewer/   Next.js application (source in app/, tests in app/components/__tests__/)
docs/           Requirements, user guide and design documents
tech-docs/      Technology selection analysis
meetings/       Meeting minutes
.github/        CI workflow (lint, test, build on every pull request)
```

`Development` is the integration branch and holds the latest delivered code.
