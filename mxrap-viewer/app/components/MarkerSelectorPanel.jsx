import { getMarkerChoices } from "./markerSelection";
import styles from "./MarkerSelectorPanel.module.css";

export default function MarkerSelectorPanel({
  series,
  selectedSeries,
  onSelectSeries,
  selections,
  onSelectionChange,
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

  function update(field, value) {
    onSelectionChange(safeIndex, { [field]: value || null });
  }

  return (
    <section className={styles.panel} aria-label="Point marker controls">
      <div className={styles.heading}>Point markers</div>

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
    </section>
  );
}
