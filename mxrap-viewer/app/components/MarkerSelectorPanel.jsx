import { getMarkerChoices, applyMarkerSelections } from "./markerSelection";
import { resolveMarkerRenderOptions } from "./pointMarkerResolver";
import { toCssRgba } from "./colourMapping";
import styles from "./MarkerSelectorPanel.module.css";

// A representative point to preview the current marker selection against:
// the middle of the series' rows, rather than the first (which is often an
// edge case — a null value, or row 0 of a sorted export) or a synthetic
// domain-midpoint value that no real row actually has.
function representativePoint(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  return points[Math.floor(points.length / 2)];
}

export default function MarkerSelectorPanel({
  series,
  selectedSeries,
  onSelectSeries,
  selections,
  onSelectionChange,
  onRestoreDefaults,
}) {
  if (!Array.isArray(series) || series.length === 0) return null;

  const safeIndex = Math.min(selectedSeries, series.length - 1);
  const activeSeries = series[safeIndex];
  const choices = getMarkerChoices(activeSeries);
  if (choices.colour.length === 0 && choices.size.length === 0) return null;

  const activeSelection = selections?.[safeIndex] ?? {};
  const colourValue = Object.hasOwn(activeSelection, "colourMarker")
    ? activeSelection.colourMarker ?? ""
    : activeSeries.colourMarker ?? "";
  const sizeValue = Object.hasOwn(activeSelection, "sizeMarker")
    ? activeSelection.sizeMarker ?? ""
    : activeSeries.sizeMarker ?? "";
  const hasOverride = Boolean(selections?.[safeIndex]);

  // Reuses the exact render-resolution path (colourMapping.js/sizeMapping.js
  // via pointMarkerResolver.js) rather than a separate preview-only
  // implementation, so the swatch can't drift from what the 3D view
  // actually renders for this selection.
  const [previewSeries] = applyMarkerSelections([activeSeries], { 0: activeSelection });
  const renderOptions = resolveMarkerRenderOptions(previewSeries);
  const samplePoint = representativePoint(previewSeries.points);
  const previewColour = renderOptions?.colorFn && samplePoint
    ? toCssRgba({ ...renderOptions.colorFn(samplePoint), a: 1 })
    : null;
  const previewSymbol =
    renderOptions?.symbolFn && samplePoint ? renderOptions.symbolFn(samplePoint) : null;
  const previewSymbolAsset = previewSymbol ? renderOptions.symbolAssets?.[previewSymbol] : null;
  const previewSize =
    renderOptions?.sizeFn && samplePoint
      ? renderOptions.sizeFn(samplePoint)
      : (renderOptions?.minPointSize ?? 0) + (renderOptions?.maxPointSize ?? 0);
  const sizeRange = Math.max((renderOptions?.maxPointSize ?? 1) - (renderOptions?.minPointSize ?? 0), 1e-6);
  const sizeFraction = renderOptions
    ? Math.min(1, Math.max(0, (previewSize - renderOptions.minPointSize) / sizeRange))
    : 0.5;
  const previewSwatchPx = Math.round(14 + sizeFraction * 18); // 14-32px

  function update(field, value) {
    onSelectionChange(safeIndex, { [field]: value || null });
  }

  return (
    <section className={styles.panel} aria-label="Point marker controls">
      <div className={styles.headingRow}>
        <div className={styles.heading}>Point appearance</div>
        <button
          type="button"
          className={styles.restoreButton}
          onClick={() => onRestoreDefaults?.(safeIndex)}
          disabled={!hasOverride}
        >
          Restore defaults
        </button>
      </div>

      {series.length > 1 && (
        <label className={styles.field}>
          <span>Series</span>
          <select value={safeIndex} onChange={(event) => onSelectSeries(Number(event.target.value))}>
            {series.map((item, index) => (
              <option value={index} key={`${item.name ?? "series"}-${index}`}>
                {item.name || `Series ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {choices.colour.length > 0 && (
        <label className={styles.field}>
          <span>Colour marker</span>
          <select value={colourValue} onChange={(event) => update("colourMarker", event.target.value)}>
            {choices.colour.map((choice) => (
              <option value={choice.name} key={choice.name}>
                {choice.name}{choice.input ? ` · ${choice.input}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span>Size marker</span>
        <select value={sizeValue} onChange={(event) => update("sizeMarker", event.target.value)}>
          <option value="">None (constant size)</option>
          {choices.size.map((choice) => (
            <option value={choice.name} key={choice.name}>
              {choice.name}{choice.input ? ` · ${choice.input}` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.preview} aria-label="Point appearance preview">
        <span
          className={styles.previewSwatch}
          style={{
            width: previewSwatchPx,
            height: previewSwatchPx,
            borderRadius: previewSymbolAsset ? 4 : "50%",
            backgroundColor: previewSymbolAsset ? "transparent" : previewColour ?? "#ffcc00",
            backgroundImage: previewSymbolAsset ? `url(${previewSymbolAsset})` : "none",
          }}
        />
        <span className={styles.previewLabel}>Preview</span>
      </div>
    </section>
  );
}
