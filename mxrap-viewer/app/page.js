"use client";

import { useMemo, useRef, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import Header from "./components/Header";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightPanel } from "./components/RightPanel";
import { StatusBar } from "./components/StatusBar";
import { mockScenes } from "./components/mockScenes";
import { validateExportFile } from "./components/validateExportFile";
import { parseExportFile } from "./components/parseExportFile";
import {
  applyFiltersWithStats,
  applyNullVisibility,
  inferFilterFields,
} from "./components/dataFilters";
import { buildSceneColourLegends } from "./components/colourLegend";
import { getMarkerChoices, applyMarkerSelections } from "./components/markerSelection";
import { resolveMarkerRenderOptions } from "./components/pointMarkerResolver";

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
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [markerSelections, setMarkerSelections] = useState({});
  const [markerSeriesIndex, setMarkerSeriesIndex] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const threeSceneRef = useRef(null);
  const currentScene = scenes[currentIndex];
  const pointSeries = useMemo(() => currentScene.pointClouds ?? [], [currentScene]);
  const safeSelectedSeries = Math.min(selectedSeries, Math.max(0, pointSeries.length - 1));
  const safeMarkerSeriesIndex = Math.min(markerSeriesIndex, Math.max(0, pointSeries.length - 1));

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

  const activeSelectedPoint = useMemo(() => {
    if (!selectedPoint) return null;
    const series = renderedPointClouds[selectedPoint.seriesIndex];
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
      color: "var(--color-lime)",
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
      const validation = await validateExportFile(file);
      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }

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

  function toggleProjectionMode() {
    setProjectionMode((mode) => (mode === "perspective" ? "orthographic" : "perspective"));
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

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <LeftSidebar
          open={leftOpen}
          onToggle={() => setLeftOpen((v) => !v)}
          scenes={scenes}
          sceneIdx={currentIndex}
          onSceneChange={switchToScene}
          onPrev={() => switchToScene((currentIndex - 1 + scenes.length) % scenes.length)}
          onNext={() => switchToScene((currentIndex + 1) % scenes.length)}
          viewMode={projectionMode}
          onViewModeToggle={toggleProjectionMode}
          onFitScene={() => threeSceneRef.current?.fitScene()}
          layers={layers}
          onLayerToggle={handleLayerToggle}
          markerSeriesOptions={pointSeries.map((series, index) => series.name || `Series ${index + 1}`)}
          markerSeriesIndex={safeMarkerSeriesIndex}
          onMarkerSeriesChange={setMarkerSeriesIndex}
          colourChoices={markerChoices.colour}
          sizeChoices={markerChoices.size}
          colourValue={colourValue}
          sizeValue={sizeValue}
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
            selectedPoint={activeSelectedPoint}
            onPointHover={setHoveredPoint}
            onPointSelect={setSelectedPoint}
          />

          {/* Viewport toolbar, matching the design reference's Viewport3D overlay */}
          <div style={{ position: "absolute", top: 10, left: 10, zIndex: 5, display: "flex", gap: 4 }}>
            <button className="vp-btn" onClick={() => threeSceneRef.current?.fitScene()} title="Fit Scene">
              ⤢
            </button>
            <button
              className={`vp-btn ${projectionMode === "orthographic" ? "active" : ""}`}
              onClick={toggleProjectionMode}
              title={projectionMode === "perspective" ? "Perspective" : "Orthographic"}
            >
              {projectionMode === "perspective" ? "P" : "O"}
            </button>
            <button className="vp-btn" onClick={() => threeSceneRef.current?.resetView()} title="Reset View">
              ⟲
            </button>
          </div>
          <div
            style={{
              position: "absolute", top: 10, right: 10, zIndex: 5,
              padding: "3px 8px", background: "rgba(18,25,24,0.85)", border: "1px solid var(--color-border)",
              borderRadius: 4, fontSize: 10, fontWeight: 500, letterSpacing: "0.06em",
              color: "var(--color-fg-muted)", backdropFilter: "blur(4px)",
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
        viewMode={projectionMode}
        currentScene={currentScene}
        errorMessage={errors[0]}
      />
    </div>
  );
}
