"use client";

import { useMemo, useRef, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import FilterPanel from "./components/FilterPanel";
import { mockScenes } from "./components/mockScenes";
import { validateExportFile } from "./components/validateExportFile";
import { parseExportFile } from "./components/parseExportFile";
import {
  applyFiltersWithStats,
  applyNullVisibility,
  inferFilterFields,
} from "./components/dataFilters";

function colourMarkerInput(series) {
  if (!series?.colourMarker || !Array.isArray(series.markerDefinitions)) return null;
  return series.markerDefinitions.find((definition) => definition?.name === series.colourMarker)?.input ?? null;
}

export default function Home() {
  const [scenes, setScenes] = useState(mockScenes); // 初始用 mock 数据占位，上传真实文件后会替换
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [projectionMode, setProjectionMode] = useState("perspective");
  const [filtersBySeries, setFiltersBySeries] = useState({});
  const [selectedSeries, setSelectedSeries] = useState(0);
  const [seriesVisibility, setSeriesVisibility] = useState({});
  const [nullVisibility, setNullVisibility] = useState({});
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [annotationScale, setAnnotationScale] = useState(1);
  const threeSceneRef = useRef(null);

  const currentScene = scenes[currentIndex];
  const pointSeries = useMemo(() => currentScene.pointClouds ?? [], [currentScene]);
  const safeSelectedSeries = Math.min(selectedSeries, Math.max(0, pointSeries.length - 1));

  const filterResults = useMemo(
    () =>
      pointSeries.map((series, index) => {
        const filtered = applyFiltersWithStats(series.points ?? [], filtersBySeries[index] ?? []);
        const showNullValues = nullVisibility[index] ?? series.showNullColours !== false;
        return applyNullVisibility(filtered, colourMarkerInput(series), showNullValues);
      }),
    [pointSeries, filtersBySeries, nullVisibility]
  );

  const visiblePointClouds = useMemo(
    () =>
      pointSeries.map((series, index) => ({
        ...series,
        points:
          (seriesVisibility[index] ?? series.visible !== false)
            ? filterResults[index].included
            : [],
      })),
    [pointSeries, filterResults, seriesVisibility]
  );

  const selectedFields = useMemo(
    () => inferFilterFields(pointSeries[safeSelectedSeries]?.points ?? []),
    [pointSeries, safeSelectedSeries]
  );

  const selectedStats = filterResults[safeSelectedSeries] ?? {
    totalCount: 0,
    visibleCount: 0,
    missingCount: 0,
    invalidCount: 0,
  };

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrors([]);

    // 第一步：先做 Validate（只检查，不渲染）
    // Step 1: validate first (checks only, no rendering).
    const validation = await validateExportFile(file);
    if (!validation.valid) {
      setErrors(validation.errors);
      return; // 检查不通过，不继续往下解析/渲染
    }

    // 第二步：Validate 通过后，才真正解析并渲染
    // Step 2: only parse and render once validation passes.
    try {
      const parsed = await parseExportFile(file);
      setScenes(parsed.scenes);
      setCurrentIndex(0);
      setSelectedSeries(0);
      setFiltersBySeries({});
      setSeriesVisibility({});
      setNullVisibility({});
    } catch (err) {
      console.error(err);
      setErrors([err.message]);
    }
  }

  function toggleProjectionMode() {
    setProjectionMode((mode) => (mode === "perspective" ? "orthographic" : "perspective"));
  }

  function goToNextScene() {
    setCurrentIndex((prev) => (prev + 1) % scenes.length);
    setSelectedSeries(0);
    setFiltersBySeries({});
    setSeriesVisibility({});
    setNullVisibility({});
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header className="header">
        <div className="header-brand">
          <div className="logo">mX</div>

          <div>
            <h1>Mining 3D Data Viewer</h1>
            <p>mXrap export viewer</p>
          </div>
        </div>

        <label className="open-file-button">
          Open export

          <input
            type="file"
            accept=".zip,.json"
            onChange={handleFileChange}
          />
        </label>
      </header>

      <div style={{ position: "relative", flex: 1 }}>
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 10,
            background: "white",
            padding: "8px 12px",
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            fontFamily: "Arial, sans-serif",
            maxWidth: 420,
          }}
        >
          {fileName && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#555" }}>
              Loaded: {fileName}
            </div>
          )}

          {errors.length > 0 && (
            <div style={{ marginBottom: 8, color: "red", fontSize: 13 }}>
              <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                This file could not be loaded ({errors.length} issue{errors.length > 1 ? "s" : ""}):
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            Current scene: <strong>{currentScene.title}</strong>
          </div>
          <button onClick={goToNextScene} style={{ padding: "6px 12px", cursor: "pointer" }}>
            Next Scene
          </button>
          <button
            onClick={() => threeSceneRef.current?.resetView()}
            style={{ padding: "6px 12px", cursor: "pointer", marginLeft: 8 }}
          >
            Reset View
          </button>
          <button
            onClick={toggleProjectionMode}
            style={{ padding: "6px 12px", cursor: "pointer", marginLeft: 8 }}
          >
            {projectionMode === "perspective" ? "Switch to Orthographic" : "Switch to Perspective"}
          </button>

          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
            <button
              onClick={() => setAnnotationsVisible((visible) => !visible)}
              style={{ padding: "6px 12px", cursor: "pointer" }}
              aria-pressed={annotationsVisible}
            >
              {annotationsVisible ? "Hide annotations" : "Show annotations"}
            </button>
            <label style={{ display: "block", marginTop: 8, fontSize: 13 }}>
              Annotation size: {annotationScale.toFixed(1)}x
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={annotationScale}
                onChange={(event) => setAnnotationScale(Number(event.target.value))}
                style={{ display: "block", width: "100%" }}
                aria-label="Annotation size"
              />
            </label>
          </div>

        </div>

        {pointSeries.length > 0 && (
          <FilterPanel
            series={pointSeries}
            selectedSeries={safeSelectedSeries}
            onSelectSeries={setSelectedSeries}
            fields={selectedFields}
            filters={filtersBySeries[safeSelectedSeries] ?? []}
            stats={selectedStats}
            seriesVisible={
              seriesVisibility[safeSelectedSeries] ??
              pointSeries[safeSelectedSeries]?.visible !== false
            }
            onSeriesVisibleChange={(visible) =>
              setSeriesVisibility((current) => ({ ...current, [safeSelectedSeries]: visible }))
            }
            hasNullVisibility={Boolean(colourMarkerInput(pointSeries[safeSelectedSeries]))}
            showNullValues={
              nullVisibility[safeSelectedSeries] ??
              pointSeries[safeSelectedSeries]?.showNullColours !== false
            }
            onShowNullValuesChange={(visible) =>
              setNullVisibility((current) => ({ ...current, [safeSelectedSeries]: visible }))
            }
            onChange={(filters) =>
              setFiltersBySeries((current) => ({ ...current, [safeSelectedSeries]: filters }))
            }
            onReset={() =>
              setFiltersBySeries((current) => ({ ...current, [safeSelectedSeries]: [] }))
            }
          />
        )}

        <ThreeScene
          ref={threeSceneRef}
          sceneData={currentScene}
          visiblePointClouds={visiblePointClouds}
          projectionMode={projectionMode}
          annotationsVisible={annotationsVisible}
          annotationScale={annotationScale}
        />
      </div>
    </main>
  );
}
