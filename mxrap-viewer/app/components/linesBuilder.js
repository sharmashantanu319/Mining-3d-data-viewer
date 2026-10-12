import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { resolveColourMarker } from "./pointMarkerResolver";
import { mapColour } from "./colourMapping";
import { lineColourSeries } from "./lineSeriesData";

export function buildLineSegments(series) {
  const marker = resolveColourMarker(lineColourSeries(series));
  const positions = [];
  const colours = [];
  const linear = new THREE.Color();
  for (const line of series.lines) {
    for (let i = 1; i < line.points.length; i++) {
      for (const point of [line.points[i - 1], line.points[i]]) {
        positions.push(point.x, point.y, point.z);
        if (marker) {
          const colour = mapColour(point[marker.input], marker);
          linear.setRGB(colour.r, colour.g, colour.b, THREE.SRGBColorSpace);
        } else {
          linear.set(series.color ?? 0xcccccc);
        }
        colours.push(linear.r, linear.g, linear.b);
      }
    }
  }
  const geometry = new LineSegmentsGeometry();
  if (positions.length) {
    geometry.setPositions(positions);
    geometry.setColors(colours);
  } else {
    geometry.instanceCount = 0;
  }
  const material = new LineMaterial({
    color: 0xffffff,
    vertexColors: true,
    // Native WebGL line widths are often fixed at 1px. Wide-line triangles
    // preserve the export's screen-space width in both camera modes.
    linewidth: Number.isFinite(series.lineWidth) && series.lineWidth > 0 ? series.lineWidth : 1,
    worldUnits: false,
  });
  const object = new LineSegments2(geometry, material);
  object.visible = series.visible !== false && positions.length > 0;
  return object;
}
