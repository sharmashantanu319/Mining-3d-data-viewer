"use client";

import { useMemo, useRef, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import { mockScenes } from "./components/mockScenes";
import { validateExportFile } from "./components/validateExportFile";
import { parseExportFile } from "./components/parseExportFile";
import { createRangeFilter, applyFilters, getAttributeDomain } from "./components/dataFilters";

// DEMO-ONLY: filters by "ml" (magnitude), the one per-point attribute the
// mock event data carries. Once the parser's points/markers branch lands
// (see parseExportFile.js), this should read the series' real marker
// attributes instead of hard-coding "ml" — dataFilters.js itself is already
// attribute-agnostic, only this wiring is scoped to the demo data.
const FILTER_ATTRIBUTE = "ml";

export default function Home() {
  const [scenes, setScenes] = useState(mockScenes); // 初始用 mock 数据占位，上传真实文件后会替换
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [projectionMode, setProjectionMode] = useState("perspective");
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [annotationScale, setAnnotationScale] = useState(1);
  const [magnitudeRange, setMagnitudeRange] = useState(null); // null = unfiltered (full domain)
  // Tracks which scene `magnitudeRange` was picked for, so switching scenes
  // can reset it (a range picked for one scene's magnitude domain is not
  // meaningful against another's) without an effect — adjusting state
  // during render, per React's guidance for resetting state on prop change.
  const [magnitudeRangeSceneIndex, setMagnitudeRangeSceneIndex] = useState(currentIndex);
  const threeSceneRef = useRef(null);

  if (magnitudeRangeSceneIndex !== currentIndex) {
    setMagnitudeRangeSceneIndex(currentIndex);
    setMagnitudeRange(null);
  }

  const currentScene = scenes[currentIndex];

  const magnitudeDomain = useMemo(() => {
    const allPoints = (currentScene.pointClouds ?? []).flatMap((pc) => pc.points ?? []);
    return getAttributeDomain(allPoints, FILTER_ATTRIBUTE);
  }, [currentScene]);

  const filterable = Number.isFinite(magnitudeDomain.min) && Number.isFinite(magnitudeDomain.max);

  const displayedScene = useMemo(() => {
    if (!filterable || !magnitudeRange) return currentScene;

    const filter = createRangeFilter({
      input: FILTER_ATTRIBUTE,
      min: magnitudeRange.min,
      max: magnitudeRange.max,
    });

    return {
      ...currentScene,
      pointClouds: (currentScene.pointClouds ?? []).map((pointCloud) => ({
        ...pointCloud,
        points: applyFilters(pointCloud.points ?? [], [filter]).included,
      })),
    };
  }, [currentScene, magnitudeRange, filterable]);

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

          {filterable && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
              <div style={{ marginBottom: 4, fontSize: 13, color: "#555" }}>
                Magnitude filter: {(magnitudeRange?.min ?? magnitudeDomain.min).toFixed(2)} to{" "}
                {(magnitudeRange?.max ?? magnitudeDomain.max).toFixed(2)}
              </div>
              <input
                type="range"
                min={magnitudeDomain.min}
                max={magnitudeDomain.max}
                step={(magnitudeDomain.max - magnitudeDomain.min) / 100 || 1}
                value={magnitudeRange?.min ?? magnitudeDomain.min}
                onChange={(event) => {
                  const min = Number(event.target.value);
                  const max = magnitudeRange?.max ?? magnitudeDomain.max;
                  setMagnitudeRange({ min: Math.min(min, max), max });
                }}
                style={{ width: "100%" }}
              />
              <input
                type="range"
                min={magnitudeDomain.min}
                max={magnitudeDomain.max}
                step={(magnitudeDomain.max - magnitudeDomain.min) / 100 || 1}
                value={magnitudeRange?.max ?? magnitudeDomain.max}
                onChange={(event) => {
                  const max = Number(event.target.value);
                  const min = magnitudeRange?.min ?? magnitudeDomain.min;
                  setMagnitudeRange({ min, max: Math.max(max, min) });
                }}
                style={{ width: "100%" }}
              />
              <button
                onClick={() => setMagnitudeRange(null)}
                style={{ padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
              >
                Reset filter
              </button>
            </div>
          )}
        </div>

        <ThreeScene
          ref={threeSceneRef}
          sceneData={displayedScene}
          projectionMode={projectionMode}
          annotationsVisible={annotationsVisible}
          annotationScale={annotationScale}
        />
      </div>
    </main>
  );
}