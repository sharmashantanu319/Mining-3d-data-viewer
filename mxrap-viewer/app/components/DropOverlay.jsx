export default function DropOverlay({ visible }) {
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(12, 17, 16, 0.78)",
        pointerEvents: "none", // the window-level drop listener does the work
      }}
    >
      <div
        style={{
          padding: "28px 44px",
          border: "2px dashed var(--color-lime)",
          borderRadius: 12,
          background: "var(--color-lime-bg)",
          color: "var(--color-lime)",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Drop an mXrap export (.zip) to open it
      </div>
    </div>
  );
}
