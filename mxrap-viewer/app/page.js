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
import ColourLegendPanel from "./components/ColourLegendPanel";
import { buildSceneColourLegends } from "./components/colourLegend";
import MarkerSelectorPanel from "./components/MarkerSelectorPanel";
import { applyMarkerSelections } from "./components/markerSelection";
import styles from "./page.module.css";

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
  const [legendsVisible, setLegendsVisible] = useState(true);
  const [markerSelections, setMarkerSelections] = useState({});
  const [markerSeriesIndex, setMarkerSeriesIndex] = useState(0);
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

  const renderedPointClouds = useMemo(
    () => applyMarkerSelections(visiblePointClouds, markerSelections),
    [visiblePointClouds, markerSelections]
  );

  const colourLegends = useMemo(
    () => buildSceneColourLegends(renderedPointClouds),
    [renderedPointClouds]
  );

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
      setMarkerSelections({});
      setMarkerSeriesIndex(0);
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
    setMarkerSelections({});
    setMarkerSeriesIndex(0);
  }

  return (
    <main className={styles.viewerPage}>
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

      <div className={styles.workspace}>
        <aside className={styles.controlPanel} aria-label="Viewer controls">
          {fileName && (
            <div style={{ marginBottom: 6, fontSize: 12, color: "var(--color-fg-muted)" }}>
              Loaded: {fileName}
            </div>
          )}

          {errors.length > 0 && (
            <div style={{ marginBottom: 6, color: "var(--color-danger)", fontSize: 12 }}>
              <div style={{ fontWeight: "bold", marginBottom: 3 }}>
                This file could not be loaded ({errors.length} issue{errors.length > 1 ? "s" : ""}):
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: 6, fontSize: 13 }}>
            Current scene: <strong>{currentScene.title}</strong>
          </div>
          <button onClick={goToNextScene} style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
            Next Scene
          </button>
          <button
            onClick={() => threeSceneRef.current?.resetView()}
            style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", marginLeft: 6 }}
          >
            Reset View
          </button>
          <button
            onClick={toggleProjectionMode}
            style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", marginLeft: 6 }}
          >
            {projectionMode === "perspective" ? "Switch to Orthographic" : "Switch to Perspective"}
          </button>

          {colourLegends.length > 0 && (
            <button
              onClick={() => setLegendsVisible((visible) => !visible)}
              style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer", marginTop: 6 }}
              aria-pressed={legendsVisible}
            >
              {legendsVisible ? "Hide colour legend" : "Show colour legend"}
            </button>
          )}

          <MarkerSelectorPanel
            series={visiblePointClouds}
            selectedSeries={markerSeriesIndex}
            onSelectSeries={setMarkerSeriesIndex}
            selections={markerSelections}
            onSelectionChange={(seriesIndex, change) =>
              setMarkerSelections((current) => ({
                ...current,
                [seriesIndex]: { ...current[seriesIndex], ...change },
              }))
            }
          />

          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)" }}>
            <button
              onClick={() => setAnnotationsVisible((visible) => !visible)}
              style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
              aria-pressed={annotationsVisible}
            >
              {annotationsVisible ? "Hide annotations" : "Show annotations"}
            </button>
            <label style={{ display: "block", marginTop: 6, fontSize: 12 }}>
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
        </aside>

        <section className={styles.sceneViewport} aria-label="3D scene">
          <ThreeScene
            ref={threeSceneRef}
            sceneData={currentScene}
            visiblePointClouds={renderedPointClouds}
            projectionMode={projectionMode}
            annotationsVisible={annotationsVisible}
            annotationScale={annotationScale}
          />
        </section>
        {legendsVisible && <ColourLegendPanel legends={colourLegends} />}
      </div>
    </main>
  );
}
