import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { resolveColourMarker } from "./pointMarkerResolver";
import { mapColour } from "./colourMapping";
import { lineColourSeries } from "./lineSeriesData";

export const HAIRLINE_OPACITY = 0.25;

function vertexKey(point) {
  return point.id ?? `${point.x},${point.y},${point.z}`;
}

export function buildLineSegments(series) {
  const marker = resolveColourMarker(lineColourSeries(series));
  const positions = [];
  const colours = [];
  const linear = new THREE.Color();
  // Neighbouring lines can share an edge (each quad of a response-volume
  // sphere repeats the edges of the quads around it). Draw each edge once:
  // a repeat adds nothing when opaque and doubles the opacity when the
  // lines are translucent. Colours are per vertex, so a shared edge looks
  // the same from either line.
  const drawnEdges = new Set();
  for (const line of series.lines) {
    for (let i = 1; i < line.points.length; i++) {
      const a = vertexKey(line.points[i - 1]);
      const b = vertexKey(line.points[i]);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (drawnEdges.has(edge)) continue;
      drawnEdges.add(edge);
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
  const segmentCount = positions.length / 6;
  const width = Number.isFinite(series.lineWidth) ? series.lineWidth : 0;
  let object;
  if (width > 1) {
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
      // Native WebGL line widths are fixed at 1px. Wide-line triangles
      // preserve the export's screen-space width in both camera modes.
      linewidth: width,
      worldUnits: false,
    });
    object = new LineSegments2(geometry, material);
  } else {
    // Hairlines (lineWidth 0 or 1, e.g. the response-volume spheres) are
    // native 1-device-pixel GL lines. Wide-line triangles are at least one
    // CSS pixel (two device pixels on a Retina screen), which turned a
    // 35,000-quad wireframe sphere into a solid ball. They are also drawn
    // semi-transparent without writing depth, so a dense wireframe never
    // hides the events and excavations inside or behind it - in the
    // client's mXrap screenshots those stay visible through the sphere.
    const geometry = new THREE.BufferGeometry();
    if (positions.length) {
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    }
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: HAIRLINE_OPACITY,
      depthWrite: false,
    });
    object = new THREE.LineSegments(geometry, material);
  }
  object.userData.segmentCount = segmentCount;
  object.visible = series.visible !== false && segmentCount > 0;
  return object;
}

export function lineObjectHasSegments(object) {
  return (object?.userData?.segmentCount ?? 0) > 0;
}
