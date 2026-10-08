"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { axisFraction, computeTicks, formatTick, padDegenerateRange } from "./chartScale";
import {
  DEFAULT_CHART_POINT_COLOUR,
  resolveChartLineColour,
  resolveChartPointColours,
} from "./chartColours";
import { chartTextToPlain, parseChartText } from "./chartText";
import { parseCustomerDate } from "./customerDate";

const MARGIN = { top: 14, right: 64, bottom: 44, left: 64 };
const TEXT_COLOUR = "#c9d1cf";
const GRID_COLOUR = "rgba(255, 255, 255, 0.08)";
const AXIS_COLOUR = "rgba(255, 255, 255, 0.35)";
const POINT_RADIUS = 2.5;

function initialToggles(chart) {
  const toggles = {};
  chart.series.forEach((series, index) => {
    toggles[`${index}:points`] = series.pointsVisible;
    toggles[`${index}:lines`] = series.linesVisible;
  });
  return toggles;
}

// Resolves each enabled axis' range once per chart, widening a flat range so
// there is something to draw.
function resolveRanges(chart) {
  const ranges = {};
  for (const [side, axis] of Object.entries(chart.axes)) {
    ranges[side] = axis.enabled ? padDegenerateRange(chart.axisRanges?.[side] ?? null) : null;
  }
  return ranges;
}

export function drawChart(canvas, chart, ranges, toggles, seriesColours) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const plot = {
    left: MARGIN.left,
    right: width - MARGIN.right,
    top: MARGIN.top,
    bottom: height - MARGIN.bottom,
  };
  if (plot.right - plot.left < 20 || plot.bottom - plot.top < 20) return;

  const toX = (side, value) => {
    const f = axisFraction(value, ranges[side], chart.axes[side].scale);
    return f === null ? null : plot.left + f * (plot.right - plot.left);
  };
  const toY = (side, value) => {
    const f = axisFraction(value, ranges[side], chart.axes[side].scale);
    return f === null ? null : plot.bottom - f * (plot.bottom - plot.top);
  };

  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;

  // Axes, ticks and gridlines (gridlines follow the bottom/left axes only).
  for (const side of ["bottom", "top", "left", "right"]) {
    const range = ranges[side];
    const axis = chart.axes[side];
    if (!range) continue;
    const horizontal = side === "bottom" || side === "top";
    const ticks = computeTicks(range, axis.scale, horizontal ? Math.max(2, Math.floor((plot.right - plot.left) / 110)) : 6);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : 0;

    ctx.strokeStyle = AXIS_COLOUR;
    ctx.fillStyle = TEXT_COLOUR;
    ctx.beginPath();
    if (side === "bottom") { ctx.moveTo(plot.left, plot.bottom); ctx.lineTo(plot.right, plot.bottom); }
    if (side === "top") { ctx.moveTo(plot.left, plot.top); ctx.lineTo(plot.right, plot.top); }
    if (side === "left") { ctx.moveTo(plot.left, plot.top); ctx.lineTo(plot.left, plot.bottom); }
    if (side === "right") { ctx.moveTo(plot.right, plot.top); ctx.lineTo(plot.right, plot.bottom); }
    ctx.stroke();

    for (const tick of ticks) {
      const label = formatTick(tick, axis.scale, step);
      if (horizontal) {
        const x = toX(side, tick);
        if (x === null) continue;
        if (side === "bottom") {
          ctx.strokeStyle = GRID_COLOUR;
          ctx.beginPath(); ctx.moveTo(x, plot.top); ctx.lineTo(x, plot.bottom); ctx.stroke();
        }
        ctx.textAlign = "center";
        ctx.textBaseline = side === "bottom" ? "top" : "bottom";
        ctx.fillText(label, x, side === "bottom" ? plot.bottom + 6 : plot.top - 6);
      } else {
        const y = toY(side, tick);
        if (y === null) continue;
        if (side === "left") {
          ctx.strokeStyle = GRID_COLOUR;
          ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
        }
        ctx.textAlign = side === "left" ? "right" : "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, side === "left" ? plot.left - 6 : plot.right + 6, y);
      }
    }

    if (axis.title) {
      ctx.fillStyle = TEXT_COLOUR;
      ctx.font = "600 11px system-ui, sans-serif";
      if (horizontal) {
        ctx.textAlign = "center";
        ctx.textBaseline = side === "bottom" ? "bottom" : "top";
        ctx.fillText(axis.title, (plot.left + plot.right) / 2, side === "bottom" ? height - 4 : 2);
      } else {
        ctx.save();
        ctx.translate(side === "left" ? 12 : width - 12, (plot.top + plot.bottom) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(axis.title, 0, 0);
        ctx.restore();
      }
      ctx.font = "11px system-ui, sans-serif";
    }
  }

  // Series are clipped to the plot area.
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  ctx.clip();

  chart.series.forEach((series, index) => {
    const { axisX, axisY } = series;
    if (!ranges[axisX.side] || !ranges[axisY.side]) return;

    if (toggles[`${index}:lines`] && series.enableLines) {
      ctx.lineWidth = 1.5;
      series.lines.forEach((line, lineIndex) => {
        const colours = seriesColours[index].lineColours[lineIndex];
        for (let i = 1; i < line.x.length; i += 1) {
          const x0 = toX(axisX.side, line.x[i - 1]);
          const y0 = toY(axisY.side, line.y[i - 1]);
          const x1 = toX(axisX.side, line.x[i]);
          const y1 = toY(axisY.side, line.y[i]);
          if (x0 === null || y0 === null || x1 === null || y1 === null) continue;
          if (colours && colours[i - 1] !== colours[i] && (x0 !== x1 || y0 !== y1)) {
            const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
            gradient.addColorStop(0, colours[i - 1]);
            gradient.addColorStop(1, colours[i]);
            ctx.strokeStyle = gradient;
          } else {
            ctx.strokeStyle = colours ? colours[i - 1] : seriesColours[index].lineColour;
          }
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      });
    }

    if (toggles[`${index}:points`] && series.enablePoints) {
      const colours = seriesColours[index].pointColours;
      const cross = /cross/i.test(series.colourMarker ?? "");
      ctx.lineWidth = 1;
      for (let i = 0; i < series.points.x.length; i += 1) {
        const colour = colours ? colours[i] : DEFAULT_CHART_POINT_COLOUR;
        if (colour === "transparent") continue;
        const x = toX(axisX.side, series.points.x[i]);
        const y = toY(axisY.side, series.points.y[i]);
        if (x === null || y === null) continue;
        if (cross) {
          ctx.strokeStyle = colour;
          ctx.beginPath();
          ctx.moveTo(x - POINT_RADIUS, y); ctx.lineTo(x + POINT_RADIUS, y);
          ctx.moveTo(x, y - POINT_RADIUS); ctx.lineTo(x, y + POINT_RADIUS);
          ctx.stroke();
        } else {
          ctx.fillStyle = colour;
          ctx.beginPath(); ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  });
  ctx.restore();

  // Annotations are placed in axis coordinates (one horizontal and one
  // vertical axis each), not 3D coordinates.
  for (const annotation of chart.annotations) {
    const hSide = ["bottom", "top"].find((side) => annotation.location[side] !== undefined && ranges[side]);
    const vSide = ["left", "right"].find((side) => annotation.location[side] !== undefined && ranges[side]);
    if (!hSide || !vSide) continue;
    const hValue = chart.axes[hSide].scale === "datetime"
      ? parseCustomerDate(annotation.location[hSide])
      : Number(annotation.location[hSide]);
    const x = toX(hSide, hValue);
    const y = toY(vSide, Number(annotation.location[vSide]));
    if (x === null || y === null) continue;
    const lines = chartTextToPlain(annotation.text).split("\n");
    ctx.fillStyle = TEXT_COLOUR; // the export's colour is kept for the marker ring; text stays readable on the dark plot
    ctx.strokeStyle = annotation.color ?? TEXT_COLOUR;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = x > plot.right - 120 ? "right" : "left";
    ctx.textBaseline = "bottom";
    lines.forEach((line, i) => {
      ctx.fillText(line, x + (ctx.textAlign === "left" ? 8 : -8), y - 6 - (lines.length - 1 - i) * 13);
    });
  }
}

function ChartText({ html, style }) {
  const lines = useMemo(() => parseChartText(html), [html]);
  return (
    <div style={style}>
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} style={{ minHeight: line.length === 0 ? "0.6em" : undefined }}>
          {line.map((run, runIndex) => {
            const Tag = run.sub ? "sub" : run.sup ? "sup" : "span";
            return (
              <Tag
                key={runIndex}
                style={{
                  fontWeight: run.bold ? 700 : undefined,
                  fontStyle: run.italic ? "italic" : undefined,
                  textDecoration: run.underline ? "underline" : undefined,
                }}
              >
                {run.text}
              </Tag>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Renders one parsed chart (see parseExportFile's `charts`): header, a
 * canvas with up to four axes, per-series points/lines toggles and footer.
 */
export default function ChartView({ chart }) {
  const canvasRef = useRef(null);
  const [toggles, setToggles] = useState(() => initialToggles(chart));
  const ranges = useMemo(() => resolveRanges(chart), [chart]);

  // Colours depend only on the data and markers, not on the toggles or the
  // canvas size, so they are resolved once per chart.
  const seriesColours = useMemo(
    () =>
      chart.series.map((series) => {
        const lineColour = resolveChartLineColour(series);
        const useLegendLines = !series.lineOverrideColour && series.lines.length > 0;
        return {
          pointColours: resolveChartPointColours(series),
          lineColour,
          lineColours: series.lines.map((line) =>
            useLegendLines
              ? resolveChartPointColours({ ...series, points: { rows: line.rows } })
              : null
          ),
        };
      }),
    [chart]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const redraw = () => drawChart(canvas, chart, ranges, toggles, seriesColours);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [chart, ranges, toggles, seriesColours]);

  function toggle(key) {
    setToggles((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "14px 18px", gap: 8, color: "var(--color-fg)" }}>
      {chart.header && <ChartText html={chart.header} style={{ fontSize: 15, fontWeight: 600 }} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12 }}>
        {chart.series.map((series, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{series.name}</span>
            {series.enablePoints && (
              <label style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <input type="checkbox" checked={toggles[`${index}:points`]} onChange={() => toggle(`${index}:points`)} />
                Points
              </label>
            )}
            {series.enableLines && (
              <label style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <input type="checkbox" checked={toggles[`${index}:lines`]} onChange={() => toggle(`${index}:lines`)} />
                Lines
              </label>
            )}
          </div>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${chart.title} chart`}
        style={{ flex: 1, minHeight: 0, width: "100%", display: "block" }}
      />

      {chart.footer && (
        <ChartText
          html={chart.footer}
          style={{ fontSize: 11, color: "var(--color-fg-dim)", maxHeight: 90, overflowY: "auto" }}
        />
      )}
    </div>
  );
}
