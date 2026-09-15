// Export file parser (v2)
// 负责把客户导出的 zip 文件，解析转换成 ThreeScene 组件需要的 sceneData 格式
//
// 这一版完全基于真实样例数据（visualiser-export-2.zip）的结构重写，
// 取代了最初基于 8.13 会议假设写的旧版本。
// This version is rewritten entirely against the real sample export
// file's structure, replacing the earlier version based on 8.13 meeting
// assumptions.
//
// 真实结构 / Real structure:
//   export.zip
//   ├── info.json                 顶层：version/title/date/creator/slides[]
//   ├── data/                     所有 CSV 数据都在这里
//   │   ├── s1-mgm-vertices.csv   顶点表：ID, Location X, Location Y, Location Z, ...
//   │   ├── s1-mgm-faces.csv      面片表：V1, V2, V3
//   │   └── ...
//   ├── marker-defs/              颜色/marker 定义（本版本暂不处理）
//   ├── s1-3dview/config.json     一个 display：type, camera, series[]
//   ├── s1-mag-time-chart/...     图表类型 display（本版本跳过，非 MVP 范围）
//   └── s2-3dview/config.json     另一个 display
//
// Scope: handles series.type === "surface" and "points". Text / Lines /
// Chart series are skipped with a console notice; they are follow-up tasks.
//
// A points series also carries a `markerMenu` (e.g. "events/markers"),
// pointing at marker-defs/<markerMenu>.json — the real colour/size marker
// definitions (ramp CSVs + thresholds) that pointMarkerResolver.js turns
// into real per-point colour/size, via colourMapping.js/sizeMapping.js.
// This is loaded for points series only; surfaces still render with a flat
// colour (their own colourMarker wiring is a separate follow-up).

import JSZip from "jszip";
import Papa from "papaparse";
import { buildPointSeries } from "./pointSeriesData";

export async function parseExportFile(file) {
    const zip = await JSZip.loadAsync(file);

    const infoEntry = zip.file("info.json");
    if (!infoEntry) {
        throw new Error("Could not find top-level info.json");
    }
    const info = JSON.parse(await infoEntry.async("text"));

    const scenes = [];
    for (const slide of info.slides ?? []) {
        for (const displayRef of slide.displays ?? []) {
            const configEntry = zip.file(`${displayRef.folder}/config.json`);
            if (!configEntry) {
                console.warn(`Skipping missing display: ${displayRef.folder}`);
                continue;
            }
            const config = JSON.parse(await configEntry.async("text"));

            if (config.type !== "3dview") {
                console.info(`Skipping non-3dview display: ${displayRef.folder} (type: ${config.type})`);
                continue;
            }

            const scene = await parseDisplayConfig(zip, displayRef, config);
            scenes.push(scene);
        }
    }

    return {
        title: info.title ?? "Untitled",
        scenes,
    };
}

async function parseDisplayConfig(zip, displayRef, config) {
    const surfaces = [];
    const pointClouds = [];

    for (const series of config.series ?? []) {
        if (series.type === "surface") {
            const surface = await parseSurfaceSeries(zip, series);
            if (surface) surfaces.push(surface);
        } else if (series.type === "points") {
            const pointCloud = await parsePointSeries(zip, series);
            if (pointCloud) pointClouds.push(pointCloud);
        } else {
            console.info(`Skipping series type "${series.type}" (out of scope)`);
        }
    }

    return {
        id: displayRef.folder,
        title: displayRef.title ?? displayRef.folder,
        camera: parseCameraConfig(config.camera),
        surfaces,
        pointClouds,
    };
}

function parseCameraConfig(camera) {
    const toVec = (arr, fallback) => {
        if (!Array.isArray(arr) || arr.length < 3) return fallback;
        return { x: arr[0], y: arr[1], z: arr[2] };
    };

    return {
        position: toVec(camera?.Position, { x: 3, y: 3, z: 5 }),
        focal: toVec(camera?.Focal, { x: 0, y: 0, z: 0 }),
        up: toVec(camera?.Up, { x: 0, y: 1, z: 0 }),
    };
}

async function parseSurfaceSeries(zip, series) {
    const verticesCsv = await readCsv(zip, series["data-vertices"]);
    const facesCsv = await readCsv(zip, series["data-faces"]);

    if (!verticesCsv || !facesCsv) {
        console.warn(`Skipping surface series with missing data: ${series.name}`);
        return null;
    }

    const vertices = verticesCsv.map((row) => ({
        id: row["ID"],
        x: row["Location X"],
        y: row["Location Y"],
        z: row["Location Z"],
    }));

    const faces = facesCsv.map((row) => ({
        v1: row["V1"],
        v2: row["V2"],
        v3: row["V3"],
    }));

    return {
        color: 0x4f8ef7,
        vertices,
        faces,
    };
}

async function parsePointSeries(zip, series) {
    const rows = await readCsv(zip, series.data);
    if (!rows) {
        console.warn(`Skipping point series with missing data: ${series.name}`);
        return null;
    }

    const markerDefinitions = await loadMarkerDefinitions(zip, series.markerMenu);
    return buildPointSeries(rows, series, markerDefinitions);
}

// Loads marker-defs/<markerMenu>.json (an array of colour/size marker
// definitions) plus each definition's ramp CSV, found alongside it in the
// same marker-defs folder. Missing/malformed marker-defs degrade to no
// definitions (the series still renders, just without real colour/size
// mapping) rather than failing the whole parse.
async function loadMarkerDefinitions(zip, markerMenu) {
    if (!markerMenu) return [];

    const jsonEntry = zip.file(`marker-defs/${markerMenu}.json`);
    if (!jsonEntry) {
        console.warn(`Marker definitions not found: marker-defs/${markerMenu}.json`);
        return [];
    }

    let defs;
    try {
        defs = JSON.parse(await jsonEntry.async("text"));
    } catch (err) {
        console.warn(`Could not parse marker-defs/${markerMenu}.json: ${err.message}`);
        return [];
    }
    if (!Array.isArray(defs)) return [];

    const folder = markerMenu.split("/").slice(0, -1).join("/");
    const resolved = [];
    for (const def of defs) {
        if (!def || typeof def !== "object") continue;

        let rampCsv = null;
        if (def.ramp) {
            const rampEntry = zip.file(`marker-defs/${folder}/${def.ramp}`);
            if (rampEntry) {
                rampCsv = await rampEntry.async("text");
            } else {
                console.warn(`Marker ramp CSV not found: marker-defs/${folder}/${def.ramp}`);
            }
        }
        resolved.push({ ...def, rampCsv });
    }
    return resolved;
}

async function readCsv(zip, fileRef) {
    if (!fileRef) return null;

    const entry = zip.file(`data/${fileRef}.csv`);
    if (!entry) {
        console.warn(`CSV file not found: data/${fileRef}.csv`);
        return null;
    }

    const text = await entry.async("text");
    const parsed = Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
    });

    return parsed.data;
}