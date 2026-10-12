# Mining 3D Data Viewer (mXrap Web Viewer)

A CITS5206 group project that provides a browser-based workspace for exploring selected **mXrap underground-mining visualiser exports**: 3D mine surfaces, seismic events/sensor markers, RMQ intervals and a Magnitude–Time chart.

**Start here:** [Application README — installation, demonstration and user guide](mxrap-viewer/README.md).

## Quick setup (current Development MVP)

Requires Git, Node.js 24, npm and a WebGL-capable browser:

```bash
git clone https://github.com/sharmashantanu319/Mining-3d-data-viewer.git
cd Mining-3d-data-viewer
git switch Development
cd mxrap-viewer
npm ci
npm run dev
```

Open http://localhost:3000, then choose **Open Export** and select `mxrap-viewer/test-data/visualiser-export-2.zip` from the cloned repository (the file is relative to the **repository root**, not the current terminal directory). The startup scene uses mock data until an export is selected.

> `Development` has newer integrated chart, RMQ and import-validation features than `main`. Merge a tested final release to `main` before handing the repository to the client or marker.

## Project evidence

- [Business requirements](docs/Business_Requirements_Analysis_Group12_.pdf)
- [Recorded client meeting and action items](meetings/minutres-2026-09-24.md)
- [Chart design/scoping](docs/chart-module-scoping.md)
- [Technology selection analysis](tech-docs/VTK.js%20vs%20Three.js%20-%20Technology%20Selection%20Analysis.docx)
- [GitHub Actions checks](https://github.com/sharmashantanu319/Mining-3d-data-viewer/actions)
- [Issues, limitations and future work](https://github.com/sharmashantanu319/Mining-3d-data-viewer/issues)
- [Pull requests and reviews](https://github.com/sharmashantanu319/Mining-3d-data-viewer/pulls?q=is%3Apr)

For features, accepted input structure, automated tests, deployment, user instructions, troubleshooting, responsible GenAI disclosure and known limitations, see the [full application guide](mxrap-viewer/README.md).
