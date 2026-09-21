import { IconDot, IconCrosshair } from "./icons";

export function StatusBar({
  dataState,
  hoveredPoint,
  selectedPoint,
  visibleCount,
  totalCount,
  surfaceCount,
  activeFilterCount,
  viewMode,
  currentScene,
  errorMessage,
}) {
  const active = hoveredPoint ?? selectedPoint;
  const activePoint = active?.point;

  return (
    <div
      style={{
        height: 26,
        background: "var(--color-panel)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        paddingInline: 10,
        gap: 0,
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderRight: "1px solid var(--color-border)", paddingRight: 10, marginRight: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background:
                dataState === "loaded" ? "#22C55E"
                  : dataState === "loading" ? "#F59E0B"
                  : dataState === "error" ? "#EF4444"
                  : "#374F46",
              boxShadow: dataState === "loaded" ? "0 0 4px #22C55E50" : "none",
            }}
          />
          <span style={{ fontSize: 10, color: "var(--color-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {dataState === "loaded" ? "Ready"
              : dataState === "loading" ? "Loading"
              : dataState === "error" ? "Error"
              : "No file"}
          </span>
        </div>

        {currentScene && (
          <span style={{ fontSize: 10, color: "var(--color-fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
            {currentScene.title}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
        {dataState === "error" && errorMessage ? (
          <span style={{ fontSize: 10, color: "var(--color-danger)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {errorMessage}
          </span>
        ) : activePoint ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {hoveredPoint ? <IconCrosshair size={11} style={{ color: "var(--color-fg-muted)" }} /> : <IconDot size={11} style={{ color: "var(--color-lime)" }} />}
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: hoveredPoint ? "var(--color-fg-dim)" : "var(--color-lime)" }}>
                {activePoint.id ?? active.sourceIndex}
              </span>
            </div>
            <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>
              x {Number(activePoint.x).toFixed(1)} · y {Number(activePoint.y).toFixed(1)} · z {Number(activePoint.z).toFixed(1)}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 10, color: "var(--color-fg-disabled)" }}>Hover or click a point for coordinates</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, borderLeft: "1px solid var(--color-border)", paddingLeft: 10, marginLeft: 10 }}>
        <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-fg-dim)" }}>{visibleCount.toLocaleString()}</span>
          <span style={{ color: "var(--color-fg-disabled)" }}> / {totalCount.toLocaleString()}</span>
          <span style={{ color: "var(--color-fg-muted)" }}> pts</span>
        </span>
        {Number.isFinite(surfaceCount) && surfaceCount > 0 && (
          <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-fg-dim)" }}>{surfaceCount}</span> surf
          </span>
        )}
        {Number.isFinite(activeFilterCount) && activeFilterCount > 0 && (
          <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-lime)" }}>{activeFilterCount}</span> filter{activeFilterCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-fg-disabled)" }}>
          {viewMode === "perspective" ? "PERSP" : "ORTHO"}
        </span>
      </div>
    </div>
  );
}

export default StatusBar;
