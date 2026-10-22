import { IconMxrap, IconFile } from "./icons";

// `viewTitle` is the scene's title in the 3D view and the chart's title while
// a chart is shown, so the header names what is on screen.
export default function Header({ fileName, viewTitle, isLoadingExport, onFileChange }) {
  return (
    <header
      style={{
        height: 40,
        background: "var(--color-panel)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        // Safe padding on both edges — the right-side "Open Export" button
        // was sitting flush against the viewport edge with only 12px, and
        // could read as clipped depending on window/scrollbar width.
        paddingInline: 16,
        gap: 0,
        flexShrink: 0,
        zIndex: 10,
        boxSizing: "border-box",
      }}
    >
      {/* Brand: the mark and the name on one line. The tiny all-caps
          "3D DATA VIEWER" line under the name repeated "Viewer" and was too
          small to read. */}
      <div
        title="mXrap Viewer: view mXrap exports in 3D"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 22,
          paddingRight: 16,
          borderRight: "1px solid var(--color-border)",
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <IconMxrap size={20} aria-hidden="true" style={{ color: "var(--color-lime)", flexShrink: 0 }} />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.015em",
            color: "var(--color-fg)",
            whiteSpace: "nowrap",
          }}
        >
          mXrap Viewer
        </span>
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
          {viewTitle && (
            <span style={{ fontSize: 10, color: "var(--color-fg-muted)", flexShrink: 0 }}>
              — {viewTitle}
            </span>
          )}
        </div>
      ) : (
        // "No file loaded" was inaccurate — the mock demo scene is always
        // showing something, never a true empty state.
        <div style={{ flex: 1, fontSize: 11, color: "var(--color-fg-muted)" }}>Demo data</div>
      )}

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
        <label
          className="btn btn-lime"
          style={{ fontSize: 11, flexShrink: 0, whiteSpace: "nowrap" }}
          aria-disabled={isLoadingExport}
          title="Open an mXrap export file"
        >
          {isLoadingExport ? "Loading…" : "Open Export"}
          <input type="file" accept=".zip,.json" onChange={onFileChange} disabled={isLoadingExport} style={{ display: "none" }} />
        </label>
      </div>
    </header>
  );
}
