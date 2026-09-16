"use client";

import { createCategoryFilter, createRangeFilter } from "./dataFilters";
import styles from "./FilterPanel.module.css";

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
  const maximum =
    field.inputType === "date"
      ? fromDateInput(toDateInput(field.max), true) - 1
      : field.max;
  return createRangeFilter({
    input: field.input,
    inputType: field.inputType,
    min: field.min,
    max: maximum,
  });
}

export default function FilterPanel({
  series,
  selectedSeries,
  onSelectSeries,
  fields,
  filters,
  stats,
  seriesVisible,
  onSeriesVisibleChange,
  hasNullVisibility,
  showNullValues,
  onShowNullValuesChange,
  onChange,
  onReset,
}) {
  const activeByInput = new Map(filters.map((filter) => [filter.input, filter]));

  function setFieldEnabled(field, enabled) {
    if (enabled) {
      onChange([...filters, defaultFilter(field)]);
    } else {
      onChange(filters.filter((filter) => filter.input !== field.input));
    }
  }

  function replaceFilter(input, nextFilter) {
    onChange(filters.map((filter) => (filter.input === input ? nextFilter : filter)));
  }

  return (
    <aside className={styles.panel} aria-label="Data filters">
      <div className={styles.headingRow}>
        <div>
          <div className={styles.eyebrow}>Explore data</div>
          <h2>Filters</h2>
        </div>
        <button className={styles.resetButton} onClick={onReset} disabled={filters.length === 0}>
          Reset filters
        </button>
      </div>

      {series.length > 1 && (
        <label className={styles.seriesPicker}>
          Data series
          <select value={selectedSeries} onChange={(event) => onSelectSeries(Number(event.target.value))}>
            {series.map((item, index) => (
              <option key={`${item.name}-${index}`} value={index}>
                {item.name || `Point series ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={styles.visibilityControls}>
        <label>
          <input
            type="checkbox"
            checked={seriesVisible}
            onChange={(event) => onSeriesVisibleChange(event.target.checked)}
          />
          Show this series
        </label>
        {hasNullVisibility && (
          <label>
            <input
              type="checkbox"
              checked={showNullValues}
              onChange={(event) => onShowNullValuesChange(event.target.checked)}
            />
            Show null marker values
          </label>
        )}
      </div>

      <div className={styles.summary}>
        <strong>{seriesVisible ? stats.visibleCount.toLocaleString() : "0"}</strong>
        <span>of {stats.totalCount.toLocaleString()} visible</span>
        {(stats.missingCount > 0 || stats.invalidCount > 0) && (
          <small>
            {stats.missingCount} missing · {stats.invalidCount} invalid
          </small>
        )}
      </div>

      {stats.totalCount > 0 && stats.visibleCount === 0 && (
        <div className={styles.emptyState}>No points match the current filters.</div>
      )}

      <div className={styles.fields}>
        {fields.length === 0 && <p className={styles.muted}>No filterable attributes in this series.</p>}
        {fields.map((field) => {
          const filter = activeByInput.get(field.input);
          return (
            <section className={styles.field} key={field.input}>
              <label className={styles.fieldToggle}>
                <input
                  type="checkbox"
                  checked={Boolean(filter)}
                  onChange={(event) => setFieldEnabled(field, event.target.checked)}
                />
                <span>{field.label}</span>
                <small>{field.inputType === "date" ? "date" : field.kind}</small>
              </label>

              {filter?.kind === "range" && field.inputType === "number" && (
                <div className={styles.rangeGrid}>
                  <label>
                    Minimum
                    <input
                      type="number"
                      min={field.min}
                      max={filter.max ?? field.max}
                      step="any"
                      value={filter.min ?? ""}
                      onChange={(event) =>
                        replaceFilter(
                          field.input,
                          createRangeFilter({
                            ...filter,
                            min: event.target.value === "" ? undefined : Number(event.target.value),
                          })
                        )
                      }
                    />
                  </label>
                  <label>
                    Maximum
                    <input
                      type="number"
                      min={filter.min ?? field.min}
                      max={field.max}
                      step="any"
                      value={filter.max ?? ""}
                      onChange={(event) =>
                        replaceFilter(
                          field.input,
                          createRangeFilter({
                            ...filter,
                            max: event.target.value === "" ? undefined : Number(event.target.value),
                          })
                        )
                      }
                    />
                  </label>
                  <div className={styles.domain}>
                    Available: {field.min.toLocaleString()}–{field.max.toLocaleString()}
                  </div>
                </div>
              )}

              {filter?.kind === "range" && field.inputType === "date" && (
                <div className={styles.rangeGrid}>
                  <label>
                    From
                    <input
                      type="date"
                      value={toDateInput(filter.min)}
                      onChange={(event) =>
                        replaceFilter(
                          field.input,
                          createRangeFilter({ ...filter, min: fromDateInput(event.target.value) })
                        )
                      }
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={toDateInput(filter.max)}
                      onChange={(event) => {
                        const boundary = fromDateInput(event.target.value, true);
                        replaceFilter(
                          field.input,
                          createRangeFilter({
                            ...filter,
                            max: boundary === null ? undefined : boundary - 1,
                          })
                        );
                      }}
                    />
                  </label>
                </div>
              )}

              {filter?.kind === "category" && (
                <div className={styles.categories}>
                  {field.values.map((value) => {
                    const selected = filter.allowedValues.has(value);
                    return (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const nextValues = new Set(filter.allowedValues);
                            if (event.target.checked) nextValues.add(value);
                            else nextValues.delete(value);
                            if (nextValues.size === 0) return;
                            replaceFilter(
                              field.input,
                              createCategoryFilter({ ...filter, allowedValues: [...nextValues] })
                            );
                          }}
                        />
                        {value}
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
