import { useState } from "react";
import {
  IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronUp,
  IconEye, IconEyeOff, IconLayers, IconMap, IconFilter,
  IconRefresh,
  IconSurface, IconDot, IconTag, IconSettings, IconLegend,
} from "./icons";
import { createCategoryFilter, createRangeFilter, niceRangeBounds, roundDateBound } from "./dataFilters";
import { ActiveFilter } from "./FilterControls";
import { ANNOTATION_FONT_CHOICES } from "./annotationStyleOptions";

// A new filter starts by letting every point through: the whole range (or
// every category) and the points with no value in that column. Adding a
// filter used to hide those points straight away (66 nodes in TestHazards)
// before anything was changed.
function defaultFilter(field) {
  if (field.kind === "category") {
    return createCategoryFilter({ input: field.input, allowedValues: field.values, includeMissing: true });
  }
  if (field.inputType === "date") {
    return createRangeFilter({
      input: field.input,
      inputType: "date",
      min: roundDateBound(field.min, "down"),
      max: roundDateBound(field.max, "up"),
      includeMissing: true,
    });
  }
  // Starts at the data's range rounded outwards, so the number boxes read
  // "0" and "0.3764" rather than 3.1086244689504383e-15 (niceRangeBounds).
  const bounds = niceRangeBounds(field.min, field.max);
  return createRangeFilter({ input: field.input, inputType: field.inputType, min: bounds.min, max: bounds.max, includeMissing: true });
}

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
            aria-label={`${ariaLabel} override`}
          />
          Custom
        </label>
      </div>
    </div>
  );
}

const layerIcon = (type) => {
  if (type === "surface") return <IconSurface size={11} />;
  if (type === "line") return <IconMap size={11} />;
  if (type === "event") return <IconDot size={11} />;
  if (type === "sensor") return <IconMap size={11} />;
  if (type === "marker") return <IconTag size={11} />;
  if (type === "annotation") return <IconTag size={11} />;
  return null;
};

// The Marker Style controls: which series, what it is coloured and sized by,
// and whether points with no value are shown. The same controls style a 3D
// point series and a chart series (chartStyle.js); the marker display size
// slider and the symbol line only belong to the 3D view
// (`showDisplayControls`).
function MarkerStyleControls({
  markerSeriesOptions,
  markerSeriesIndex,
  onMarkerSeriesChange,
  colourChoices,
  colourNoneLabel = null,
  noColourHint = null,
  colourValue,
  onColourChange,
  nullValueColumn,
  nullValueCount,
  showNulls,
  onShowNullsChange,
  sizeChoices,
  sizeValue,
  onSizeChange,
  sizeMinValue,
  sizeMaxValue,
  onSizeMinChange,
  onSizeMaxChange,
  invertSize,
  onInvertSizeChange,
  sameSizeHint,
  showDisplayControls = false,
  markerScale,
  onMarkerScaleChange,
  resolvedSymbolLabel,
}) {
  return (
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
      {colourChoices.length > 0 ? (
        <div className="ctrl-row">
          <span className="ctrl-label">Colour by</span>
          <select className="ctrl-select" aria-label="Colour points by" value={colourValue} onChange={(e) => onColourChange(e.target.value)} style={{ maxWidth: 130 }}>
            {colourNoneLabel && <option value="">{colourNoneLabel}</option>}
            {colourChoices.map((choice) => (
              <option key={choice.name} value={choice.name}>{choice.name}{choice.input && choice.input !== choice.name ? ` · ${choice.input}` : ""}</option>
            ))}
          </select>
        </div>
      ) : noColourHint ? (
        <div className="ctrl-row">
          <span className="ctrl-label">Colour by</span>
          <span className="ctrl-static" title={noColourHint}>Nothing to colour by</span>
        </div>
      ) : null}
      {nullValueColumn && (
        <div
          className="ctrl-row"
          style={{ justifyContent: "space-between" }}
          title={`Points with an empty ${nullValueColumn} can't be coloured, so they are hidden unless this is on. When shown, they use the legend's missing-value colour.`}
        >
          <span className="ctrl-label" style={{ display: "flex", flexDirection: "column", gap: 1, whiteSpace: "normal" }}>
            <span>Show points with no value</span>
            <span className="ctrl-hint">
              {nullValueCount > 0
                ? `${nullValueCount.toLocaleString()} ${nullValueCount === 1 ? "point has" : "points have"} no ${nullValueColumn}`
                : `No points are missing ${nullValueColumn}`}
            </span>
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              aria-label="Show points with no colour value"
              checked={showNulls}
              disabled={nullValueCount === 0}
              onChange={onShowNullsChange}
            />
            <div className="toggle-track"><div className="toggle-thumb" /></div>
          </label>
        </div>
      )}
      <div className="ctrl-row">
        <span className="ctrl-label">Size by</span>
        {/* A drop-down with only "None" in it looked like a choice that
            could not be made; with nothing to pick it is plain text. */}
        {sizeChoices.length > 0 ? (
          <select className="ctrl-select" aria-label="Size points by" value={sizeValue} onChange={(e) => onSizeChange(e.target.value)} style={{ maxWidth: 130 }}>
            <option value="">None</option>
            {sizeChoices.map((choice) => (
              <option key={choice.name} value={choice.name}>{choice.name}{choice.input && choice.input !== choice.name ? ` · ${choice.input}` : ""}</option>
            ))}
          </select>
        ) : (
          <span className="ctrl-static" title="The export has no size settings for this series">Nothing to size by</span>
        )}
      </div>
      {/* Min / Max size only matter when a column sets the size. With
          no size column every point is drawn at their midpoint, so
          changing Min from 1 to 2 moved it from 13 to 13.5 and looked
          like the boxes did nothing. */}
      {sizeValue ? (
        <>
          <div className="ctrl-row">
            <span className="ctrl-label">Min size</span>
            <input
              type="number"
              className="ctrl-input"
              aria-label="Marker size at the low end of the range"
              min="0"
              step="0.5"
              value={Number.isNaN(sizeMinValue) ? "" : sizeMinValue}
              onChange={(e) => onSizeMinChange(e.target.value === "" ? NaN : Number(e.target.value))}
              style={{ width: 64 }}
            />
          </div>
          <div className="ctrl-row">
            <span className="ctrl-label">Max size</span>
            <input
              type="number"
              className="ctrl-input"
              aria-label="Marker size at the high end of the range"
              min="0"
              step="0.5"
              value={Number.isNaN(sizeMaxValue) ? "" : sizeMaxValue}
              onChange={(e) => onSizeMaxChange(e.target.value === "" ? NaN : Number(e.target.value))}
              style={{ width: 64 }}
            />
          </div>
          <div className="ctrl-row" style={{ justifyContent: "space-between" }}>
            <span className="ctrl-label">Invert size</span>
            <label className="toggle">
              <input
                type="checkbox"
                aria-label="Invert size mapping (small values get the larger marker)"
                checked={invertSize}
                onChange={(e) => onInvertSizeChange(e.target.checked)}
              />
              <div className="toggle-track"><div className="toggle-thumb" /></div>
            </label>
          </div>
        </>
      ) : (
        <div className="ctrl-row">
          <span className="ctrl-hint" style={{ whiteSpace: "normal" }}>
            {sameSizeHint}
          </span>
        </div>
      )}
      {showDisplayControls && (
        <>
          <label className="ctrl-row">
            <span className="ctrl-label">Marker size</span>
            <input
              type="range"
              className="ctrl-slider"
              aria-label="Marker display size"
              min="0.1"
              max="1.5"
              step="0.05"
              value={markerScale}
              onChange={(event) => onMarkerScaleChange(Number(event.target.value))}
              style={{ width: 84 }}
            />
            <span style={{ width: 34, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-fg-dim)" }}>
              {Math.round(markerScale * 100)}%
            </span>
          </label>
          <div className="ctrl-row" title="Set by the colour marker in the export">
            <span className="ctrl-label">Symbol</span>
            {/* Not a separate choice in this data model: the symbol comes
                with the colour marker (markers.json, or a Symbol per ramp
                entry), so this says what is drawn, in the legend's words. */}
            <span className="ctrl-static">{resolvedSymbolLabel || "Dot"}</span>
          </div>
        </>
      )}
    </div>
  );
}

// Surface Style: recolour a surface the way Marker Style recolours points
// (surfaceStyle.js) — by one of its markers or in one colour — and set how
// see-through it is.
function SurfaceStyleControls({
  surfaceOptions,
  surfaceIndex,
  onSurfaceChange,
  colourChoices,
  colourValue,
  onColourChange,
  colourHex,
  onColourHexChange,
  opacity,
  onOpacityChange,
}) {
  const singleColour = colourValue === "";
  return (
    <div style={{ padding: "4px 0 6px" }}>
      {surfaceOptions.length > 1 && (
        <div className="ctrl-row">
          <span className="ctrl-label">Surface</span>
          <select
            className="ctrl-select"
            aria-label="Surface to style"
            value={surfaceIndex}
            onChange={(e) => onSurfaceChange(Number(e.target.value))}
            style={{ maxWidth: 130 }}
          >
            {surfaceOptions.map((name, i) => (
              <option key={`${name}-${i}`} value={i}>{name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="ctrl-row">
        <span className="ctrl-label">Colour by</span>
        <select
          className="ctrl-select"
          aria-label="Colour surface by"
          value={colourValue}
          onChange={(e) => onColourChange(e.target.value)}
          style={{ maxWidth: 130 }}
        >
          <option value="">Single colour</option>
          {colourChoices.map((choice) => (
            <option key={choice.name} value={choice.name}>{choice.name}{choice.input && choice.input !== choice.name ? ` · ${choice.input}` : ""}</option>
          ))}
        </select>
      </div>
      {singleColour && (
        <div className="ctrl-row" style={{ justifyContent: "space-between" }}>
          <span className="ctrl-label">Colour</span>
          <input
            type="color"
            value={colourHex}
            onChange={(e) => onColourHexChange(e.target.value)}
            aria-label="Surface colour"
            style={{ width: 22, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "none" }}
          />
        </div>
      )}
      <label className="ctrl-row">
        <span className="ctrl-label">Opacity</span>
        <input
          type="range"
          className="ctrl-slider"
          aria-label="Surface opacity"
          min="0.1"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          style={{ width: 84 }}
        />
        <span style={{ width: 34, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-fg-dim)" }}>
          {Math.round(opacity * 100)}%
        </span>
      </label>
    </div>
  );
}

// A chart's series, each with its Points and Lines switches: the chart's
// counterpart of the 3D view's Layers.
function ChartSeriesControls({ series, toggles, onToggle }) {
  const switchRow = (index, kind, label, count) => {
    const key = `${index}:${kind}`;
    const on = toggles[key] === true;
    return (
      <div
        key={key}
        className="ctrl-row"
        style={{ cursor: "pointer", paddingLeft: 26 }}
        role="switch"
        aria-checked={on}
        tabIndex={0}
        onClick={() => onToggle(key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(key);
          }
        }}
        title={`${on ? "Hide" : "Show"} the ${label.toLowerCase()} of ${series[index].name}`}
      >
        <span className="ctrl-label" style={{ opacity: on ? 1 : 0.45 }}>{label}</span>
        {count !== null && (
          <span style={{ fontSize: 10, color: "var(--color-fg-muted)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>{count}</span>
        )}
        <div style={{ flexShrink: 0, color: on ? "var(--color-lime)" : "var(--color-fg-disabled)" }}>
          {on ? <IconEye size={12} /> : <IconEyeOff size={12} />}
        </div>
      </div>
    );
  };
  return (
    <div style={{ paddingBottom: 4 }}>
      {series.map((item, index) => (
        <div key={`${item.name}-${index}`}>
          <div className="ctrl-row">
            <div style={{ color: "var(--color-fg-dim)", flexShrink: 0 }}><IconDot size={11} /></div>
            <span className="ctrl-label" style={{ fontWeight: 600 }}>{item.name}</span>
          </div>
          {item.enablePoints && switchRow(index, "points", "Points", item.points?.x?.length ?? 0)}
          {item.enableLines && switchRow(index, "lines", "Lines", null)}
        </div>
      ))}
    </div>
  );
}

export function LeftSidebar({
  mode = "3d",
  surfaceStyle = null,
  chartControls = null,
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
  sizeMinValue,
  sizeMaxValue,
  invertSize,
  markerScale,
  onMarkerScaleChange,
  onColourChange,
  onSizeChange,
  onSizeMinChange,
  onSizeMaxChange,
  onInvertSizeChange,
  resolvedSymbolLabel,
  annotScale,
  onAnnotScaleChange,
  annotationsVisible,
  onAnnotationsVisibleChange,
  annotationFont,
  onAnnotationFontChange,
  annotationTextColor,
  onAnnotationTextColorChange,
  annotationTextColorFallback,
  annotationBackgroundColor,
  onAnnotationBackgroundColorChange,
  annotationBackgroundColorFallback,
  nullValueColumn,
  nullValueCount,
  showNulls,
  onShowNullsChange,
  filterSeriesOptions = [],
  filterSeriesIndex = 0,
  onFilterSeriesChange,
  fields,
  filters,
  filterHiddenCounts = {},
  onFiltersChange,
  onResetFilters,
  visibleCount,
  totalCount,
}) {
  const [open_, setOpen] = useState({
    scene: true, layers: true, markers: true, surfaces: false, annotations: false, filters: false,
    chartSeries: true, chartMarkers: true,
  });
  const isChart = mode === "chart" && chartControls !== null;
  const toggle = (k) => setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  const activeByInput = new Map((filters ?? []).map((filter) => [filter.input, filter]));
  const activeFields = (fields ?? []).filter((field) => activeByInput.has(field.input));
  const inactiveFields = (fields ?? []).filter((field) => !activeByInput.has(field.input));

  function addFilter(field) {
    onFiltersChange([...(filters ?? []), defaultFilter(field)]);
  }
  function removeFilter(input) {
    onFiltersChange((filters ?? []).filter((filter) => filter.input !== input));
  }
  function replaceFilter(input, nextFilter) {
    onFiltersChange((filters ?? []).map((filter) => (filter.input === input ? nextFilter : filter)));
  }

  // The sidebar shows the controls of the view on screen, as the client
  // asked at the final check-in before handover: the 3D view's scene,
  // layers, styles and filters, or the chart's series and marker style. An
  // export with only charts has no 3D view to control.
  if (!isChart && scenes.length === 0) return null;

  if (!open) {
    return (
      <div className="collapsed-strip">
        <button className="strip-btn" onClick={onToggle} title="Expand sidebar">
          <IconChevronRight size={14} />
        </button>
        <div style={{ width: 1, height: 8 }} />
        {isChart ? (
          <>
            <button className="strip-btn" onClick={onToggle} title="Chart series — expand sidebar"><IconLegend size={13} /></button>
            <button className="strip-btn" onClick={onToggle} title="Marker Style — expand sidebar"><IconDot size={13} /></button>
          </>
        ) : (
          <>
            <button className="strip-btn" onClick={onToggle} title="Scene — expand sidebar"><IconMap size={13} /></button>
            <button className="strip-btn" onClick={onToggle} title="Layers — expand sidebar"><IconLayers size={13} /></button>
            <button className="strip-btn" onClick={onToggle} title="Marker Style — expand sidebar"><IconDot size={13} /></button>
            {surfaceStyle && <button className="strip-btn" onClick={onToggle} title="Surface Style — expand sidebar"><IconSurface size={13} /></button>}
            <button className="strip-btn" onClick={onToggle} title="Filters — expand sidebar"><IconFilter size={13} /></button>
          </>
        )}
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
          {isChart ? "Chart Controls" : "Scene Controls"}
        </span>
        <button className="strip-btn" onClick={onToggle} title="Collapse" style={{ width: 22, height: 22 }}>
          <IconChevronLeft size={12} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {isChart ? (
          <>
            {/* CHART SERIES */}
            <div>
              <div className="section-header" onClick={() => toggle("chartSeries")} style={{ borderTop: "none" }}>
                <IconLegend size={11} />
                <span style={{ flex: 1 }}>Chart Series</span>
                {open_.chartSeries ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
              </div>
              {open_.chartSeries && (
                <ChartSeriesControls
                  series={chartControls.series}
                  toggles={chartControls.toggles}
                  onToggle={chartControls.onToggle}
                />
              )}
            </div>

            {/* CHART MARKER STYLE */}
            <div>
              <div className="section-header" onClick={() => toggle("chartMarkers")}>
                <IconSettings size={11} />
                <span style={{ flex: 1 }}>Marker Style</span>
                {open_.chartMarkers ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
              </div>
              {open_.chartMarkers && (
                <MarkerStyleControls
                  {...chartControls.markerStyle}
                  colourNoneLabel="Default colour"
                  noColourHint="The export gives this series no colour markers"
                  sameSizeHint="Every point is the same size."
                />
              )}
            </div>
          </>
        ) : (
        <>
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
            <MarkerStyleControls
              markerSeriesOptions={markerSeriesOptions}
              markerSeriesIndex={markerSeriesIndex}
              onMarkerSeriesChange={onMarkerSeriesChange}
              colourChoices={colourChoices}
              colourValue={colourValue}
              onColourChange={onColourChange}
              nullValueColumn={nullValueColumn}
              nullValueCount={nullValueCount}
              showNulls={showNulls}
              onShowNullsChange={onShowNullsChange}
              sizeChoices={sizeChoices}
              sizeValue={sizeValue}
              onSizeChange={onSizeChange}
              sizeMinValue={sizeMinValue}
              sizeMaxValue={sizeMaxValue}
              onSizeMinChange={onSizeMinChange}
              onSizeMaxChange={onSizeMaxChange}
              invertSize={invertSize}
              onInvertSizeChange={onInvertSizeChange}
              sameSizeHint="Every point is the same size. Use Marker size to make them bigger or smaller."
              showDisplayControls
              markerScale={markerScale}
              onMarkerScaleChange={onMarkerScaleChange}
              resolvedSymbolLabel={resolvedSymbolLabel}
            />
          )}
        </div>

        {/* SURFACE STYLE */}
        {surfaceStyle && (
          <div>
            <div className="section-header" onClick={() => toggle("surfaces")}>
              <IconSurface size={11} />
              <span style={{ flex: 1 }}>Surface Style</span>
              {open_.surfaces ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
            </div>
            {open_.surfaces && <SurfaceStyleControls {...surfaceStyle} />}
          </div>
        )}

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
                fallback={annotationTextColorFallback}
                ariaLabel="Annotation text colour"
              />
              <ColourOverrideRow
                label="Background colour"
                value={annotationBackgroundColor}
                onChange={onAnnotationBackgroundColorChange}
                fallback={annotationBackgroundColorFallback}
                ariaLabel="Annotation background colour"
              />
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
              {filterSeriesOptions.length > 1 && (
                <div className="ctrl-row" style={{ paddingInline: 0, marginBottom: 2 }}>
                  <span className="ctrl-label">Series</span>
                  <select
                    className="ctrl-select"
                    value={filterSeriesIndex}
                    onChange={(e) => onFilterSeriesChange?.(Number(e.target.value))}
                    style={{ maxWidth: 140 }}
                    aria-label="Series to filter"
                  >
                    {filterSeriesOptions.map((name, i) => (
                      <option key={`${name}-${i}`} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>
                  {visibleCount.toLocaleString()} of {totalCount.toLocaleString()} points shown
                </span>
              </div>

              {/* Active filters first: they are what changes the view. A
                  dropdown adds more, instead of a list of every column
                  above them that pushed the active ones out of sight. */}
              {activeFields.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                  {activeFields.map((field) => (
                    <ActiveFilter
                      key={field.input}
                      field={field}
                      filter={activeByInput.get(field.input)}
                      hiddenCount={filterHiddenCounts[field.input] ?? 0}
                      totalCount={totalCount}
                      onChange={(next) => replaceFilter(field.input, next)}
                      onRemove={() => removeFilter(field.input)}
                    />
                  ))}
                </div>
              )}

              {fields?.length > 0 ? (
                <select
                  className="ctrl-select"
                  value=""
                  onChange={(e) => {
                    const field = inactiveFields.find((candidate) => candidate.input === e.target.value);
                    if (field) addFilter(field);
                  }}
                  disabled={inactiveFields.length === 0}
                  aria-label="Add a filter"
                  style={{ width: "100%", marginBottom: 6 }}
                >
                  <option value="">{inactiveFields.length > 0 ? "Add a filter…" : "Every column has a filter"}</option>
                  {inactiveFields.map((field) => (
                    <option key={field.input} value={field.input}>{field.label}</option>
                  ))}
                </select>
              ) : (
                <div className="ctrl-hint" style={{ marginBottom: 6 }}>This series has no columns to filter by.</div>
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
        </>
        )}
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
        <span style={{ fontSize: 10, color: "var(--color-fg-muted)" }}>{isChart ? "Points in chart" : "Visible points"}</span>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-fg-dim)" }}>
          <span style={{ color: "var(--color-lime)" }}>{(isChart ? chartControls.drawnPointCount : visibleCount).toLocaleString()}</span>
          <span style={{ color: "var(--color-fg-muted)" }}> / {(isChart ? chartControls.totalPointCount : totalCount).toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}

export default LeftSidebar;
