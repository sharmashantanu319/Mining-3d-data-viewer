"use client";

import { useState } from "react";
import ThreeScene from "./components/ThreeScene";
import { mockScenes } from "./components/mockScenes";

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentScene = mockScenes[currentIndex];

  function goToNextScene() {
    setCurrentIndex((prev) => (prev + 1) % mockScenes.length);
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
          />
        </label>
      </header>

      {/* Core Three.js scene setup — see mockScenes.js for placeholder
          data. This will later be wired up to real parsed export data. */}
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
          <div style={{ marginBottom: 8 }}>
            Current scene: <strong>{currentScene.title}</strong>
          </div>
          <button onClick={goToNextScene} style={{ padding: "6px 12px", cursor: "pointer" }}>
            Next Scene
          </button>
        </div>

        <ThreeScene sceneData={currentScene} />
      </div>
    </main>
  );
}