import { forwardRef } from "react";
import { AXIS_COLOURS, AXIS_INDICATOR_SIZE } from "./orientationGizmo";

// The XYZ indicator's markup. ThreeScene moves the lines and letters every
// frame through updateAxisIndicator (orientationGizmo.js), so React renders
// this once and never re-renders it for camera moves.
const AxisIndicator = forwardRef(function AxisIndicator({ title }, ref) {
  const half = AXIS_INDICATOR_SIZE / 2;
  return (
    <svg
      ref={ref}
      className="axis-indicator"
      width={AXIS_INDICATOR_SIZE}
      height={AXIS_INDICATOR_SIZE}
      viewBox={`${-half} ${-half} ${AXIS_INDICATOR_SIZE} ${AXIS_INDICATOR_SIZE}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle className="axis-indicator-backdrop" r={half - 1} />
      {Object.entries(AXIS_COLOURS).map(([axis, colour]) => (
        <g key={axis} data-axis={axis} style={{ color: colour }}>
          <line x1="0" y1="0" x2="0" y2="0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <text x="0" y="0" fill="currentColor" textAnchor="middle" dominantBaseline="central">
            {axis}
          </text>
        </g>
      ))}
      <circle data-axis-origin="" className="axis-indicator-origin" r="2" />
    </svg>
  );
});

export default AxisIndicator;
