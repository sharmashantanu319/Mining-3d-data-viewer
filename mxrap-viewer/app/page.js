"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import { lineColourSeries } from "./components/lineSeriesData";
import ChartView from "./components/ChartView";
import Header from "./components/Header";
import ImportReport from "./components/ImportReport";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightPanel } from "./components/RightPanel";
import { StatusBar } from "./components/StatusBar";
import { mockScenes } from "./components/mockScenes";
import { validateExportFile } from "./components/validateExportFile";
import { parseExportFile } from "./components/parseExportFile";
import { resolveLabelStyle } from "./components/annotationsBuilder";
import { pickReadableTextColour, toHexColour } from "./components/annotationStyleOptions";
import {
  applyFiltersWithStats,
  applyNullVisibility,
  countHiddenByFilter,
  countMissingValues,
  inferFilterFields,
} from "./components/dataFilters";
import { buildColourLegend } from "./components/colourLegend";
import { getMarkerChoices, applyMarkerSelections, pickLegendSeriesIndices } from "./components/markerSelection";
import { markerSymbolLabel } from "./components/pointMarkerResolver";
import { findMarkerDefinition } from "./components/markerLookup";
import { IconFitView, IconPerspective, IconOrtho, IconRefresh } from "./components/icons";
import { loadSession, restoreFilters, saveSession, sanitizeAnnotationStyle, serializeFilters, sessionKeyFor } from "./components/viewerSession";
import { cameraStateForProjection, sanitizeSceneCameras } from "./components/cameraState";
import { SCENE_SCOPED_STATE_DEFAULTS, isSceneSwitch } from "./components/sceneViewState";

function colourMarkerInput(series) {
  return findMarkerDefinition(series?.markerDefinitions, series?.colourMarker, "colour")?.input ?? null;
}

export default function Home() {
  const [scenes, setScenes] = useState(mockScenes); // 初始用 mock 数据占位，上传真实文件后会替换
  const [charts, setCharts] = useState([]); // chart displays from the export (none for the mock demo)
  const [activeView, setActiveView] = useState("3d"); // "3d" or "chart"
  const [chartIndex, setChartIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState([]);
  const [importReport, setImportReport] = useState({ warnings: [], notes: [], summaries: [] });
  const [fileName, setFileName] = useState(null);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [projectionMode, setProjectionMode] = useState("perspective");
  const [filtersBySeries, setFiltersBySeries] = useState({});
  const [selectedSeries, setSelectedSeries] = useState(0);
  const [seriesVisibility, setSeriesVisibility] = useState({});
  const [lineVisibility, setLineVisibility] = useState({});
  const [surfaceVisibility, setSurfaceVisibility] = useState({});
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
  const sceneCamerasRef = useRef({}); // { [sceneIndex]: camera state } recorded when a scene is left, so switching back restores its camera
  const pendingCameraRestoreRef = useRef(null); // camera state to apply once the rebuilt ThreeScene has mounted
  const saveTimeoutRef = useRef(null);
  const currentScene = scenes[currentIndex];
  const activeChart = charts[Math.min(chartIndex, charts.length - 1)] ?? null;
  const showChart = activeView === "chart" && activeChart !== null;
  const pointSeries = useMemo(() => currentScene.pointClouds ?? [], [currentScene]);
  const safeSelectedSeries = Math.min(selectedSeries, Math.max(0, pointSeries.length - 1));
  const safeMarkerSeriesIndex = Math.min(markerSeriesIndex, Math.max(0, pointSeries.length - 1));
  const sceneSurfaceCount = currentScene.surfaces?.length ?? 0;
  const sceneTotalPointCount = useMemo(
    () => pointSeries.reduce((total, series) => total + (series.points?.length ?? 0), 0),
    [pointSeries]
  );

  // Every row of each series with the Marker Style choices applied. Points
  // with no value are hidden by the colour marker in use, not the one the
  // export started with, and the legend compares against this full range.
  const fullRenderedPointClouds = useMemo(
    () => applyMarkerSelections(pointSeries, markerSelections),
    [pointSeries, markerSelections]
  );

  const filterResults = useMemo(
    () =>
      pointSeries.map((series, index) => {
        const filtered = applyFiltersWithStats(series.points ?? [], filtersBySeries[index] ?? []);
        const showNullValues = nullVisibility[index] ?? series.showNullColours !== false;
        return applyNullVisibility(filtered, colourMarkerInput(fullRenderedPointClouds[index]), showNullValues);
      }),
    [pointSeries, filtersBySeries, nullVisibility, fullRenderedPointClouds]
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

  // How many points each active filter hides on its own, so the Filters
  // section can say what every filter is doing.
  const filterHiddenCounts = useMemo(() => {
    const points = pointSeries[safeSelectedSeries]?.points ?? [];
    return Object.fromEntries(
      (filtersBySeries[safeSelectedSeries] ?? []).map((filter) => [filter.input, countHiddenByFilter(points, filter)])
    );
  }, [pointSeries, safeSelectedSeries, filtersBySeries]);

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

  // Whether the current custom text colour was filled in automatically when a
  // custom background was chosen (as opposed to picked by the user). Only an
  // auto-filled colour is re-evaluated as the background changes, and cleared
  // again when the background override is turned off.
  const textColourAutoSeededRef = useRef(false);

  function handleAnnotationTextColorChange(value) {
    textColourAutoSeededRef.current = false;
    setAnnotationTextColor(value);
  }

  function handleAnnotationBackgroundColorChange(value) {
    setAnnotationBackgroundColor(value);
    if (!value) {
      if (textColourAutoSeededRef.current) {
        textColourAutoSeededRef.current = false;
        setAnnotationTextColor(null);
      }
      return;
    }
    // A colour the user picked themselves is never touched.
    if (annotationTextColor && !textColourAutoSeededRef.current) return;
    // Otherwise make sure the label stays readable: seed a contrasting text
    // colour only when the colour that would be drawn doesn't already read
    // well on the new background (a light card behind the default light text
    // is unreadable, but an export's own readable text colour should stay).
    const seeded = pickReadableTextColour(value, defaultLabelStyle.textColor);
    textColourAutoSeededRef.current = seeded !== null;
    setAnnotationTextColor(seeded);
  }

  const renderedPointClouds = useMemo(
    () => applyMarkerSelections(visiblePointClouds, markerSelections),
    [visiblePointClouds, markerSelections]
  );

  // Debounced (not on every keystroke/drag frame) session save, keyed to
  // whichever file is currently loaded. No-ops for the initial mock demo
  // (sessionKeyRef is only set once a real file is opened).
  function scheduleSessionSave() {
    if (!sessionKeyRef.current) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      // Read the live camera at save time: it is always the current scene's,
      // whereas a value cached from the last camera event goes stale after a
      // scene switch or a projection change (which reset the camera without
      // the user moving it).
      const liveCamera = threeSceneRef.current?.getCameraState() ?? null;
      saveSession(sessionKeyRef.current, {
        sceneIndex: currentIndex,
        filtersBySeries: serializeFilters(filtersBySeries),
        seriesVisibility,
        surfaceVisibility,
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
        camera: liveCamera,
        sceneCameras: liveCamera
          ? { ...sceneCamerasRef.current, [currentIndex]: liveCamera }
          : sceneCamerasRef.current,
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
    surfaceVisibility,
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
  // mounted. ThreeScene rebuilds whenever the scene or the projection mode
  // changes, resetting the camera to that scene's default; this effect runs
  // after that rebuild (child effects run first) and overwrites it with the
  // remembered camera.
  useEffect(() => {
    if (!pendingCameraRestoreRef.current) return;
    threeSceneRef.current?.setCameraState(pendingCameraRestoreRef.current);
    pendingCameraRestoreRef.current = null;
  }, [currentScene, projectionMode]);

  function applyRestoredSession(session) {
    const restoredIndex =
      Number.isInteger(session.sceneIndex) && session.sceneIndex >= 0 && session.sceneIndex < scenes.length
        ? session.sceneIndex
        : currentIndex;
    setCurrentIndex(restoredIndex);
    if (session.filtersBySeries) setFiltersBySeries(restoreFilters(session.filtersBySeries));
    if (session.seriesVisibility) setSeriesVisibility(session.seriesVisibility);
    setSurfaceVisibility(session.surfaceVisibility ?? {});
    if (session.nullVisibility) setNullVisibility(session.nullVisibility);
    if (session.markerSelections) setMarkerSelections(session.markerSelections);
    if (Number.isInteger(session.markerSeriesIndex)) setMarkerSeriesIndex(session.markerSeriesIndex);
    if (Number.isFinite(session.markerScale)) setMarkerScale(Math.min(1.5, Math.max(0.1, session.markerScale)));
    if (typeof session.rightOpen === "boolean") setRightOpen(session.rightOpen);
    if (typeof session.annotationsVisible === "boolean") setAnnotationsVisible(session.annotationsVisible);
    if (Number.isFinite(session.annotationScale)) setAnnotationScale(session.annotationScale);
    const annotationStyle = sanitizeAnnotationStyle(session);
    textColourAutoSeededRef.current = false;
    if ("annotationFont" in annotationStyle) setAnnotationFont(annotationStyle.annotationFont);
    if ("annotationTextColor" in annotationStyle) setAnnotationTextColor(annotationStyle.annotationTextColor);
    if ("annotationBackgroundColor" in annotationStyle) {
      setAnnotationBackgroundColor(annotationStyle.annotationBackgroundColor);
    }
    const restoredProjection = session.projectionMode || projectionMode;
    if (session.projectionMode) setProjectionMode(session.projectionMode);

    // Restore every scene's remembered camera, and the current scene's live
    // camera on top. `camera` alone is what sessions saved before per-scene
    // cameras hold.
    const restoredCameras = sanitizeSceneCameras(session.sceneCameras, scenes.length);
    const liveCamera = cameraStateForProjection(session.camera, restoredProjection);
    if (liveCamera) restoredCameras[restoredIndex] = liveCamera;
    sceneCamerasRef.current = restoredCameras;

    const restoredCamera = cameraStateForProjection(restoredCameras[restoredIndex], restoredProjection);
    if (restoredCamera) {
      // ThreeScene only rebuilds (and so needs the camera applied afterwards)
      // when the scene or projection actually changes; otherwise it is
      // already mounted and can be moved straight away.
      if (restoredIndex !== currentIndex || restoredProjection !== projectionMode) {
        pendingCameraRestoreRef.current = restoredCamera;
      } else {
        threeSceneRef.current?.setCameraState(restoredCamera);
      }
    }
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
      (showChart
        ? activeChart.series.map((series) => ({ ...series, points: series.points.rows }))
        : [...renderedPointClouds, ...(currentScene.lineSeries ?? []).map(lineColourSeries)])
        .map((series, index, all) =>
          (showChart ? series?.legend === true : pickLegendSeriesIndices(all, safeMarkerSeriesIndex).includes(index))
            ? { series, index }
            : null)
        .filter(Boolean)
        .map(({ series, index }) => {
          const legend = buildColourLegend(series, undefined, showChart ? null : fullRenderedPointClouds[index]);
          if (!legend) return null;
          // Counted over the whole series: hidden points are no longer in
          // the rendered ones, which made a hidden count read "(0)".
          const countedPoints = (showChart ? series.points : fullRenderedPointClouds[index]?.points) ?? series.points ?? [];
          const missingCount = !legend.input ? undefined : countedPoints.filter((point) => {
            const value = point?.[legend.input];
            return (
              value === null ||
              value === undefined ||
              value === "" ||
              (typeof value === "number" && !Number.isFinite(value))
            );
          }).length;
          // Size and symbol are said for 3D points (the Marker Style panel
          // uses the same words) and size for chart points; a chart draws
          // plain dots or crosses, and lines have neither.
          const isPointSeries = !showChart && index < renderedPointClouds.length;
          // Whether points with no value are drawn is the user's choice now
          // ("Show points with no value"), not only the export's setting.
          const nullEntry = isPointSeries && legend.nullEntry
            ? { ...legend.nullEntry, visible: nullVisibility[index] ?? series.showNullColours !== false }
            : legend.nullEntry;
          return {
            ...legend,
            nullEntry,
            missingCount,
            sizeLabel: showChart || isPointSeries ? series.sizeMarker || "Constant" : null,
            symbolLabel: isPointSeries ? markerSymbolLabel(series) : null,
          };
        })
        .filter(Boolean),
    [renderedPointClouds, fullRenderedPointClouds, currentScene, activeChart, showChart, safeMarkerSeriesIndex, nullVisibility]
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
    const annotationCount = currentScene.annotations?.length ?? 0;
    return [
      ...seriesLayers,
      ...(currentScene.lineSeries ?? []).map((series, index) => ({
        id: `line-${index}`, name: series.name || `Line series ${index + 1}`,
        type: "line", visible: lineVisibility[index] ?? series.visible !== false,
        count: series.lines.length, color: "var(--color-fg-dim)",
      })),
      ...(currentScene.surfaces ?? []).map((surface, index) => ({
        id: `surface-${index}`, name: surface.name || `Surface ${index + 1}`,
        type: "surface", visible: surfaceVisibility[index] ?? surface.visible !== false,
        count: surface.faces?.length ?? 0, color: "#3B82F6",
      })),
      ...(annotationCount > 0
        ? [{ id: "annotations", name: "Annotations", type: "annotation", visible: annotationsVisible, count: annotationCount, color: "#A3A3A3" }]
        : []),
    ];
  }, [pointSeries, seriesVisibility, lineVisibility, surfaceVisibility, currentScene, annotationsVisible]);

  function handleLayerToggle(id) {
    const surfaceMatch = id.match(/^surface-(\d+)$/);
    if (surfaceMatch) {
      const index = Number(surfaceMatch[1]);
      setSurfaceVisibility((current) => ({
        ...current,
        [index]: !(current[index] ?? currentScene.surfaces[index].visible !== false),
      }));
      return;
    }
    const lineMatch = id.match(/^line-(\d+)$/);
    if (lineMatch) {
      const index = Number(lineMatch[1]);
      setLineVisibility((current) => ({
        ...current,
        [index]: !(current[index] ?? currentScene.lineSeries[index].visible !== false),
      }));
      return;
    }
    if (id === "annotations") {
      setAnnotationsVisible((visible) => !visible);
      return;
    }
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
  const markerActiveSelection = markerSelections?.[safeMarkerSeriesIndex] ?? {};
  const colourValue = Object.hasOwn(markerActiveSelection, "colourMarker")
    ? markerActiveSelection.colourMarker ?? ""
    : markerActiveSeries?.colourMarker ?? "";
  const sizeValue = Object.hasOwn(markerActiveSelection, "sizeMarker")
    ? markerActiveSelection.sizeMarker ?? ""
    : markerActiveSeries?.sizeMarker ?? "";
  // Checked against every point of the series, not only the ones shown now:
  // a hidden or filtered-out series used to be offered every marker.
  const markerChoices = useMemo(
    () => getMarkerChoices(pointSeries[safeMarkerSeriesIndex], { colour: colourValue, size: sizeValue }),
    [pointSeries, safeMarkerSeriesIndex, colourValue, sizeValue]
  );
  // Points of the Marker Style series that have no value for the colour in
  // use: "Show points with no value" shows or hides exactly these.
  const markerNullColumn = colourMarkerInput(fullRenderedPointClouds[safeMarkerSeriesIndex]);
  const markerNullCount = useMemo(
    () => countMissingValues(pointSeries[safeMarkerSeriesIndex]?.points, markerNullColumn),
    [pointSeries, safeMarkerSeriesIndex, markerNullColumn]
  );
  const sizeMinValue = Object.hasOwn(markerActiveSelection, "minSize")
    ? markerActiveSelection.minSize
    : (markerActiveSeries?.sizeMinimum ?? "");
  const sizeMaxValue = Object.hasOwn(markerActiveSelection, "maxSize")
    ? markerActiveSelection.maxSize
    : (markerActiveSeries?.sizeMaximum ?? "");
  const invertSize = Object.hasOwn(markerActiveSelection, "invertSize")
    ? markerActiveSelection.invertSize === true
    : false;

  const resolvedSymbolLabel = useMemo(() => {
    if (!markerActiveSeries) return null;
    const selection = markerSelections?.[safeMarkerSeriesIndex] ?? {};
    const [previewSeries] = applyMarkerSelections([markerActiveSeries], { 0: selection });
    return markerSymbolLabel(previewSeries);
  }, [markerActiveSeries, markerSelections, safeMarkerSeriesIndex]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrors([]);
    setImportReport({ warnings: [], notes: [], summaries: [] });
    setIsLoadingExport(true);

    try {
      // 第一步：先做 Validate（只检查，不渲染）
      // Step 1: validate first (checks only, no rendering).
      const validation = await validateExportFile(file);
      setImportReport({ warnings: validation.warnings ?? [], notes: validation.notes ?? [], summaries: [] });
      if (!validation.valid) {
        setErrors(validation.errors);
        return; // 检查不通过，不继续往下解析/渲染
      }

      // 第二步：Validate 通过后，才真正解析并渲染
      // Step 2: only parse and render once validation passes.
      const parsed = await parseExportFile(file);
      // An export whose displays are all non-3D views (charts) parses to zero
      // scenes; there is nothing to render, and the viewer needs a current
      // scene to exist.
      if (parsed.scenes.length === 0) {
        setErrors(["This export has no 3D views to display."]);
        return;
      }
      setScenes(parsed.scenes);
      setImportReport({ warnings: validation.warnings ?? [], notes: validation.notes ?? [], summaries: validation.summaries ?? [] });
      setCharts(parsed.charts ?? []);
      setChartIndex(0);
      setActiveView("3d");
      setCurrentIndex(0);
      resetSceneScopedState();
      sceneCamerasRef.current = {};
      pendingCameraRestoreRef.current = null;

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

  // Resets the state that belongs to one scene's data (see sceneViewState.js
  // for what is reset and what is deliberately kept across a scene switch).
  function resetSceneScopedState() {
    setSelectedSeries(SCENE_SCOPED_STATE_DEFAULTS.selectedSeries);
    setFiltersBySeries({ ...SCENE_SCOPED_STATE_DEFAULTS.filtersBySeries });
    setSeriesVisibility({ ...SCENE_SCOPED_STATE_DEFAULTS.seriesVisibility });
    setLineVisibility({});
    setSurfaceVisibility({});
    setNullVisibility({ ...SCENE_SCOPED_STATE_DEFAULTS.nullVisibility });
    setMarkerSelections({ ...SCENE_SCOPED_STATE_DEFAULTS.markerSelections });
    setMarkerSeriesIndex(SCENE_SCOPED_STATE_DEFAULTS.markerSeriesIndex);
    setHoveredPoint(null);
    setSelectedPoint(null);
  }

  function switchToScene(index) {
    if (!isSceneSwitch(index, currentIndex, scenes.length)) return;

    // Remember where the camera was in the scene being left, and queue the
    // target scene's remembered camera (if it has been visited and was seen
    // through the same kind of camera) to be applied once it has mounted.
    // Otherwise the scene opens on the export's own default camera.
    const leavingCamera = threeSceneRef.current?.getCameraState();
    if (leavingCamera) sceneCamerasRef.current[currentIndex] = leavingCamera;
    pendingCameraRestoreRef.current = cameraStateForProjection(sceneCamerasRef.current[index], projectionMode);

    setCurrentIndex(index);
    resetSceneScopedState();
    setRestoreBanner(null);
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

      <ImportReport warnings={importReport.warnings} notes={importReport.notes} summaries={importReport.summaries} />
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
          sizeMinValue={sizeMinValue}
          sizeMaxValue={sizeMaxValue}
          invertSize={invertSize}
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
          onSizeMinChange={(value) =>
            setMarkerSelections((current) => ({
              ...current,
              [safeMarkerSeriesIndex]: { ...current[safeMarkerSeriesIndex], minSize: value },
            }))
          }
          onSizeMaxChange={(value) =>
            setMarkerSelections((current) => ({
              ...current,
              [safeMarkerSeriesIndex]: { ...current[safeMarkerSeriesIndex], maxSize: value },
            }))
          }
          onInvertSizeChange={(value) =>
            setMarkerSelections((current) => ({
              ...current,
              [safeMarkerSeriesIndex]: { ...current[safeMarkerSeriesIndex], invertSize: value },
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
          onAnnotationTextColorChange={handleAnnotationTextColorChange}
          annotationTextColorFallback={toHexColour(defaultLabelStyle.textColor) ?? "#000000"}
          annotationBackgroundColor={annotationBackgroundColor}
          onAnnotationBackgroundColorChange={handleAnnotationBackgroundColorChange}
          annotationBackgroundColorFallback={toHexColour(defaultLabelStyle.backgroundColor) ?? "#1f2a27"}
          nullValueColumn={markerNullColumn}
          nullValueCount={markerNullCount}
          showNulls={
            nullVisibility[safeMarkerSeriesIndex] ?? pointSeries[safeMarkerSeriesIndex]?.showNullColours !== false
          }
          onShowNullsChange={(e) =>
            setNullVisibility((current) => ({ ...current, [safeMarkerSeriesIndex]: e.target.checked }))
          }
          filterSeriesOptions={pointSeries.map((series, index) => series.name || `Point series ${index + 1}`)}
          filterSeriesIndex={safeSelectedSeries}
          onFilterSeriesChange={setSelectedSeries}
          fields={selectedFields}
          filters={filtersBySeries[safeSelectedSeries] ?? []}
          filterHiddenCounts={filterHiddenCounts}
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
            lineVisibility={lineVisibility}
            surfaceVisibility={surfaceVisibility}
            projectionMode={projectionMode}
            annotationsVisible={annotationsVisible}
            annotationScale={annotationScale}
            annotationFont={annotationFont}
            annotationTextColor={annotationTextColor}
            annotationBackgroundColor={annotationBackgroundColor}
            markerScale={markerScale}
            onCameraChange={scheduleSessionSave}
            selectedPoint={activeSelectedPoint}
            onPointHover={setHoveredPoint}
            onPointSelect={setSelectedPoint}
          />

          {charts.length > 0 && (
            <div
              role="tablist"
              aria-label="Workspace view"
              style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 7, display: "flex", gap: 6, alignItems: "center" }}
            >
              <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "rgba(18,25,24,0.85)" }}>
                <button
                  role="tab"
                  aria-selected={!showChart}
                  className={`vp-btn ${!showChart ? "active" : ""}`}
                  style={{ border: "none", borderRadius: 0, padding: "0 12px", fontSize: 12, whiteSpace: "nowrap", width: "auto", height: 28 }}
                  onClick={() => setActiveView("3d")}
                >
                  3D View
                </button>
                <button
                  role="tab"
                  aria-selected={showChart}
                  className={`vp-btn ${showChart ? "active" : ""}`}
                  style={{ border: "none", borderRadius: 0, borderLeft: "1px solid var(--color-border)", padding: "0 12px", fontSize: 12, whiteSpace: "nowrap", width: "auto", height: 28 }}
                  onClick={() => setActiveView("chart")}
                >
                  Chart
                </button>
              </div>
              {showChart && charts.length > 1 && (
                <select
                  aria-label="Chart"
                  value={chartIndex}
                  onChange={(e) => setChartIndex(Number(e.target.value))}
                  style={{ fontSize: 12 }}
                >
                  {charts.map((chart, index) => (
                    <option key={chart.id} value={index}>{chart.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {activeChart && (
            <div hidden={!showChart} style={{ position: "absolute", inset: 0, zIndex: 6, background: "var(--color-panel)", paddingTop: 44 }}>
              <ChartView key={activeChart.id} chart={activeChart} />
            </div>
          )}

          {/* Viewport toolbar — the single place camera controls live (not
              duplicated in the sidebar). Every button carries a word, not
              just an icon: Fit / Reset move the camera, Top / Front / Side
              are mXrap's XY / XZ / YZ plan and section views, and the
              projection switch sits top-right where its status badge was. */}
          <div style={{ position: "absolute", top: 10, left: 10, zIndex: 5, display: "flex", gap: 6 }}>
            <button className="vp-btn vp-btn-label" onClick={() => threeSceneRef.current?.fitScene()} title="Fit — zoom to show everything that is visible now">
              <IconFitView size={12} /> Fit
            </button>
            <button className="vp-btn vp-btn-label" onClick={() => threeSceneRef.current?.resetView()} title="Reset — go back to the camera saved in the export">
              <IconRefresh size={12} /> Reset
            </button>
            <div className="vp-group" role="group" aria-label="Preset views">
              <button className="vp-btn vp-btn-label" onClick={() => threeSceneRef.current?.setPresetView("top")} title="Top — plan view looking straight down (XY), north up">
                Top
              </button>
              <button className="vp-btn vp-btn-label" onClick={() => threeSceneRef.current?.setPresetView("front")} title="Front — section looking north (XZ), east to the right">
                Front
              </button>
              <button className="vp-btn vp-btn-label" onClick={() => threeSceneRef.current?.setPresetView("side")} title="Side — section looking west (YZ), north to the right">
                Side
              </button>
            </div>
          </div>
          <div className="vp-group" role="group" aria-label="Projection" style={{ position: "absolute", top: 10, right: 10, zIndex: 5 }}>
            <button
              className={`vp-btn vp-btn-label ${projectionMode === "perspective" ? "active" : ""}`}
              onClick={() => setProjectionMode("perspective")}
              aria-pressed={projectionMode === "perspective"}
              title="Perspective — things further away look smaller, like a photo"
            >
              <IconPerspective size={12} /> Perspective
            </button>
            <button
              className={`vp-btn vp-btn-label ${projectionMode === "orthographic" ? "active" : ""}`}
              onClick={() => setProjectionMode("orthographic")}
              aria-pressed={projectionMode === "orthographic"}
              title="Orthographic — no shrinking with distance, so sizes and distances compare directly; clearest with Top, Front or Side"
            >
              <IconOrtho size={12} /> Orthographic
            </button>
          </div>
          {errors.length > 0 && (
            <div
              style={{
                position: "absolute", top: 44, left: 10, right: 10, zIndex: 8,
                maxHeight: 160, overflowY: "auto",
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
          inspectionSeries={renderedPointClouds[(activeSelectedPoint ?? hoveredPoint)?.seriesIndex] ?? null}
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
