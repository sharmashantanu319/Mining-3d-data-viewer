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
import PointInspectionPanel from "./components/PointInspectionPanel";
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
  const [isLoadingExport, setIsLoadingExport] = useState(false);
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
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const threeSceneRef = useRef(null);
  const currentScene = scenes[currentIndex];
  const pointSeries = useMemo(() => currentScene.pointClouds ?? [], [currentScene]);
  const safeSelectedSeries = Math.min(selectedSeries, Math.max(0, pointSeries.length - 1));
  const sceneSurfaceCount = currentScene.surfaces?.length ?? 0;
  const sceneTotalPointCount = useMemo(
    () => pointSeries.reduce((total, series) => total + (series.points?.length ?? 0), 0),
    [pointSeries]
  );

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

  // Selection survives a filter/visibility change as long as the selected
  // point is still among the rendered rows for its series; otherwise it
  // reads as cleared rather than pointing at data that is no longer on
  // screen (the underlying selection is left alone, so it reappears if the
  // point becomes visible again, e.g. a filter is relaxed).
  const activeSelectedPoint = useMemo(() => {
    if (!selectedPoint) return null;
    const series = renderedPointClouds[selectedPoint.seriesIndex];
    // Matched by object identity, not sourceIndex: mock/demo scenes don't
    // carry a sourceIndex on their points (only real parsed exports do, via
    // pointSeriesData.js), but filtering (dataFilters.js) and marker
    // selection (markerSelection.js) both pass the original point objects
    // through untouched, so identity is a reliable check either way.
    const stillVisible = series?.points?.includes(selectedPoint.point);
    return stillVisible ? selectedPoint : null;
  }, [renderedPointClouds, selectedPoint]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrors([]);
    setIsLoadingExport(true);

    try {
      // 第一步：先做 Validate（只检查，不渲染）
      // Step 1: validate first (checks only, no rendering).
      const validation = await validateExportFile(file);
      if (!validation.valid) {
        setErrors(validation.errors);
        return; // 检查不通过，不继续往下解析/渲染
      }

      // 第二步：Validate 通过后，才真正解析并渲染
      // Step 2: only parse and render once validation passes.
      const parsed = await parseExportFile(file);
      setScenes(parsed.scenes);
      setCurrentIndex(0);
      setSelectedSeries(0);
      setFiltersBySeries({});
      setSeriesVisibility({});
      setNullVisibility({});
      setMarkerSelections({});
      setMarkerSeriesIndex(0);
      setHoveredPoint(null);
      setSelectedPoint(null);
    } catch (err) {
      console.error(err);
      setErrors([err.message]);
    } finally {
      setIsLoadingExport(false);
    }
  }

  function toggleProjectionMode() {
    setProjectionMode((mode) => (mode === "perspective" ? "orthographic" : "perspective"));
  }

  function switchToScene(index) {
    setCurrentIndex(index);
    setSelectedSeries(0);
    setFiltersBySeries({});
    setSeriesVisibility({});
    setNullVisibility({});
    setMarkerSelections({});
    setMarkerSeriesIndex(0);
    setHoveredPoint(null);
    setSelectedPoint(null);
  }

  function goToNextScene() {
    switchToScene((currentIndex + 1) % scenes.length);
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

        <label className="open-file-button" aria-disabled={isLoadingExport}>
          {isLoadingExport ? "Loading…" : "Open export"}

          <input
            type="file"
            accept=".zip,.json"
            onChange={handleFileChange}
            disabled={isLoadingExport}
          />
        </label>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.controlPanel} aria-label="Viewer controls">
          {fileName && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#555" }}>
              Loaded: {fileName}
            </div>
          )}

          {isLoadingExport && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#364139" }} role="status">
              Loading and validating export…
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

          <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: "bold" }}>
            Scene
            <select
              value={currentIndex}
              onChange={(event) => switchToScene(Number(event.target.value))}
              style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 8px", fontSize: 13 }}
            >
              {scenes.map((scene, index) => (
                <option key={scene.id ?? index} value={index}>
                  {scene.title}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginBottom: 8, fontSize: 12, color: "#68756c" }}>
            {sceneTotalPointCount} point{sceneTotalPointCount === 1 ? "" : "s"} · {sceneSurfaceCount} surface
            {sceneSurfaceCount === 1 ? "" : "s"}
          </div>
          <div className={styles.actionRow}>
            <button onClick={goToNextScene} className={styles.actionButton}>
              Next Scene
            </button>
            <button
              onClick={() => threeSceneRef.current?.resetView()}
              className={styles.actionButton}
            >
              Reset View
            </button>
            <button onClick={toggleProjectionMode} className={styles.actionButton}>
              {projectionMode === "perspective" ? "Switch to Orthographic" : "Switch to Perspective"}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#68756c" }}>
            Camera mode: {projectionMode === "perspective" ? "Perspective" : "Orthographic"}
          </div>

          {colourLegends.length > 0 && (
            <div className={styles.actionRow} style={{ marginTop: 8 }}>
              <button
                onClick={() => setLegendsVisible((visible) => !visible)}
                className={styles.actionButton}
                aria-pressed={legendsVisible}
              >
                {legendsVisible ? "Hide colour legend" : "Show colour legend"}
              </button>
            </div>
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
            onRestoreDefaults={(seriesIndex) =>
              setMarkerSelections((current) => {
                const next = { ...current };
                delete next[seriesIndex];
                return next;
              })
            }
          />

          <PointInspectionPanel
            inspection={activeSelectedPoint ?? hoveredPoint}
            kind={activeSelectedPoint ? "selected" : "hovered"}
            onClear={() => setSelectedPoint(null)}
          />

          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
            <button
              onClick={() => setAnnotationsVisible((visible) => !visible)}
              className={styles.actionButton}
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

          {pointSeries.length === 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd", fontSize: 13, color: "#555" }}>
              This scene has no point series to filter or inspect.
            </div>
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
            selectedPoint={activeSelectedPoint}
            onPointHover={setHoveredPoint}
            onPointSelect={setSelectedPoint}
          />
        </section>
        {legendsVisible && <ColourLegendPanel legends={colourLegends} />}
      </div>
    </main>
  );
}
