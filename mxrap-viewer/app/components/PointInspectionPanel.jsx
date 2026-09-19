import styles from "./PointInspectionPanel.module.css";

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  return String(value);
}

const INTERNAL_FIELDS = new Set(["x", "y", "z", "sourceIndex"]);

export default function PointInspectionPanel({ inspection, kind = "selected", onClear }) {
  if (!inspection?.point) {
    return (
      <section className={styles.panel} aria-label="Point inspection">
        <div className={styles.heading}>Point inspection</div>
        <p className={styles.empty}>Hover over a point to preview it, or click to keep its details here.</p>
      </section>
    );
  }

  const { point } = inspection;
  const attributes = Object.entries(point).filter(([key]) => !INTERNAL_FIELDS.has(key));

  return (
    <section className={styles.panel} aria-label="Point inspection">
      <div className={styles.header}>
        <div>
          <div className={styles.heading}>Point inspection</div>
          <div className={styles.status}>{kind === "selected" ? "Selected point" : "Hover preview"}</div>
        </div>
        {kind === "selected" && (
          <button type="button" className={styles.clearButton} onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <dl className={styles.values}>
        <div>
          <dt>Position</dt>
          <dd>{formatValue(point.x)}, {formatValue(point.y)}, {formatValue(point.z)}</dd>
        </div>
        {attributes.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
