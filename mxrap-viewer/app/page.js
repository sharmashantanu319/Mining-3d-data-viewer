"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { loadSession, saveSession, sessionKeyFor } from "./components/viewerSession";
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
  const [restoreBanner, setRestoreBanner] = useState(null); // { key, session } for the currently loaded file, if a saved session was found
  const threeSceneRef = useRef(null);
  const sessionKeyRef = useRef(null); // which file's session to save to, or null for the initial mock demo (not persisted)
  const cameraStateRef = useRef(null); // latest camera position/target, updated continuously as the user navigates
  const pendingCameraRestoreRef = useRef(null);
  const saveTimeoutRef = useRef(null);
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

  // Debounced (not on every keystroke/drag frame) session save, keyed to
  // whichever file is currently loaded. No-ops for the initial mock demo
  // (sessionKeyRef is only set once a real file is opened).
  function scheduleSessionSave() {
    if (!sessionKeyRef.current) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveSession(sessionKeyRef.current, {
        sceneIndex: currentIndex,
        filtersBySeries,
        seriesVisibility,
        nullVisibility,
        markerSelections,
        markerSeriesIndex,
        legendsVisible,
        annotationsVisible,
        annotationScale,
        projectionMode,
        camera: cameraStateRef.current,
      });
    }, 400);
  }

  useEffect(() => {
    scheduleSessionSave();
    return () => clearTimeout(saveTimeoutRef.current);
    // scheduleSessionSave is redefined every render (it closes over the
    // state below) rather than memoized, so it's deliberately left out of
    // this array — the actual state values below are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentIndex,
    filtersBySeries,
    seriesVisibility,
    nullVisibility,
    markerSelections,
    markerSeriesIndex,
    legendsVisible,
    annotationsVisible,
    annotationScale,
    projectionMode,
  ]);

  // Applies a camera restore once the scene it belongs to has actually
  // mounted (setCurrentIndex from applyRestoredSession() re-renders
  // ThreeScene with a new sceneData first, which resets the camera to that
  // scene's default — this runs after, overwriting it with the saved one).
  useEffect(() => {
    if (!pendingCameraRestoreRef.current) return;
    threeSceneRef.current?.setCameraState(pendingCameraRestoreRef.current);
    pendingCameraRestoreRef.current = null;
  }, [currentScene]);

  function applyRestoredSession(session) {
    if (Number.isInteger(session.sceneIndex)) setCurrentIndex(session.sceneIndex);
    if (session.filtersBySeries) setFiltersBySeries(session.filtersBySeries);
    if (session.seriesVisibility) setSeriesVisibility(session.seriesVisibility);
    if (session.nullVisibility) setNullVisibility(session.nullVisibility);
    if (session.markerSelections) setMarkerSelections(session.markerSelections);
    if (Number.isInteger(session.markerSeriesIndex)) setMarkerSeriesIndex(session.markerSeriesIndex);
    if (typeof session.legendsVisible === "boolean") setLegendsVisible(session.legendsVisible);
    if (typeof session.annotationsVisible === "boolean") setAnnotationsVisible(session.annotationsVisible);
    if (Number.isFinite(session.annotationScale)) setAnnotationScale(session.annotationScale);
    if (session.projectionMode) setProjectionMode(session.projectionMode);
    if (session.camera) pendingCameraRestoreRef.current = session.camera;
    setRestoreBanner(null);
  }

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

      sessionKeyRef.current = sessionKeyFor(file);
      setRestoreBanner(null);
      const saved = loadSession(sessionKeyRef.current);
      if (saved) setRestoreBanner({ key: sessionKeyRef.current, session: saved });
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
    setRestoreBanner(null);
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
            <div style={{ marginBottom: 8, fontSize: 13, color: "#555" }}>
              Loaded: {fileName}
            </div>
          )}

          {restoreBanner && (
            <div
              style={{
                marginBottom: 8,
                padding: 8,
                border: "1px solid #b6d7f0",
                borderRadius: 6,
                background: "#eef7ff",
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 6 }}>A previous session was found for this file.</div>
              <button
                onClick={() => applyRestoredSession(restoreBanner.session)}
                style={{ padding: "4px 10px", cursor: "pointer", marginRight: 8 }}
              >
                Restore
              </button>
              <button
                onClick={() => setRestoreBanner(null)}
                style={{ padding: "4px 10px", cursor: "pointer" }}
              >
                Start fresh
              </button>
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

          {colourLegends.length > 0 && (
            <button
              onClick={() => setLegendsVisible((visible) => !visible)}
              style={{ padding: "6px 12px", cursor: "pointer", marginTop: 8 }}
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
            onCameraChange={(state) => {
              cameraStateRef.current = state;
              scheduleSessionSave();
            }}
          />
        </section>
        {legendsVisible && <ColourLegendPanel legends={colourLegends} />}
      </div>
    </main>
  );
}
