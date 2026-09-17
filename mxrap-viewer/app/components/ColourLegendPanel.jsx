import styles from "./ColourLegendPanel.module.css";

function RampLegend({ legend }) {
  return (
    <>
      <div className={styles.ramp} aria-label={`${legend.title} colour ramp`}>
        {legend.samples.map((sample, index) => (
          <span key={index} style={{ backgroundColor: sample.colour }} />
        ))}
      </div>
      <div className={styles.ticks}>
        {legend.ticks.map((tick) => (
          <span key={tick.position} style={{ left: `${tick.position * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
    </>
  );
}

function CategoryLegend({ legend }) {
  return (
    <div className={styles.categories}>
      {legend.categories.map((category) => (
        <div className={styles.entry} key={`${category.value}-${category.label}`}>
          <span className={styles.swatch} style={{ backgroundColor: category.colour }} />
          <span>{category.label}</span>
        </div>
      ))}
    </div>
  );
}

function LegendCard({ legend }) {
  return (
    <section className={styles.card} aria-label={`${legend.title} legend`}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.title}>
            {legend.title}
            {legend.units ? <span className={styles.units}> ({legend.units})</span> : null}
          </div>
          <div className={styles.meta}>
            {legend.seriesName}
            {legend.input ? ` · ${legend.input}` : ""}
          </div>
        </div>
      </div>

      {legend.kind === "error" ? (
        <div className={styles.error} role="status">
          Colour configuration unavailable
        </div>
      ) : legend.kind === "categorical" ? (
        <CategoryLegend legend={legend} />
      ) : (
        <RampLegend legend={legend} />
      )}

      <div className={styles.entry}>
        <span className={styles.swatch} style={{ backgroundColor: legend.nullEntry.colour }} />
        <span>{legend.nullEntry.label}</span>
        {!legend.nullEntry.visible ? <span className={styles.hidden}>hidden</span> : null}
      </div>
    </section>
  );
}

export default function ColourLegendPanel({ legends }) {
  if (!Array.isArray(legends) || legends.length === 0) return null;

  return (
    <aside className={styles.panel} aria-label="Colour legends">
      <div className={styles.panelTitle}>Colour legend</div>
      {legends.map((legend, index) => (
        <LegendCard
          legend={legend}
          key={`${legend.seriesName}-${legend.markerName ?? legend.input ?? index}`}
        />
      ))}
    </aside>
  );
}
