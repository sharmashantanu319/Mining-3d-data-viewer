import { forwardRef } from "react";

// Coordinate labels for the plan-view grid (planGrid.js) and a one-line hint
// on how to move around in a plan view. ThreeScene positions the labels on
// every camera change through updatePlanGridLabels, so React renders this
// once.
const PlanGridLabels = forwardRef(function PlanGridLabels(_props, ref) {
  return (
    <div ref={ref} className="plan-grid-overlay" hidden aria-hidden="true">
      <div data-plan-grid-labels="" />
      <div className="plan-grid-hint">Drag to move · Shift-drag to rotate</div>
    </div>
  );
});

export default PlanGridLabels;

// Labels that would sit under the XYZ indicator (bottom left) or the camera
// toolbar (top) are left out.
const INDICATOR_CLEARANCE = 92;
const TOOLBAR_CLEARANCE = 56;

/**
 * Shows the grid's labels, or hides the overlay when `grid` is null.
 *
 * @param {HTMLElement|null} overlay the element PlanGridLabels renders
 * @param {ReturnType<import("./planGrid").computePlanGrid>} grid
 * @param {number} width view width in CSS pixels
 * @param {number} height view height in CSS pixels
 */
export function updatePlanGridLabels(overlay, grid, width, height) {
  if (!overlay) return;
  overlay.hidden = !grid;
  if (!grid) return;
  const container = overlay.querySelector("[data-plan-grid-labels]");
  if (!container) return;

  const labels = grid.lines
    .map((line) => line.label)
    .filter((label) => label
      && !(label.x < INDICATOR_CLEARANCE && label.y > height - INDICATOR_CLEARANCE)
      && label.y > TOOLBAR_CLEARANCE
      && label.x < width);

  while (container.children.length < labels.length) {
    const span = document.createElement("span");
    span.className = "plan-grid-label";
    container.appendChild(span);
  }
  [...container.children].forEach((span, index) => {
    const label = labels[index];
    span.hidden = !label;
    if (!label) return;
    span.textContent = label.text;
    span.style.transform = label.edge === "bottom"
      ? `translate(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px) translate(-50%, calc(-100% - 6px))`
      : `translate(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px) translate(6px, -50%)`;
  });
}
