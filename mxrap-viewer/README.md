This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


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