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
// Scope: handles series.type === "surface", "points", and "text".
// Lines and chart series remain outside the viewer scope.

import JSZip from "jszip";
import Papa from "papaparse";
import { buildPointSeries } from "./pointSeriesData";
import { parseColourRampCsv } from "./colourMapping";

export async function parseExportFile(file) {
    const zip = await JSZip.loadAsync(file);
    const root = findArchiveRoot(zip);

    const infoEntry = zip.file(`${root}info.json`);
    if (!infoEntry) {
        throw new Error("Could not find top-level info.json");
    }
    const info = JSON.parse(await infoEntry.async("text"));

    const scenes = [];
    for (const slide of info.slides ?? []) {
        for (const displayRef of slide.displays ?? []) {
            const configEntry = zip.file(`${root}${displayRef.folder}/config.json`);
            if (!configEntry) {
                console.warn(`Skipping missing display: ${displayRef.folder}`);
                continue;
            }
            const config = JSON.parse(await configEntry.async("text"));

            if (config.type !== "3dview") {
                console.info(`Skipping non-3dview display: ${displayRef.folder} (type: ${config.type})`);
                continue;
            }

            const scene = await parseDisplayConfig(zip, displayRef, config, root);
            scenes.push(scene);
        }
    }

    return {
        title: info.title ?? "Untitled",
        scenes,
    };
}

async function parseDisplayConfig(zip, displayRef, config, root) {
    const surfaces = [];
    const pointClouds = [];
    const annotations = parseDisplayAnnotations(config.annotations, displayRef.folder);

    for (const series of config.series ?? []) {
        if (series.type === "surface") {
            const surface = await parseSurfaceSeries(zip, series, root);
            if (surface) surfaces.push(surface);
        } else if (series.type === "points") {
            const pointCloud = await parsePointSeries(zip, series, root);
            if (pointCloud) pointClouds.push(pointCloud);
        } else if (series.type === "text" || series.type === "annotation") {
            const seriesAnnotations = await parseAnnotationSeries(zip, series, root);
            annotations.push(...seriesAnnotations);
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
        annotations,
    };
}

function parseDisplayAnnotations(rawAnnotations, displayName) {
    if (!Array.isArray(rawAnnotations)) return [];

    return rawAnnotations.flatMap((rawAnnotation, index) => {
        const location = rawAnnotation?.location;
        const text = rawAnnotation?.text;
        if (
            !Array.isArray(location) ||
            location.length < 3 ||
            !location.slice(0, 3).every(Number.isFinite) ||
            text === undefined ||
            String(text).trim() === ""
        ) {
            console.warn(`Skipping invalid annotation ${index + 1} in display: ${displayName}`);
            return [];
        }

        return [{
            text: String(text),
            x: location[0],
            y: location[1],
            z: location[2],
            color: rawAnnotation.colour ?? rawAnnotation.color,
            faceCamera: true,
            render2d: false,
        }];
    });
}

async function parseAnnotationSeries(zip, series, root) {
    const rows = await readCsv(zip, series.data, root);
    if (!rows) {
        console.warn(`Skipping annotation series with missing data: ${series.name}`);
        return [];
    }

    return rows.flatMap((row) => {
        const x = firstFinite(row, ["X", "Location X", "x"]);
        const y = firstFinite(row, ["Y", "Location Y", "y"]);
        const z = firstFinite(row, ["Z", "Location Z", "z"]);
        const text = firstValue(row, ["Text", "Label", "Annotation", "Name", "Value"]);

        if (![x, y, z].every(Number.isFinite) || text === undefined || text === "") {
            console.warn(`Skipping invalid annotation row in series: ${series.name ?? "unnamed"}`);
            return [];
        }

        const annotation = {
            text: String(text),
            x,
            y,
            z,
            render2d: series.render2d === true,
            faceCamera: series.faceCamera === true,
        };

        const dip = firstFinite(row, ["Dip", "dip"]);
        const dipDirection = firstFinite(row, ["Dip Direction", "DipDirection", "dipDirection"]);
        const rake = firstFinite(row, ["Rake", "rake"]);

        if (Number.isFinite(dip)) annotation.dip = dip;
        if (Number.isFinite(dipDirection)) annotation.dipDirection = dipDirection;
        if (Number.isFinite(rake)) annotation.rake = rake;
        if (series.color !== undefined) annotation.color = series.color;
        if (series.background !== undefined) annotation.background = series.background;
        if (Number.isFinite(series.scale)) annotation.scale = series.scale;

        return [annotation];
    });
}

function firstValue(row, keys) {
    return keys.map((key) => row[key]).find((value) => value !== undefined && value !== null);
}

function firstFinite(row, keys) {
    return keys.map((key) => row[key]).find(Number.isFinite);
}

function findArchiveRoot(zip) {
    if (zip.file("info.json")) return "";
    if (zip.file("export/info.json")) return "export/";
    return "";
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

async function parseSurfaceSeries(zip, series, root) {
    const verticesCsv = await readCsv(zip, series["data-vertices"], root);
    const facesCsv = await readCsv(zip, series["data-faces"], root);

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

async function parsePointSeries(zip, series, root) {
    const rows = await readCsv(zip, series.data, root);
    if (!rows) {
        console.warn(`Skipping point series with missing data: ${series.name}`);
        return null;
    }

    const markerDefinitions = await loadMarkerDefinitions(zip, series.markerMenu, root);
    return buildPointSeries(rows, series, markerDefinitions);
}

// Loads marker-defs/<markerMenu>.json (an array of colour/size marker
// definitions) plus each definition's ramp CSV, found alongside it in the
// same marker-defs folder. Missing/malformed marker-defs degrade to no
// definitions (the series still renders, just without real colour/size
// mapping) rather than failing the whole parse.
function imageMimeType(fileName) {
    const extension = String(fileName).split(".").pop()?.toLowerCase();
    if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
    if (extension === "webp") return "image/webp";
    if (extension === "gif") return "image/gif";
    return "image/png";
}

async function loadMarkerDefinitions(zip, markerMenu, root = "") {
    if (!markerMenu) return [];

    const markerPath =
    `${root}marker-defs/${markerMenu}.json`;

    const jsonEntry = zip.file(markerPath);    if (!jsonEntry) {
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
    const imageCache = new Map();

    async function loadSymbolAsset(fileName) {
        if (!fileName) return null;
        if (imageCache.has(fileName)) return imageCache.get(fileName);

        const candidates = [
            `${root}marker-images/${fileName}`,
            `${root}marker-defs/${folder}/${fileName}`,
        ];
        const entry = candidates.map((path) => zip.file(path)).find(Boolean);
        if (!entry) {
            console.warn(`Marker symbol image not found: ${fileName}`);
            imageCache.set(fileName, null);
            return null;
        }

        const base64 = await entry.async("base64");
        const dataUrl = `data:${imageMimeType(fileName)};base64,${base64}`;
        imageCache.set(fileName, dataUrl);
        return dataUrl;
    }

    const resolved = [];
    for (const def of defs) {
        if (!def || typeof def !== "object") continue;

        let rampCsv = null;
        if (def.ramp) {
            const rampEntry = zip.file(`${root}marker-defs/${folder}/${def.ramp}`);
            if (rampEntry) {
                rampCsv = await rampEntry.async("text");
            } else {
                console.warn(`Marker ramp CSV not found: marker-defs/${folder}/${def.ramp}`);
            }
        }

        const symbolNames = new Set();
        if (def.nullSymbol) symbolNames.add(def.nullSymbol);
        if (rampCsv) {
            for (const segment of parseColourRampCsv(rampCsv).segments) {
                if (segment.symbol) symbolNames.add(segment.symbol);
            }
        }
        const symbolAssets = {};
        for (const symbolName of symbolNames) {
            const dataUrl = await loadSymbolAsset(symbolName);
            if (dataUrl) symbolAssets[symbolName] = dataUrl;
        }

        resolved.push({ ...def, rampCsv, symbolAssets });
    }
    return resolved;
}

async function readCsv(zip, fileRef, root = "") {
    if (!fileRef) return null;

    const entry = zip.file(`${root}data/${fileRef}.csv`);
    if (!entry) {
        console.warn(`CSV file not found: ${root}data/${fileRef}.csv`);
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
