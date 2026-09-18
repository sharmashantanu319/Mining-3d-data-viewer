import { IconChevronLeft, IconChevronRight, IconLegend, IconInfo } from "./icons";

const NA = <span style={{ color: "var(--color-fg-disabled)", fontStyle: "italic" }}>Not available</span>;

function formatValue(value) {
  if (value === null || value === undefined || value === "") return NA;
  if (typeof value === "number") {
    return (
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-fg)" }}>
        {Number.isInteger(value) ? value : value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </span>
    );
  }
  return <span style={{ color: "var(--color-fg)" }}>{String(value)}</span>;
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "2.5px 0", borderBottom: "1px solid var(--color-border)", minHeight: 22 }}>
      <span style={{ fontSize: 11, color: "var(--color-fg-muted)", flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 11, textAlign: "right", flex: 1 }}>{value}</span>
    </div>
  );
}

const INTERNAL_FIELDS = new Set(["x", "y", "z", "sourceIndex"]);

function SelectedPointDetails({ inspection, onClear }) {
  const { point } = inspection;
  const attributes = Object.entries(point).filter(([key]) => !INTERNAL_FIELDS.has(key));

  return (
    <div>
      <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-lime)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg)" }}>Selected point</span>
          </div>
          <button
            type="button"
            onClick={onClear}
            style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-fg-muted)", cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ padding: "6px 10px 8px" }}>
        <Row label="Position" value={formatValue(`${point.x?.toFixed?.(2) ?? point.x}, ${point.y?.toFixed?.(2) ?? point.y}, ${point.z?.toFixed?.(2) ?? point.z}`)} />
        {attributes.map(([key, value]) => (
          <Row key={key} label={key} value={formatValue(value)} />
        ))}
      </div>
    </div>
  );
}

export function RightPanel({ open, onToggle, inspection, kind, onClear, legends }) {
  if (!open) {
    return (
      <div style={{ width: 36, flexShrink: 0, background: "var(--color-panel)", borderLeft: "1px solid var(--color-border)", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 2 }}>
        <button className="strip-btn" onClick={onToggle} title="Expand panel">
          <IconChevronLeft size={14} />
        </button>
        <div style={{ width: 1, height: 8 }} />
        <button className="strip-btn" title="Legend"><IconLegend size={13} /></button>
        <button className="strip-btn" title="Selection"><IconInfo size={13} /></button>
      </div>
    );
  }

  return (
    <div style={{ width: 260, flexShrink: 0, background: "var(--color-panel)", borderLeft: "1px solid var(--color-border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", paddingInline: 10, borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
        <button className="strip-btn" onClick={onToggle} title="Collapse" style={{ width: 22, height: 22 }}>
          <IconChevronRight size={12} />
        </button>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-fg-muted)" }}>
          Legend &amp; Details
        </span>
        <div style={{ width: 22 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {inspection?.point ? (
          <SelectedPointDetails inspection={inspection} onClear={onClear} />
        ) : (
          <div style={{ padding: "12px 10px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-fg-muted)" }}>
              <IconInfo size={13} />
              <span style={{ fontSize: 11 }}>No point selected</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--color-fg-disabled)", marginTop: 3, paddingLeft: 19 }}>
              {kind === "hovered" ? "Previewing a hovered point." : "Hover or click a point in the viewport to view its attributes."}
            </div>
          </div>
        )}

        <div style={{ padding: "8px 10px 10px", borderTop: inspection?.point ? "1px solid var(--color-border)" : "none" }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-fg-muted)", marginBottom: 8 }}>
            Legend
          </div>
          {legends.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--color-fg-disabled)" }}>No colour legend for the current selection.</div>
          )}
          {legends.map((legend, index) => (
            <LegendCard legend={legend} key={`${legend.seriesName}-${legend.markerName ?? legend.input ?? index}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendCard({ legend }) {
  // Sanitised for use as an SVG id/url(#...) reference: unescaped spaces
  // (e.g. a marker named "Magnitude colour") break the url() lookup, so the
  // gradient silently fails to resolve and the ramp renders as plain black.
  const gradientId = `grad-${(legend.markerName ?? legend.input ?? "ramp").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <div style={{ marginBottom: 14 }} aria-label={`${legend.title} legend`}>
      <div style={{ fontSize: 10, color: "var(--color-fg-muted)", marginBottom: 5 }}>
        {legend.title}
        {legend.units ? ` (${legend.units})` : ""}
      </div>

      {legend.kind === "error" && (
        <div style={{ fontSize: 10, color: "var(--color-danger)" }}>Colour configuration unavailable</div>
      )}

      {legend.kind === "categorical" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {legend.categories.map((category) => (
            <div key={`${category.value}-${category.label}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="swatch" style={{ backgroundColor: category.colour }} />
              <span style={{ fontSize: 11, color: "var(--color-fg-dim)" }}>{category.label}</span>
            </div>
          ))}
        </div>
      )}

      {legend.kind === "ramp" && (
        <>
          <svg width="100%" height="14" style={{ display: "block", borderRadius: 3, overflow: "hidden" }}>
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                {legend.samples.map((sample) => (
                  <stop key={sample.position} offset={`${sample.position * 100}%`} stopColor={sample.colour} />
                ))}
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100%" height="14" fill={`url(#${gradientId})`} />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            {legend.ticks.map((tick) => (
              <span key={tick.position} style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-fg-muted)" }}>
                {tick.label}
              </span>
            ))}
          </div>
          {legend.fullRange && (
            <div style={{ marginTop: 3, fontSize: 9, color: "var(--color-fg-muted)" }}>
              Full range: {legend.fullRange.minLabel} – {legend.fullRange.maxLabel}
            </div>
          )}
        </>
      )}

      {legend.kind !== "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span className="swatch" style={{ backgroundColor: legend.nullEntry.colour }} />
          <span style={{ fontSize: 10, color: "var(--color-fg-dim)" }}>{legend.nullEntry.label}</span>
          {!legend.nullEntry.visible && <span style={{ fontSize: 9, color: "var(--color-fg-muted)", fontStyle: "italic" }}>hidden</span>}
        </div>
      )}
    </div>
  );
}

export default RightPanel;
