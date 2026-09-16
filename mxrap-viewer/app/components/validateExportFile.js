// Export file validator
// 负责在真正解析/渲染之前，检查用户上传的文件是否合法、完整。
// 检查通过后返回 { valid: true }，检查不通过返回
// { valid: false, errors: [...] }，把所有发现的问题一次性汇总，
// 而不是遇到第一个问题就中断（这样用户一次上传就能看到所有问题，
// 不用改一个报一个、反复上传）。
//
// This validator checks that an uploaded export file is well-formed
// BEFORE parsing/rendering. On success it returns { valid: true }; on
// failure it returns { valid: false, errors: [...] } with ALL problems
// collected in one pass, rather than stopping at the first issue — so
// the user sees every problem after a single upload, instead of fixing
// one and re-uploading repeatedly.
//
// 分两层检查 / Two layers of checks:
// 1. 结构完整性（Structural）：info.json 存在且能解析、每个 slide
//    引用的 display 文件夹和 config.json 是否存在
// 2. 数据引用完整性（Data-reference）：surface/text 引用的 CSV 是否存在、
//    能否解析，以及 surface faces / text coordinates 是否有效
//
// 范围说明 / Scope note: points/lines/chart remain outside this validator.

import JSZip from "jszip";
import Papa from "papaparse";

/**
 * @typedef {{ valid: boolean, errors: string[] }} ValidationResult
 */

/**
 * 校验一份导出 zip 文件。
 * @param {File|Buffer} file
 * @returns {Promise<ValidationResult>}
 */
export async function validateExportFile(file) {
    const errors = [];

    let zip;
    try {
        zip = await JSZip.loadAsync(file);
    } catch (err) {
        // zip 本身都打不开，后面所有检查都没有意义，直接返回
        return { valid: false, errors: ["File is not a valid zip archive."] };
    }

    // ---------- 第一层：结构完整性 ----------
    const root = zip.file("info.json") ? "" : zip.file("export/info.json") ? "export/" : "";
    const infoEntry = zip.file(`${root}info.json`);
    if (!infoEntry) {
        errors.push("Missing top-level info.json.");
        // info.json 都没有，后面基于它的所有检查都做不了，直接返回
        return { valid: false, errors };
    }

    let info;
    try {
        info = JSON.parse(await infoEntry.async("text"));
    } catch (err) {
        errors.push("info.json is not valid JSON.");
        return { valid: false, errors };
    }

    if (!Array.isArray(info.slides) || info.slides.length === 0) {
        errors.push("info.json has no slides defined.");
        return { valid: false, errors };
    }

    // 收集所有存在的 display，供第二层检查使用
    const validDisplays = [];

    info.slides.forEach((slide, slideIndex) => {
        if (!Array.isArray(slide.displays) || slide.displays.length === 0) {
            errors.push(`Slide ${slideIndex + 1} ("${slide.title ?? "untitled"}") has no displays.`);
            return;
        }

        slide.displays.forEach((displayRef) => {
            const folder = displayRef.folder;
            if (!folder) {
                errors.push(`Slide ${slideIndex + 1} has a display with no "folder" specified.`);
                return;
            }

            const configEntry = zip.file(`${root}${folder}/config.json`);
            if (!configEntry) {
                errors.push(`Display "${folder}" is missing its config.json.`);
                return;
            }

            validDisplays.push({ folder, configEntry, root });
        });
    });

    // ---------- 第二层：数据引用完整性 ----------
    // 只对结构上已经确认存在的 display 做进一步检查
    for (const { folder, configEntry, root: displayRoot } of validDisplays) {
        let config;
        try {
            config = JSON.parse(await configEntry.async("text"));
        } catch (err) {
            errors.push(`"${folder}/config.json" is not valid JSON.`);
            continue;
        }

        if (config.type !== "3dview") {
            // chart 等非 3D 视图类型不在本次校验范围内
            continue;
        }

        errors.push(...checkDisplayAnnotations(config.annotations, `${folder} > annotations`));

        for (const series of config.series ?? []) {
            const seriesLabel = series.name ?? "unnamed series";
            if (series.type === "surface") {
                const verticesResult = await checkCsvExists(zip, series["data-vertices"], `${folder} > ${seriesLabel} vertices`, displayRoot);
                const facesResult = await checkCsvExists(zip, series["data-faces"], `${folder} > ${seriesLabel} faces`, displayRoot);

                errors.push(...verticesResult.errors);
                errors.push(...facesResult.errors);

                if (verticesResult.rows && facesResult.rows) {
                    const idErrors = checkFaceVertexReferences(verticesResult.rows, facesResult.rows, `${folder} > ${seriesLabel}`);
                    errors.push(...idErrors);
                }
            } else if (series.type === "text" || series.type === "annotation") {
                const textResult = await checkCsvExists(zip, series.data, `${folder} > ${seriesLabel} annotations`, displayRoot);
                errors.push(...textResult.errors);
                if (textResult.rows) {
                    errors.push(...checkAnnotationRows(textResult.rows, series, `${folder} > ${seriesLabel}`));
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * 检查一个 CSV 引用是否存在、能否被正常解析。
 * @returns {Promise<{ rows: object[]|null, errors: string[] }>}
 */
async function checkCsvExists(zip, fileRef, label, root = "") {
    if (!fileRef) {
        return { rows: null, errors: [`${label}: no data file referenced.`] };
    }

    const entry = zip.file(`${root}data/${fileRef}.csv`);
    if (!entry) {
        return { rows: null, errors: [`${label}: file "${root}data/${fileRef}.csv" not found.`] };
    }

    const text = await entry.async("text");
    const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });

    if (parsed.errors.length > 0) {
        return { rows: null, errors: [`${label}: CSV parse error in "${root}data/${fileRef}.csv".`] };
    }
    if (parsed.data.length === 0) {
        return { rows: null, errors: [`${label}: "${root}data/${fileRef}.csv" has no data rows.`] };
    }

    return { rows: parsed.data, errors: [] };
}

/**
 * 检查 faces 表里引用的顶点 ID，是否都能在 vertices 表里找到。
 * @returns {string[]} 错误信息列表（每个找不到的引用一条，最多列出前 5 条，
 *   避免一个文件里成百上千个坏引用时报告过长）
 */
function checkFaceVertexReferences(vertices, faces, label) {
    const knownIds = new Set(vertices.map((v) => v.ID));
    const missing = [];

    faces.forEach((face, index) => {
        for (const key of ["V1", "V2", "V3"]) {
            const id = face[key];
            if (!knownIds.has(id)) {
                missing.push(`${label}: face row ${index + 1} references unknown vertex ID "${id}" (column ${key}).`);
            }
        }
    });

    if (missing.length > 5) {
        return [...missing.slice(0, 5), `${label}: ...and ${missing.length - 5} more invalid vertex references.`];
    }
    return missing;
}

function checkAnnotationRows(rows, series, label) {
    const errors = [];
    const requiredColumns = [
        ["X", "Location X", "x"],
        ["Y", "Location Y", "y"],
        ["Z", "Location Z", "z"],
        ["Text", "Label", "Annotation", "Name", "Value"],
    ];

    requiredColumns.forEach((columns) => {
        if (!hasColumn(rows, columns)) {
            errors.push(`${label}: annotation CSV is missing one of: ${columns.join(", ")}.`);
        }
    });

    if (series.render2d !== true && series.faceCamera !== true) {
        for (const columns of [["Dip", "dip"], ["Dip Direction", "DipDirection", "dipDirection"], ["Rake", "rake"]]) {
            if (!hasColumn(rows, columns)) {
                errors.push(`${label}: fixed 3D annotations require a "${columns[0]}" column.`);
            }
        }
    }

    rows.forEach((row, index) => {
        const coordinates = [
            firstFinite(row, ["X", "Location X", "x"]),
            firstFinite(row, ["Y", "Location Y", "y"]),
            firstFinite(row, ["Z", "Location Z", "z"]),
        ];
        const text = firstValue(row, ["Text", "Label", "Annotation", "Name", "Value"]);
        if (!coordinates.every(Number.isFinite)) {
            errors.push(`${label}: row ${index + 1} has invalid annotation coordinates.`);
        }
        if (text === undefined || text === null || String(text).trim() === "") {
            errors.push(`${label}: row ${index + 1} has no annotation text.`);
        }
    });

    return errors;
}

function hasColumn(rows, candidates) {
    return rows.some((row) => candidates.some((column) => Object.prototype.hasOwnProperty.call(row, column)));
}

function firstValue(row, keys) {
    return keys.map((key) => row[key]).find((value) => value !== undefined && value !== null);
}

function firstFinite(row, keys) {
    return keys.map((key) => row[key]).find(Number.isFinite);
}

function checkDisplayAnnotations(annotations, label) {
    if (annotations === undefined) return [];
    if (!Array.isArray(annotations)) return [`${label}: annotations must be an array.`];

    const errors = [];
    annotations.forEach((annotation, index) => {
        const location = annotation?.location;
        const text = annotation?.text;
        if (!Array.isArray(location) || location.length < 3 || !location.slice(0, 3).every(Number.isFinite)) {
            errors.push(`${label}: annotation ${index + 1} has invalid location.`);
        }
        if (text === undefined || text === null || String(text).trim() === "") {
            errors.push(`${label}: annotation ${index + 1} has no text.`);
        }
    });
    return errors;
}