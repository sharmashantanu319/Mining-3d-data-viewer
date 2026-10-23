import { useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconLegend, IconInfo, IconChevronDown, IconChevronUp } from "./icons";
import { describePointSeries, formatDetailNumber, groupPointDetails } from "./pointDetails";
import { missingValueText } from "./colourLegend";

const NA = <span style={{ color: "var(--color-fg-disabled)", fontStyle: "italic" }}>Not available</span>;

function formatValue(value, numeric = false) {
  if (value === null || value === undefined || value === "") return NA;
  if (numeric && typeof value === "string") {
    return <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-fg)" }}>{value}</span>;
  }
  if (typeof value === "number") {
    return (
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-fg)" }}>
        {formatDetailNumber(value)}
      </span>
    );
  }
  return <span style={{ color: "var(--color-fg)" }}>{String(value)}</span>;
}

function Row({ label, value, tag, swatch }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "2.5px 0", borderBottom: "1px solid var(--color-border)", minHeight: 22 }}>
      <span style={{ fontSize: 11, color: "var(--color-fg-muted)", flexShrink: 0, paddingTop: 1 }}>
        {label}
        {tag ? <span style={{ fontSize: 9, color: "var(--color-fg-disabled)", marginLeft: 5 }}>{tag}</span> : null}
      </span>
      <span style={{ fontSize: 11, textAlign: "right", flex: 1, display: "inline-flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
        {swatch ? <span className="swatch" style={{ backgroundColor: swatch }} /> : null}
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-fg-muted)", margin: "8px 0 2px" }}>
      {children}
    </div>
  );
}

// A chart point comes with its sections already worked out
// (chartPointDetails.js); a 3D point is described from its series here.
function SelectedPointDetails({ inspection, kind, series, onClear, showOtherData, onToggleOtherData }) {
  const { point, sections: givenSections, seriesName } = inspection;
  const description = useMemo(
    () => (givenSections ? { seriesName: seriesName ?? null } : describePointSeries(series)),
    [givenSections, seriesName, series]
  );
  const sections = givenSections ?? groupPointDetails(point, description);
  const selected = kind !== "hovered";

  return (
    <div>
      <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: selected ? "var(--color-lime)" : "var(--color-fg-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg)" }}>{selected ? "Selected point" : "Hovered point"}</span>
          </div>
          {selected && (
            <button
              type="button"
              onClick={onClear}
              style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "transparent", border: "1px solid var(--color-border)", color: "var(--color-fg-muted)", cursor: "pointer" }}
            >
              Clear
            </button>
          )}
        </div>
        {description.seriesName && (
          <div style={{ fontSize: 10, color: "var(--color-fg-muted)", paddingLeft: 11 }}>{description.seriesName}</div>
        )}
      </div>
      <div style={{ padding: "0 10px 8px" }}>
        {sections.map((section) => {
          // "Other data" can run to a dozen or more columns, so it starts
          // folded; the sections above say what the point is and where.
          const foldable = section.id === "other";
          const rowsShown = !foldable || showOtherData;
          return (
            <section key={section.id} aria-label={section.title}>
              {foldable ? (
                <button type="button" className="details-toggle" onClick={onToggleOtherData} aria-expanded={showOtherData}>
                  <span>{section.title}</span>
                  <span className="details-toggle-count">{section.rows.length}</span>
                  <span className="details-toggle-action">
                    {showOtherData ? "Hide" : "Show"}
                    {showOtherData ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
                  </span>
                </button>
              ) : (
                <SectionTitle>{section.title}</SectionTitle>
              )}
              {rowsShown && section.rows.map((row) => (
                <Row key={row.label} label={row.label} tag={row.tag} swatch={row.swatch} value={formatValue(row.value, row.numeric)} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// `emptyHint` says how to pick a point when none is shown (the 3D view's
// wording by default; the chart passes its own).
export function RightPanel({ open, onToggle, inspection, inspectionSeries, kind, onClear, legends, emptyHint = null }) {
  // Kept here rather than in the details view, which unmounts whenever no
  // point is hovered, so "Show" stays open while moving between points.
  const [showOtherData, setShowOtherData] = useState(false);

  if (!open) {
    return (
      <div style={{ width: 36, flexShrink: 0, background: "var(--color-panel)", borderLeft: "1px solid var(--color-border)", display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 2 }}>
        <button className="strip-btn" onClick={onToggle} title="Expand panel">
          <IconChevronLeft size={14} />
        </button>
        <div style={{ width: 1, height: 8 }} />
        <button className="strip-btn" onClick={onToggle} title="Legend — expand panel"><IconLegend size={13} /></button>
        <button className="strip-btn" onClick={onToggle} title="Selection — expand panel"><IconInfo size={13} /></button>
      </div>
    );
  }

  // One width whether or not a point is hovered or selected. It used to
  // switch between 240 and 300 px on hover, which resized the 3D view under
  // the cursor every time a point was hovered or left.
  const width = 300;

  return (
    <div style={{ width, flexShrink: 0, background: "var(--color-panel)", borderLeft: "1px solid var(--color-border)", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.15s ease" }}>
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
          <SelectedPointDetails
            inspection={inspection}
            kind={kind}
            series={inspectionSeries}
            onClear={onClear}
            showOtherData={showOtherData}
            onToggleOtherData={() => setShowOtherData((shown) => !shown)}
          />
        ) : (
          <div style={{ padding: "12px 10px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-fg-muted)" }}>
              <IconInfo size={13} />
              <span style={{ fontSize: 11 }}>No point selected</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--color-fg-disabled)", marginTop: 3, paddingLeft: 19 }}>
              {emptyHint ?? (kind === "hovered" ? "Previewing a hovered point." : "Hover or click a point in the viewport to view its attributes.")}
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
            <LegendCard legend={legend} key={`${index}-${legend.seriesName}-${legend.markerName ?? legend.input ?? ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendCard({ legend }) {
  const [collapsed, setCollapsed] = useState(false);

  // Sanitised for use as an SVG id/url(#...) reference: unescaped spaces
  // (e.g. a marker named "Magnitude colour") break the url() lookup, so the
  // gradient silently fails to resolve and the ramp renders as plain black.
  const gradientId = `grad-${(legend.markerName ?? legend.input ?? "ramp").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <div style={{ marginBottom: 14 }} aria-label={`${legend.title} legend`}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 1 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-fg)" }}>
            {legend.title}
            {legend.units ? <span style={{ fontWeight: 400, color: "var(--color-fg-muted)" }}> ({legend.units})</span> : null}
          </div>
          <div style={{ fontSize: 9, color: "var(--color-fg-muted)", marginBottom: 5 }}>
            {legend.seriesName}
            {legend.input ? ` · ${legend.input}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="strip-btn"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${legend.title} legend` : `Collapse ${legend.title} legend`}
          style={{ width: 18, height: 18, flexShrink: 0 }}
        >
          {collapsed ? <IconChevronDown size={10} /> : <IconChevronUp size={10} />}
        </button>
      </div>

      {!collapsed && (
        <>
          {legend.kind === "error" && (
            <div style={{ fontSize: 10, color: "var(--color-danger)" }} role="status">Colour configuration unavailable</div>
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
              <div style={{ display: "flex", justifyContent: legend.ticks.length === 1 ? "center" : "space-between", marginTop: 3 }}>
                {legend.ticks.map((tick) => (
                  <span key={tick.position} style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-fg-muted)" }}>
                    {tick.label}
                  </span>
                ))}
              </div>
            </>
          )}

          {legend.noVisiblePoints && (legend.kind === "ramp" || legend.kind === "categorical") && (
            <div style={{ marginTop: 3, fontSize: 9, color: "var(--color-fg-muted)", fontStyle: "italic" }}>
              No visible points — showing the full dataset&rsquo;s range
            </div>
          )}

          {legend.fullRange && (
            <div style={{ marginTop: 3, fontSize: 9, color: "var(--color-fg-muted)" }}>
              Visible: {legend.ticks[0]?.label} – {legend.ticks[legend.ticks.length - 1]?.label} · Full range:{" "}
              {legend.fullRange.minLabel} – {legend.fullRange.maxLabel}
            </div>
          )}

          {legend.kind !== "error" && legend.nullEntry && legend.missingCount !== 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <span className="swatch" style={{ backgroundColor: legend.nullEntry.colour, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "var(--color-fg-dim)" }}>{missingValueText(legend)}</span>
              {!legend.nullEntry.visible && <span style={{ fontSize: 9, color: "var(--color-fg-muted)", fontStyle: "italic" }}>hidden</span>}
            </div>
          )}

          {(legend.sizeLabel || legend.symbolLabel) && (
            <div style={{ marginTop: 6, fontSize: 9, color: "var(--color-fg-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
              {legend.sizeLabel && <span>Size: {legend.sizeLabel}</span>}
              {legend.symbolLabel && <span>Symbol: {legend.symbolLabel}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RightPanel;
