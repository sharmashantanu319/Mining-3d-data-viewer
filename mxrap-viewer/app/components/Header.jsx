import { IconMxrap, IconFile } from "./icons";

export default function Header({ fileName, currentScene, isLoadingExport, onFileChange }) {
  return (
    <header
      style={{
        height: 40,
        background: "var(--color-panel)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        paddingInline: 12,
        gap: 0,
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          paddingRight: 16,
          borderRight: "1px solid var(--color-border)",
          marginRight: 14,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            background: "var(--color-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconMxrap size={14} style={{ color: "var(--color-lime)" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg)", lineHeight: 1.1, letterSpacing: "-0.01em" }}>
            mXrap Viewer
          </div>
          <div style={{ fontSize: 9, color: "var(--color-fg-muted)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            3D Data Viewer
          </div>
        </div>
      </div>

      {/* Current file */}
      {fileName ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <IconFile size={12} style={{ color: "var(--color-fg-muted)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 11,
              color: "var(--color-fg-dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 420,
            }}
          >
            {fileName}
          </span>
          {currentScene?.title && (
            <span style={{ fontSize: 10, color: "var(--color-fg-muted)", flexShrink: 0 }}>
              — {currentScene.title}
            </span>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, fontSize: 11, color: "var(--color-fg-muted)" }}>No file loaded</div>
      )}

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <label className="btn btn-lime" style={{ fontSize: 11 }} aria-disabled={isLoadingExport}>
          {isLoadingExport ? "Loading…" : "Open Export"}
          <input type="file" accept=".zip,.json" onChange={onFileChange} disabled={isLoadingExport} style={{ display: "none" }} />
        </label>
      </div>
    </header>
  );
}
