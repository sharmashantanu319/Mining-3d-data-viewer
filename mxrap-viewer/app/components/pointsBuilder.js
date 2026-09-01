// Convert mXrap point-series rows into an efficient Three.js point cloud.

import * as THREE from "three";

function validatePoints(points) {
  if (!Array.isArray(points)) {
    console.warn(
      "buildPointCloud: `points` is missing or not an array; rendering an empty point cloud."
    );
    return { valid: [], invalidCount: 0, totalCount: 0 };
  }

  const valid = [];
  let invalidCount = 0;

  for (const point of points) {
    if (
      point &&
      typeof point === "object" &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
    ) {
      valid.push(point);
    } else {
      invalidCount += 1;
    }
  }

  if (invalidCount > 0) {
    console.warn(
      `buildPointCloud: skipped ${invalidCount} of ${points.length} points ` +
        "with missing or invalid X/Y/Z coordinates."
    );
  }

  return { valid, invalidCount, totalCount: points.length };
}

function safeColor(colorFn, point) {
  const fallback = { r: 1, g: 0, b: 1 };

  try {
    const color = colorFn(point);
    if (
      !color ||
      !Number.isFinite(color.r) ||
      !Number.isFinite(color.g) ||
      !Number.isFinite(color.b)
    ) {
      return fallback;
    }
    return color;
  } catch {
    return fallback;
  }
}

function safeSize(sizeFn, point, minPointSize, maxPointSize) {
  const fallback = (minPointSize + maxPointSize) / 2;
  let value;

  try {
    value = sizeFn(point);
  } catch {
    value = fallback;
  }

  if (!Number.isFinite(value)) value = fallback;
  return Math.min(maxPointSize, Math.max(minPointSize, value));
}

// Three.js only declares the built-in `color` attribute when vertex colours
// are enabled. The size-only shader therefore uses a flat colour uniform.
function buildSizeVertexShader(hasColor) {
  return `
    attribute float pointSize;
    uniform float sizeAttenuationFactor;
    ${hasColor ? "" : "uniform vec3 flatColor;"}
    varying vec3 vColor;

    void main() {
      vColor = ${hasColor ? "color" : "flatColor"};
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = pointSize * (sizeAttenuationFactor / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
}

const SIZE_FRAGMENT_SHADER = `
  varying vec3 vColor;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (length(coord) > 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

/**
 * Build one THREE.Points object for a point series.
 *
 * Validation counts are exposed through pointCloud.userData.validation while
 * the return type remains backward-compatible.
 */
export function buildPointCloud(pointSeriesData, options = {}) {
  const { points, color, size } = pointSeriesData ?? {};
  const {
    colorFn,
    sizeFn,
    sizeAttenuationFactor = 20,
    minPointSize = 2,
    maxPointSize = 40,
  } = options;

  const minimumSize = Number.isFinite(minPointSize) ? minPointSize : 2;
  const maximumSize = Number.isFinite(maxPointSize)
    ? Math.max(maxPointSize, minimumSize)
    : Math.max(40, minimumSize);
  const { valid: validPoints, invalidCount, totalCount } = validatePoints(points);

  const positions = new Float32Array(validPoints.length * 3);
  validPoints.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  if (colorFn) {
    const colors = new Float32Array(validPoints.length * 3);
    validPoints.forEach((point, index) => {
      const pointColor = safeColor(colorFn, point);
      colors[index * 3] = pointColor.r;
      colors[index * 3 + 1] = pointColor.g;
      colors[index * 3 + 2] = pointColor.b;
    });
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  geometry.computeBoundingSphere();

  let material;
  if (sizeFn) {
    const sizes = new Float32Array(validPoints.length);
    validPoints.forEach((point, index) => {
      sizes[index] = safeSize(sizeFn, point, minimumSize, maximumSize);
    });
    geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));

    const hasColor = Boolean(colorFn);
    const uniforms = {
      sizeAttenuationFactor: {
        value: Number.isFinite(sizeAttenuationFactor) ? sizeAttenuationFactor : 20,
      },
    };

    if (!hasColor) {
      const flatColor = new THREE.Color(color ?? 0xffcc00);
      uniforms.flatColor = {
        value: new THREE.Vector3(flatColor.r, flatColor.g, flatColor.b),
      };
    }

    material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: buildSizeVertexShader(hasColor),
      fragmentShader: SIZE_FRAGMENT_SHADER,
      vertexColors: hasColor,
    });
  } else {
    material = new THREE.PointsMaterial({
      color: colorFn ? 0xffffff : (color ?? 0xffcc00),
      vertexColors: Boolean(colorFn),
      size: Number.isFinite(size) ? size : 0.15,
      sizeAttenuation: true,
    });
  }

  const pointCloud = new THREE.Points(geometry, material);
  pointCloud.userData.validation = {
    totalCount,
    validCount: validPoints.length,
    invalidCount,
  };

  return pointCloud;
}
