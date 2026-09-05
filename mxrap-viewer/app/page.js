"use client";

import { useRef, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import { mockScenes } from "./components/mockScenes";
import { parseExportFile } from "./components/parseExportFile";

export default function Home() {
  const [scenes, setScenes] = useState(mockScenes); // 初始用 mock 数据占位，上传真实文件后会替换
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [projectionMode, setProjectionMode] = useState("perspective");
  const threeSceneRef = useRef(null);

  const currentScene = scenes[currentIndex];

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    try {
      const parsed = await parseExportFile(file);
      setScenes(parsed.scenes);
      setCurrentIndex(0);
    } catch (err) {
      console.error(err);
      setError(err.message);
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

      {/* Core Three.js scene setup — see mockScenes.js for placeholder
          data used before a real file is uploaded. Once a file is
          selected via the "Open export" button above, parseExportFile()
          replaces it with real parsed scenes. */}
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
          }}
        >
          {fileName && (
            <div style={{ marginBottom: 8, fontSize: 13, color: "#555" }}>
              Loaded: {fileName}
            </div>
          )}

          {error && <div style={{ color: "red", marginBottom: 8 }}>Error: {error}</div>}

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
        </div>

        <ThreeScene ref={threeSceneRef} sceneData={currentScene} projectionMode={projectionMode} />
      </div>
    </main>
  );
}