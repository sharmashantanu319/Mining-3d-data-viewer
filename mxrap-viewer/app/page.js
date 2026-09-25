"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import Header from "./components/Header";
import { LeftSidebar, ANNOTATION_FONT_CHOICES } from "./components/LeftSidebar";
import { RightPanel } from "./components/RightPanel";
import { StatusBar } from "./components/StatusBar";
import { mockScenes } from "./components/mockScenes";
import { validateExportFile } from "./components/validateExportFile";
import { parseExportFile } from "./components/parseExportFile";
import { resolveLabelStyle, BARE_TEXT_COLOR } from "./components/annotationsBuilder";
import {
  applyFiltersWithStats,
  applyNullVisibility,
  inferFilterFields,
} from "./components/dataFilters";
import { buildColourLegend } from "./components/colourLegend";
import { getMarkerChoices, applyMarkerSelections } from "./components/markerSelection";
import { resolveMarkerRenderOptions } from "./components/pointMarkerResolver";
import { IconFitView, IconPerspective, IconOrtho, IconRefresh } from "./components/icons";
import { loadSession, saveSession, sessionKeyFor } from "./components/viewerSession";

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
  const [annotationFont, setAnnotationFont] = useState(null);
  const [annotationTextColor, setAnnotationTextColor] = useState(null);
  const [annotationBackgroundColor, setAnnotationBackgroundColor] = useState(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [markerSelections, setMarkerSelections] = useState({});
  const [markerSeriesIndex, setMarkerSeriesIndex] = useState(0);
  const [markerScale, setMarkerScale] = useState(0.5);
  const [restoreBanner, setRestoreBanner] = useState(null); // { key, session } for the currently loaded file, if a saved session was found
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const threeSceneRef = useRef(null);
  const sessionKeyRef = useRef(null); // which file's session to save to, or null for the initial mock demo (not persisted)
  const cameraStateRef = useRef(null); // latest camera position/target, updated continuously as the user navigates
  const pendingCameraRestoreRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const currentScene = scenes[currentIndex];
  const pointSeries = useMemo(() => currentScene.pointClouds ?? [], [currentScene]);
  const safeSelectedSeries = Math.min(selectedSeries, Math.max(0, pointSeries.length - 1));
  const safeMarkerSeriesIndex = Math.min(markerSeriesIndex, Math.max(0, pointSeries.length - 1));
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

  // What the swatches show when "Custom" is off: the colour actually drawn
  // for the first labelled annotation, matching resolveLabelStyle's own
  // precedence rather than an arbitrary hard-coded value.
  const firstAnnotationWithText = useMemo(
    () => currentScene.annotations?.find((annotation) => annotation?.text) ?? null,
    [currentScene]
  );
  const defaultLabelStyle = useMemo(
    () => resolveLabelStyle(firstAnnotationWithText ?? {}, {}),
    [firstAnnotationWithText]
  );

  function handleAnnotationBackgroundColorChange(value) {
    setAnnotationBackgroundColor(value);
    // A custom dark card behind the export's default black text is
    // unreadable, so seed a contrasting text colour the first time a custom
    // background is turned on (only if the user hasn't already customised it).
    if (value && !annotationTextColor) {
      setAnnotationTextColor(BARE_TEXT_COLOR);
    }
  }

  const renderedPointClouds = useMemo(
    () => applyMarkerSelections(visiblePointClouds, markerSelections),
    [visiblePointClouds, markerSelections]
  );

  // Same marker selections, but against every row of the series rather than
  // the filtered/visible subset — lets the legend show the full dataset's
  // range alongside the (possibly narrower) currently-visible one.
  const fullRenderedPointClouds = useMemo(
    () => applyMarkerSelections(pointSeries, markerSelections),
    [pointSeries, markerSelections]
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
        markerScale,
        rightOpen,
        annotationsVisible,
        annotationScale,
        annotationFont,
        annotationTextColor,
        annotationBackgroundColor,
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
    markerScale,
    rightOpen,
    annotationsVisible,
    annotationScale,
    annotationFont,
    annotationTextColor,
    annotationBackgroundColor,
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
    if (Number.isFinite(session.markerScale)) setMarkerScale(Math.min(1.5, Math.max(0.1, session.markerScale)));
    if (typeof session.rightOpen === "boolean") setRightOpen(session.rightOpen);
    if (typeof session.annotationsVisible === "boolean") setAnnotationsVisible(session.annotationsVisible);
    if (Number.isFinite(session.annotationScale)) setAnnotationScale(session.annotationScale);
    if (session.annotationFont === null || ANNOTATION_FONT_CHOICES.some((choice) => choice.value === session.annotationFont)) {
      setAnnotationFont(session.annotationFont || null);
    }
    const COLOR_RE = /^#[0-9a-f]{6}$/i;
    if (session.annotationTextColor === null || COLOR_RE.test(session.annotationTextColor)) {
      setAnnotationTextColor(session.annotationTextColor);
    }
    if (session.annotationBackgroundColor === null || COLOR_RE.test(session.annotationBackgroundColor)) {
      setAnnotationBackgroundColor(session.annotationBackgroundColor);
    }
    if (session.projectionMode) setProjectionMode(session.projectionMode);
    if (session.camera) pendingCameraRestoreRef.current = session.camera;
    setRestoreBanner(null);
  }

  // Enriches each rendered legend with the specific per-series info the
  // right panel wants beyond the ramp/ticks/full-range comparison (missing-
  // value count, and the size/symbol scheme actually in effect) —
  // colourLegend.js only ever needed the colour ramp, so this is computed
  // alongside it rather than added there. Filters+maps renderedPointClouds
  // directly (rather than going through buildSceneColourLegends) so each
  // legend stays paired with its originating series by index, including for
  // the fullRenderedPointClouds lookup buildColourLegend's 3rd argument uses
  // to compute the full-dataset range comparison.
  const colourLegends = useMemo(
    () =>
      renderedPointClouds
        .map((series, index) => (series?.legend === true ? { series, index } : null))
        .filter(Boolean)
        .map(({ series, index }) => {
          const legend = buildColourLegend(series, undefined, fullRenderedPointClouds[index]);
          if (!legend) return null;
          const missingCount = (series.points ?? []).filter((point) => {
            const value = point?.[legend.input];
            return (
              value === null ||
              value === undefined ||
              value === "" ||
              (typeof value === "number" && !Number.isFinite(value))
            );
          }).length;
          const symbolLabel = resolveMarkerRenderOptions(series)?.symbolFn ? "From colour ramp" : "None";
          return { ...legend, missingCount, sizeLabel: series.sizeMarker || "Constant", symbolLabel };
        })
        .filter(Boolean),
    [renderedPointClouds, fullRenderedPointClouds]
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

  const totalVisibleCount = useMemo(
    () => filterResults.reduce((total, result, index) => {
      const visible = seriesVisibility[index] ?? pointSeries[index]?.visible !== false;
      return total + (visible ? result.visibleCount : 0);
    }, 0),
    [filterResults, seriesVisibility, pointSeries]
  );
  const totalPointCount = useMemo(
    () => pointSeries.reduce((total, series) => total + (series.points?.length ?? 0), 0),
    [pointSeries]
  );
  const surfaceCount = currentScene.surfaces?.length ?? 0;
  const activeFilterCount = useMemo(
    () => Object.values(filtersBySeries).reduce((total, filters) => total + (filters?.length ?? 0), 0),
    [filtersBySeries]
  );

  // "Layers": point series + surfaces + annotations, synthesised for the
  // Layers panel — the underlying data model doesn't have a first-class
  // "layer" concept the way the design reference's mock data does.
  const layers = useMemo(() => {
    const seriesLayers = pointSeries.map((series, index) => ({
      id: `series-${index}`,
      name: series.name || `Point series ${index + 1}`,
      type: "event",
      visible: seriesVisibility[index] ?? series.visible !== false,
      count: series.points?.length ?? 0,
      // Category icon colour — lime is reserved for active/selection
      // states (the eye icon itself signals visibility), not used
      // decoratively here.
      color: "var(--color-fg-dim)",
    }));
    const surfaceCount = currentScene.surfaces?.length ?? 0;
    const annotationCount = currentScene.annotations?.length ?? 0;
    return [
      ...seriesLayers,
      ...(surfaceCount > 0
        ? [{ id: "surfaces", name: "Surfaces", type: "surface", visible: true, count: surfaceCount, color: "#3B82F6" }]
        : []),
      ...(annotationCount > 0
        ? [{ id: "annotations", name: "Annotations", type: "annotation", visible: annotationsVisible, count: annotationCount, color: "#A3A3A3" }]
        : []),
    ];
  }, [pointSeries, seriesVisibility, currentScene, annotationsVisible]);

  function handleLayerToggle(id) {
    if (id === "annotations") {
      setAnnotationsVisible((visible) => !visible);
      return;
    }
    if (id === "surfaces") return; // no per-surface visibility toggle in the render pipeline yet
    const match = id.match(/^series-(\d+)$/);
    if (!match) return;
    const index = Number(match[1]);
    setSeriesVisibility((current) => ({
      ...current,
      [index]: !(current[index] ?? pointSeries[index]?.visible !== false),
    }));
  }

  // Marker Style section operates on whichever series is selected there.
  const markerActiveSeries = visiblePointClouds[safeMarkerSeriesIndex];
  const markerChoices = getMarkerChoices(markerActiveSeries);
  const markerActiveSelection = markerSelections?.[safeMarkerSeriesIndex] ?? {};
  const colourValue = Object.hasOwn(markerActiveSelection, "colourMarker")
    ? markerActiveSelection.colourMarker ?? ""
    : markerActiveSeries?.colourMarker ?? "";
  const sizeValue = Object.hasOwn(markerActiveSelection, "sizeMarker")
    ? markerActiveSelection.sizeMarker ?? ""
    : markerActiveSeries?.sizeMarker ?? "";

  const resolvedSymbolLabel = useMemo(() => {
    if (!markerActiveSeries) return null;
    const selection = markerSelections?.[safeMarkerSeriesIndex] ?? {};
    const [previewSeries] = applyMarkerSelections([markerActiveSeries], { 0: selection });
    const renderOptions = resolveMarkerRenderOptions(previewSeries);
    return renderOptions?.symbolFn ? "From colour ramp" : "None";
  }, [markerActiveSeries, markerSelections, safeMarkerSeriesIndex]);

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

      sessionKeyRef.current = sessionKeyFor(file);
      setRestoreBanner(null);
      const saved = loadSession(sessionKeyRef.current);
      if (saved) setRestoreBanner({ key: sessionKeyRef.current, session: saved });
    } catch (err) {
      console.error(err);
      setErrors([err.message]);
    } finally {
      setIsLoadingExport(false);
    }
  }

  function switchToScene(index) {
    setCurrentIndex(index);
    setSelectedSeries(0);
    setFiltersBySeries({});
    setSeriesVisibility({});
    setNullVisibility({});
    setMarkerSelections({});
    setMarkerSeriesIndex(0);
    setRestoreBanner(null);
    setHoveredPoint(null);
    setSelectedPoint(null);
  }

  function goToNextScene() {
    switchToScene((currentIndex + 1) % scenes.length);
  }

  const dataState = errors.length > 0 ? "error" : isLoadingExport ? "loading" : "loaded";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--color-base)" }}>
      <Header
        fileName={fileName}
        currentScene={currentScene}
        isLoadingExport={isLoadingExport}
        onFileChange={handleFileChange}
      />

      {restoreBanner && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 16px",
            background: "var(--color-lime-bg)",
            borderBottom: "1px solid var(--color-border)",
            fontSize: 12,
            color: "var(--color-fg-dim)",
          }}
        >
          <span>A previous session was found for this file.</span>
          <button
            className="btn btn-lime"
            style={{ fontSize: 11 }}
            onClick={() => applyRestoredSession(restoreBanner.session)}
          >
            Restore
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11 }}
            onClick={() => setRestoreBanner(null)}
          >
            Start fresh
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <LeftSidebar
          open={leftOpen}
          onToggle={() => setLeftOpen((v) => !v)}
          scenes={scenes}
          sceneIdx={currentIndex}
          onSceneChange={switchToScene}
          onPrev={() => switchToScene((currentIndex - 1 + scenes.length) % scenes.length)}
          onNext={() => switchToScene((currentIndex + 1) % scenes.length)}
          layers={layers}
          onLayerToggle={handleLayerToggle}
          markerSeriesOptions={pointSeries.map((series, index) => series.name || `Series ${index + 1}`)}
          markerSeriesIndex={safeMarkerSeriesIndex}
          onMarkerSeriesChange={setMarkerSeriesIndex}
          colourChoices={markerChoices.colour}
          sizeChoices={markerChoices.size}
          colourValue={colourValue}
          sizeValue={sizeValue}
          markerScale={markerScale}
          onMarkerScaleChange={setMarkerScale}
          onColourChange={(value) =>
            setMarkerSelections((current) => ({
              ...current,
              [safeMarkerSeriesIndex]: { ...current[safeMarkerSeriesIndex], colourMarker: value || null },
            }))
          }
          onSizeChange={(value) =>
            setMarkerSelections((current) => ({
              ...current,
              [safeMarkerSeriesIndex]: { ...current[safeMarkerSeriesIndex], sizeMarker: value || null },
            }))
          }
          resolvedSymbolLabel={resolvedSymbolLabel}
          annotScale={annotationScale}
          onAnnotScaleChange={setAnnotationScale}
          annotationsVisible={annotationsVisible}
          onAnnotationsVisibleChange={() => setAnnotationsVisible((v) => !v)}
          annotationFont={annotationFont}
          onAnnotationFontChange={setAnnotationFont}
          annotationTextColor={annotationTextColor}
          onAnnotationTextColorChange={setAnnotationTextColor}
          annotationTextColorFallback={defaultLabelStyle.textColor}
          annotationBackgroundColor={annotationBackgroundColor}
          onAnnotationBackgroundColorChange={handleAnnotationBackgroundColorChange}
          annotationBackgroundColorFallback={defaultLabelStyle.backgroundColor ?? "#1f2a27"}
          hasNullVisibility={Boolean(colourMarkerInput(pointSeries[safeSelectedSeries]))}
          showNulls={
            nullVisibility[safeSelectedSeries] ?? pointSeries[safeSelectedSeries]?.showNullColours !== false
          }
          onShowNullsChange={(e) =>
            setNullVisibility((current) => ({ ...current, [safeSelectedSeries]: e.target.checked }))
          }
          fields={selectedFields}
          filters={filtersBySeries[safeSelectedSeries] ?? []}
          onFiltersChange={(filters) => setFiltersBySeries((current) => ({ ...current, [safeSelectedSeries]: filters }))}
          onResetFilters={() => setFiltersBySeries((current) => ({ ...current, [safeSelectedSeries]: [] }))}
          visibleCount={selectedStats.visibleCount}
          totalCount={selectedStats.totalCount}
        />

        <section style={{ flex: 1, position: "relative", minWidth: 0, minHeight: 0, overflow: "hidden" }} aria-label="3D scene">
          <ThreeScene
            ref={threeSceneRef}
            sceneData={currentScene}
            visiblePointClouds={renderedPointClouds}
            projectionMode={projectionMode}
            annotationsVisible={annotationsVisible}
            annotationScale={annotationScale}
            annotationFont={annotationFont}
            annotationTextColor={annotationTextColor}
            annotationBackgroundColor={annotationBackgroundColor}
            markerScale={markerScale}
            onCameraChange={(state) => {
              cameraStateRef.current = state;
              scheduleSessionSave();
            }}
            selectedPoint={activeSelectedPoint}
            onPointHover={setHoveredPoint}
            onPointSelect={setSelectedPoint}
          />

          {/* Viewport toolbar — the single place camera controls live (not
              duplicated in the sidebar). A real segmented pair for
              Perspective/Orthographic, not one button that swaps its own
              label. */}
          <div style={{ position: "absolute", top: 10, left: 10, zIndex: 5, display: "flex", gap: 4 }}>
            <button className="vp-btn" onClick={() => threeSceneRef.current?.fitScene()} title="Fit Scene — frame the currently visible data">
              <IconFitView size={14} />
            </button>
            <button className="vp-btn" onClick={() => threeSceneRef.current?.resetView()} title="Reset View — return to the export's original camera">
              <IconRefresh size={14} />
            </button>
            <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
              <button
                className={`vp-btn ${projectionMode === "perspective" ? "active" : ""}`}
                onClick={() => setProjectionMode("perspective")}
                title="Perspective projection"
                style={{ border: "none", borderRadius: 0 }}
              >
                <IconPerspective size={14} />
              </button>
              <button
                className={`vp-btn ${projectionMode === "orthographic" ? "active" : ""}`}
                onClick={() => setProjectionMode("orthographic")}
                title="Orthographic projection"
                style={{ border: "none", borderRadius: 0, borderLeft: "1px solid var(--color-border)" }}
              >
                <IconOrtho size={14} />
              </button>
            </div>
          </div>
          <div
            style={{
              position: "absolute", top: 10, right: 10, zIndex: 5,
              padding: "3px 8px", background: "rgba(18,25,24,0.85)", border: "1px solid var(--color-border)",
              borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: "0.06em",
              color: "var(--color-fg-dim)", backdropFilter: "blur(4px)",
            }}
          >
            {projectionMode === "perspective" ? "PERSPECTIVE" : "ORTHOGRAPHIC"}
          </div>
          {errors.length > 0 && (
            <div
              style={{
                position: "absolute", top: 44, left: 10, right: 10, zIndex: 5,
                padding: "8px 10px", background: "rgba(18,25,24,0.92)", border: "1px solid var(--color-danger-border)",
                borderRadius: 6, fontSize: 11, color: "var(--color-danger)",
              }}
            >
              This file could not be loaded ({errors.length} issue{errors.length > 1 ? "s" : ""}): {errors.join("; ")}
            </div>
          )}
        </section>

        <RightPanel
          open={rightOpen}
          onToggle={() => setRightOpen((v) => !v)}
          inspection={activeSelectedPoint ?? hoveredPoint}
          kind={activeSelectedPoint ? "selected" : "hovered"}
          onClear={() => setSelectedPoint(null)}
          legends={colourLegends}
        />
      </div>

      <StatusBar
        dataState={dataState}
        hoveredPoint={hoveredPoint}
        selectedPoint={activeSelectedPoint}
        visibleCount={totalVisibleCount}
        totalCount={totalPointCount}
        surfaceCount={surfaceCount}
        activeFilterCount={activeFilterCount}
        viewMode={projectionMode}
        currentScene={currentScene}
        errorMessage={errors[0]}
      />
    </div>
  );
}
