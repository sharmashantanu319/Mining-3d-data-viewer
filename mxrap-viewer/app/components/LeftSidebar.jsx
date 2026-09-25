import { useMemo, useState } from "react";
import {
  IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronUp,
  IconEye, IconEyeOff, IconLayers, IconMap, IconFilter,
  IconRefresh, IconSearch, IconX,
  IconSurface, IconDot, IconTag, IconSettings,
} from "./icons";
import { createCategoryFilter, createRangeFilter } from "./dataFilters";

function toDateInput(epoch) {
  if (!Number.isFinite(epoch)) return "";
  return new Date(epoch).toISOString().slice(0, 10);
}

function fromDateInput(value, endBoundary = false) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day + (endBoundary ? 1 : 0));
}

function defaultFilter(field) {
  if (field.kind === "category") {
    return createCategoryFilter({ input: field.input, allowedValues: field.values });
  }
  const maximum = field.inputType === "date" ? fromDateInput(toDateInput(field.max), true) - 1 : field.max;
  return createRangeFilter({ input: field.input, inputType: field.inputType, min: field.min, max: maximum });
}

function summariseFilter(field, filter) {
  if (filter.kind === "category") {
    const values = [...filter.allowedValues];
    return values.length > 3 ? `${values.slice(0, 3).join(", ")}, +${values.length - 3} more` : values.join(", ");
  }
  if (field?.inputType === "date") {
    const from = Number.isFinite(filter.min) ? new Date(filter.min).toLocaleDateString() : "…";
    const to = Number.isFinite(filter.max) ? new Date(filter.max).toLocaleDateString() : "…";
    return `${from} – ${to}`;
  }
  const min = filter.min ?? field?.min;
  const max = filter.max ?? field?.max;
  return `${Number(min).toLocaleString()} – ${Number(max).toLocaleString()}`;
}

const ANNOTATION_FONT_CHOICES = [
  { label: "Default (from data)", value: "" },
  { label: "Sans-serif (Inter)", value: "600 24px Inter, system-ui, Arial, sans-serif" },
  { label: "Serif (Georgia)", value: "600 24px Georgia, 'Times New Roman', serif" },
  { label: "Monospace (Courier)", value: "600 24px 'Courier New', monospace" },
  { label: "Handwritten (Comic Sans)", value: "600 24px 'Comic Sans MS', cursive" },
];

// A labelled colour override with a checkbox to switch between "use the
// export/theme default" (value === null, swatch disabled) and a custom
// colour the user picks.
function ColourOverrideRow({ label, value, onChange, fallback, ariaLabel }) {
  return (
    <div className="ctrl-row" style={{ justifyContent: "space-between" }}>
      <span className="ctrl-label">{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="color"
          value={value ?? fallback}
          disabled={!value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          style={{ width: 22, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "none" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--color-fg-dim)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked ? (value ?? fallback) : null)}
          />
          Custom
        </label>
      </div>
    </div>
  );
}

const layerIcon = (type) => {
  if (type === "surface") return <IconSurface size={11} />;
  if (type === "event") return <IconDot size={11} />;
  if (type === "sensor") return <IconMap size={11} />;
  if (type === "marker") return <IconTag size={11} />;
  if (type === "annotation") return <IconTag size={11} />;
  return null;
};

export function LeftSidebar({
  open,
  onToggle,
  scenes,
  sceneIdx,
  onSceneChange,
  onPrev,
  onNext,
  layers,
  onLayerToggle,
  markerSeriesOptions,
  markerSeriesIndex,
  onMarkerSeriesChange,
  colourChoices,
  sizeChoices,
  colourValue,
  sizeValue,
  markerScale,
  onMarkerScaleChange,
  onColourChange,
  onSizeChange,
  resolvedSymbolLabel,
  annotScale,
  onAnnotScaleChange,
  annotationsVisible,
  onAnnotationsVisibleChange,
  annotationFont,
  onAnnotationFontChange,
  annotationTextColor,
  onAnnotationTextColorChange,
  annotationBackgroundColor,
  onAnnotationBackgroundColorChange,
  hasNullVisibility,
  showNulls,
  onShowNullsChange,
  fields,
  filters,
  onFiltersChange,
  onResetFilters,
  visibleCount,
  totalCount,
}) {
  const [open_, setOpen] = useState({
    scene: true, layers: true, markers: true, annotations: false, filters: false,
  });
  const [filterSearch, setFilterSearch] = useState("");
  const toggle = (k) => setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  const activeByInput = new Map((filters ?? []).map((filter) => [filter.input, filter]));
  const activeFields = (fields ?? []).filter((field) => activeByInput.has(field.input));
  const inactiveFields = (fields ?? []).filter((field) => !activeByInput.has(field.input));
  const query = filterSearch.trim().toLowerCase();
  const visibleInactiveFields = useMemo(
    () => (query ? inactiveFields.filter((field) => field.label.toLowerCase().includes(query)) : inactiveFields),
    [inactiveFields, query]
  );

  function addFilter(field) {
    onFiltersChange([...(filters ?? []), defaultFilter(field)]);
  }
  function removeFilter(input) {
    onFiltersChange((filters ?? []).filter((filter) => filter.input !== input));
  }
  function replaceFilter(input, nextFilter) {
    onFiltersChange((filters ?? []).map((filter) => (filter.input === input ? nextFilter : filter)));
  }

  if (!open) {
    return (
      <div className="collapsed-strip">
        <button className="strip-btn" onClick={onToggle} title="Expand sidebar">
          <IconChevronRight size={14} />
        </button>
        <div style={{ width: 1, height: 8 }} />
        <button className="strip-btn" onClick={onToggle} title="Scene — expand sidebar"><IconMap size={13} /></button>
        <button className="strip-btn" onClick={onToggle} title="Layers — expand sidebar"><IconLayers size={13} /></button>
        <button className="strip-btn" onClick={onToggle} title="Marker Style — expand sidebar"><IconDot size={13} /></button>
        <button className="strip-btn" onClick={onToggle} title="Filters — expand sidebar"><IconFilter size={13} /></button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 248,
        flexShrink: 0,
        background: "var(--color-panel)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingInline: 10,
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-fg-muted)" }}>
          Scene Controls
        </span>
        <button className="strip-btn" onClick={onToggle} title="Collapse" style={{ width: 22, height: 22 }}>
          <IconChevronLeft size={12} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {/* SCENE */}
        <div>
          <div className="section-header" onClick={() => toggle("scene")} style={{ borderTop: "none" }}>
            <IconMap size={11} />
            <span style={{ flex: 1 }}>Scene</span>
            {open_.scene ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
          </div>
          {open_.scene && (
            <div style={{ padding: "4px 10px 6px" }}>
              <select
                className="ctrl-select"
                value={sceneIdx}
                onChange={(e) => onSceneChange(Number(e.target.value))}
                style={{ width: "100%", marginBottom: 6 }}
              >
                {scenes.map((sc, i) => (
                  <option key={sc.id ?? i} value={i}>{sc.title}</option>
                ))}
              </select>

              <div style={{ display: "flex", gap: 4 }} title="Previous / next scene">
                <button className="btn btn-ghost" onClick={onPrev} style={{ flex: 1, gap: 3 }} title="Previous scene">
                  <IconChevronLeft size={11} /> Prev
                </button>
                <button className="btn btn-ghost" onClick={onNext} style={{ flex: 1, gap: 3 }} title="Next scene">
                  Next <IconChevronRight size={11} />
                </button>
              </div>
              {/* Camera controls (Fit Scene, Perspective/Orthographic) live
                  once, in the viewport toolbar — not duplicated here. */}
            </div>
          )}
        </div>

        {/* LAYERS */}
        <div>
          <div className="section-header" onClick={() => toggle("layers")}>
            <IconLayers size={11} />
            <span style={{ flex: 1 }}>Layers</span>
            <span style={{ fontSize: 10, color: "var(--color-fg-muted)", marginRight: 4 }}>
              {layers.filter((l) => l.visible).length}/{layers.length}
            </span>
            {open_.layers ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
          </div>
          {open_.layers && (
            <div style={{ paddingBottom: 4 }}>
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className="ctrl-row"
                  style={{ cursor: "pointer" }}
                  onClick={() => onLayerToggle(layer.id)}
                  title={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                >
                  <div style={{ color: "var(--color-fg-dim)", flexShrink: 0 }}>{layerIcon(layer.type)}</div>
                  <span className="ctrl-label" style={{ opacity: layer.visible ? 1 : 0.45 }}>{layer.name}</span>
                  <span style={{ fontSize: 10, color: "var(--color-fg-muted)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                    {layer.count}
                  </span>
                  <div style={{ flexShrink: 0, color: layer.visible ? "var(--color-lime)" : "var(--color-fg-disabled)" }}>
                    {layer.visible ? <IconEye size={12} /> : <IconEyeOff size={12} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MARKER STYLE */}
        <div>
          <div className="section-header" onClick={() => toggle("markers")}>
            <IconSettings size={11} />
            <span style={{ flex: 1 }}>Marker Style</span>
            {open_.markers ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
          </div>
          {open_.markers && (
            <div style={{ padding: "4px 0 6px" }}>
              {markerSeriesOptions.length > 1 && (
                <div className="ctrl-row">
                  <span className="ctrl-label">Series</span>
                  <select
                    className="ctrl-select"
                    value={markerSeriesIndex}
                    onChange={(e) => onMarkerSeriesChange(Number(e.target.value))}
                    style={{ maxWidth: 130 }}
                  >
                    {markerSeriesOptions.map((name, i) => (
                      <option key={`${name}-${i}`} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
              {colourChoices.length > 0 && (
                <div className="ctrl-row">
                  <span className="ctrl-label">Colour by</span>
                  <select className="ctrl-select" value={colourValue} onChange={(e) => onColourChange(e.target.value)} style={{ maxWidth: 130 }}>
                    {colourChoices.map((choice) => (
                      <option key={choice.name} value={choice.name}>{choice.name}{choice.input ? ` · ${choice.input}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="ctrl-row">
                <span className="ctrl-label">Size by</span>
                <select className="ctrl-select" value={sizeValue} onChange={(e) => onSizeChange(e.target.value)} style={{ maxWidth: 130 }}>
                  <option value="">None (constant size)</option>
                  {sizeChoices.map((choice) => (
                    <option key={choice.name} value={choice.name}>{choice.name}{choice.input ? ` · ${choice.input}` : ""}</option>
                  ))}
                </select>
              </div>
              <label className="ctrl-row">
                <span className="ctrl-label">Marker size</span>
                <input
                  type="range"
                  aria-label="Marker display size"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={markerScale}
                  onChange={(event) => onMarkerScaleChange(Number(event.target.value))}
                  style={{ width: 80 }}
                />
                <span>{Math.round(markerScale * 100)}%</span>
              </label>
              <div className="ctrl-row">
                <span className="ctrl-label">Symbol</span>
                {/* Not a real independent axis in this data model: symbols
                    come from the colour marker's ramp entries
                    (markers.json's Symbol field per value), so this shows
                    what's resolved rather than offering a fake selector. */}
                <select className="ctrl-select" value="" disabled style={{ maxWidth: 130 }}>
                  <option value="">{resolvedSymbolLabel || "Auto (from data)"}</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ANNOTATIONS */}
        <div>
          <div className="section-header" onClick={() => toggle("annotations")}>
            <IconTag size={11} />
            <span style={{ flex: 1 }}>Annotations</span>
            {open_.annotations ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
          </div>
          {open_.annotations && (
            <div style={{ padding: "4px 0 8px" }}>
              <div className="ctrl-row" style={{ justifyContent: "space-between" }}>
                <span className="ctrl-label">Show annotations</span>
                <label className="toggle">
                  <input type="checkbox" checked={annotationsVisible} onChange={onAnnotationsVisibleChange} />
                  <div className="toggle-track"><div className="toggle-thumb" /></div>
                </label>
              </div>
              <div className="ctrl-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span className="ctrl-label">Label size</span>
                  <span style={{ fontSize: 10, color: "var(--color-fg-dim)", fontFamily: "var(--font-mono)" }}>{annotScale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  className="ctrl-slider"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={annotScale}
                  onChange={(e) => onAnnotScaleChange(Number(e.target.value))}
                  aria-label="Annotation size"
                />
              </div>
              <div className="ctrl-row">
                <span className="ctrl-label">Font</span>
                <select
                  className="ctrl-select"
                  value={annotationFont ?? ""}
                  onChange={(e) => onAnnotationFontChange(e.target.value || null)}
                  style={{ maxWidth: 140 }}
                  aria-label="Annotation font"
                >
                  {ANNOTATION_FONT_CHOICES.map((choice) => (
                    <option key={choice.label} value={choice.value}>{choice.label}</option>
                  ))}
                </select>
              </div>
              <ColourOverrideRow
                label="Text colour"
                value={annotationTextColor}
                onChange={onAnnotationTextColorChange}
                fallback="#e7ecea"
                ariaLabel="Annotation text colour"
              />
              <ColourOverrideRow
                label="Background colour"
                value={annotationBackgroundColor}
                onChange={onAnnotationBackgroundColorChange}
                fallback="#1f2a27"
                ariaLabel="Annotation background colour"
              />
              {hasNullVisibility && (
                <div className="ctrl-row" style={{ justifyContent: "space-between" }}>
                  <span className="ctrl-label">Show null marker values</span>
                  <label className="toggle">
                    <input type="checkbox" checked={showNulls} onChange={onShowNullsChange} />
                    <div className="toggle-track"><div className="toggle-thumb" /></div>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FILTERS */}
        <div>
          <div className="section-header" onClick={() => toggle("filters")}>
            <IconFilter size={11} />
            <span style={{ flex: 1 }}>Filters</span>
            {activeFields.length > 0 && (
              <span
                style={{
                  fontSize: 9, fontWeight: 600, background: "var(--color-lime-bg)",
                  color: "var(--color-lime)", padding: "1px 5px", borderRadius: 3,
                  border: "1px solid var(--color-lime-dim)",
                }}
              >
                {activeFields.length}
              </span>
            )}
            <div style={{ marginLeft: 4 }}>{open_.filters ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}</div>
          </div>
          {open_.filters && (
            <div style={{ padding: "6px 10px 8px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>
                  {visibleCount.toLocaleString()} / {totalCount.toLocaleString()} visible
                </span>
              </div>

              <div style={{ position: "relative", marginBottom: 6 }}>
                <IconSearch
                  size={11}
                  style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: "var(--color-fg-muted)", pointerEvents: "none" }}
                />
                <input
                  type="text"
                  className="ctrl-input"
                  placeholder="Search fields…"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  style={{ paddingLeft: 22 }}
                  aria-label="Search fields"
                />
              </div>

              <div style={{ marginBottom: 6 }}>
                {visibleInactiveFields.length === 0 && (
                  <div style={{ fontSize: 10, color: "var(--color-fg-muted)", padding: "2px 6px" }}>
                    {inactiveFields.length === 0 ? "All fields have an active filter." : "No fields match your search."}
                  </div>
                )}
                {visibleInactiveFields.map((field) => (
                  <button
                    key={field.input}
                    style={{
                      display: "flex", alignItems: "center", width: "100%", padding: "3px 6px",
                      background: "none", border: "none", borderRadius: 4, fontSize: 11,
                      color: "var(--color-fg-dim)", cursor: "pointer", textAlign: "left", gap: 5,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    onClick={() => addFilter(field)}
                  >
                    <span style={{ color: "var(--color-fg-muted)", fontSize: 10 }}>+</span>
                    {field.label}
                  </button>
                ))}
              </div>

              {activeFields.length > 0 && (
                <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 6, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--color-fg-muted)", marginBottom: 4 }}>Active</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {activeFields.map((field) => {
                      const filter = activeByInput.get(field.input);
                      return (
                        <div key={field.input}>
                          <div className="filter-tag" style={{ justifyContent: "space-between", width: "100%", display: "flex" }}>
                            <span>{field.label}: {summariseFilter(field, filter)}</span>
                            <button
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-fg-muted)", display: "flex" }}
                              onClick={() => removeFilter(field.input)}
                              title={`Remove ${field.label} filter`}
                            >
                              <IconX size={10} />
                            </button>
                          </div>

                          {filter?.kind === "range" && field.inputType === "number" && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 4 }}>
                              <input
                                type="number"
                                className="ctrl-input"
                                min={field.min}
                                max={filter.max ?? field.max}
                                step="any"
                                value={filter.min ?? ""}
                                onChange={(e) =>
                                  replaceFilter(field.input, createRangeFilter({ ...filter, min: e.target.value === "" ? undefined : Number(e.target.value) }))
                                }
                              />
                              <input
                                type="number"
                                className="ctrl-input"
                                min={filter.min ?? field.min}
                                max={field.max}
                                step="any"
                                value={filter.max ?? ""}
                                onChange={(e) =>
                                  replaceFilter(field.input, createRangeFilter({ ...filter, max: e.target.value === "" ? undefined : Number(e.target.value) }))
                                }
                              />
                            </div>
                          )}

                          {filter?.kind === "range" && field.inputType === "date" && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 4 }}>
                              <input
                                type="date"
                                className="ctrl-input"
                                value={toDateInput(filter.min)}
                                onChange={(e) => replaceFilter(field.input, createRangeFilter({ ...filter, min: fromDateInput(e.target.value) }))}
                              />
                              <input
                                type="date"
                                className="ctrl-input"
                                value={toDateInput(filter.max)}
                                onChange={(e) => {
                                  const boundary = fromDateInput(e.target.value, true);
                                  replaceFilter(field.input, createRangeFilter({ ...filter, max: boundary === null ? undefined : boundary - 1 }));
                                }}
                              />
                            </div>
                          )}

                          {filter?.kind === "category" && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                              {field.values.map((value) => {
                                const selected = filter.allowedValues.has(value);
                                return (
                                  <label key={value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--color-fg-dim)" }}>
                                    <input
                                      type="checkbox"
                                      className="ctrl-check"
                                      checked={selected}
                                      onChange={(e) => {
                                        const nextValues = new Set(filter.allowedValues);
                                        if (e.target.checked) nextValues.add(value);
                                        else nextValues.delete(value);
                                        if (nextValues.size === 0) return;
                                        replaceFilter(field.input, createCategoryFilter({ ...filter, allowedValues: [...nextValues] }));
                                      }}
                                    />
                                    {value}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                className="btn btn-ghost"
                onClick={onResetFilters}
                disabled={activeFields.length === 0}
                style={{ width: "100%", justifyContent: "center", gap: 4, fontSize: 10 }}
              >
                <IconRefresh size={11} /> Reset All Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Point count footer */}
      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: "var(--color-surface)",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>Visible points</span>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-fg-dim)" }}>
          <span style={{ color: "var(--color-lime)" }}>{visibleCount.toLocaleString()}</span>
          <span style={{ color: "var(--color-fg-muted)" }}> / {totalCount.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}

export default LeftSidebar;
