export default function ImportReport({ warnings, summaries }) {
  if (!warnings.length && !summaries.length) return null;
  return (
    <details style={{ margin: "6px 12px", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", fontSize: 12 }}>
      <summary style={{ cursor: "pointer", color: "var(--color-fg)" }} aria-live="polite">
        Import report · {warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "No warnings"}
        {summaries.length > 0 ? ` · ${summaries.length} data series checked` : ""}
      </summary>
      <div style={{ maxHeight: 190, overflowY: "auto", marginTop: 8 }}>
        {summaries.length > 0 && (
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", color: "var(--color-fg-dim)" }}>
            <thead><tr><th scope="col">Series</th><th scope="col">Records</th><th scope="col">Loaded</th><th scope="col">Skipped</th></tr></thead>
            <tbody>{summaries.map((item, index) => (
              <tr key={`${item.label}-${index}`}>
                <td>{item.label}</td><td>{item.kind}</td><td>{item.loaded.toLocaleString()}</td><td>{item.skipped.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {warnings.length > 0 && <ul style={{ color: "var(--color-fg-dim)", paddingLeft: 20 }}>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      </div>
    </details>
  );
}
