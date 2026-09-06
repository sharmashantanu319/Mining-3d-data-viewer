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
const DISTANCE_ATTENUATION_MODELS = {
  cartoon: { a: 0, b: 0.0012, c: 1.2e-7 },
  real: { a: 0, b: 0, c: 1.2e-6 },
  fixed: { a: 1.2, b: 0, c: 0 },
};

function resolveDistanceAttenuation(model) {
  return DISTANCE_ATTENUATION_MODELS[model] ?? null;
}

/**
 * Validate the final screen-size clamp bounds. Falls back to safe defaults
 * if either value is non-finite, negative, or if min > max — these are
 * exactly the "invalid screen-limit options" cases the review flagged.
 *
 * Units: framebuffer pixels — `gl_PointSize` is always specified in
 * framebuffer pixels per the WebGL/GLSL spec, NOT CSS pixels.
 * `renderer.setPixelRatio(dpr)` changes the drawing buffer's resolution
 * (the framebuffer becomes dpr× larger in each dimension) — it does NOT
 * modify the projection matrix. Because of this, the same
 * gl_PointSize value corresponds to a SMALLER apparent size in CSS
 * pixels as dpr increases (e.g. a 96-framebuffer-pixel point appears
 * roughly 48 CSS pixels wide at dpr=2), since more framebuffer pixels
 * are packed into the same CSS-pixel area.
 *
 * Default minimum is 2 (not 1): earlier testing found that a literal
 * 1px clamp floor did not reliably render as a visible pixel in a
 * software (SwiftShader) WebGL context, supporting the general product
 * guidance that single-pixel points are an unreliable target across
 * GPUs/drivers — 2 framebuffer pixels is a safer conservative floor,
 * still to be confirmed on real GPU hardware.
 *
 * This function does NOT query GPU-specific limits such as
 * `ALIASED_POINT_SIZE_RANGE` — it has no access to a WebGL context
 * (buildPointCloud is renderer-agnostic by design). See
 * `getHardwarePointSizeRange()` below for an optional helper the
 * integration layer (ThreeScene.jsx) can use to query real hardware
 * limits and pass an appropriately-bounded maxScreenPointSize in; that
 * wiring is NOT done automatically here and remains follow-up work.
 *
 * @param {number} minScreenPointSize
 * @param {number} maxScreenPointSize
 * @returns {{min:number, max:number}}
 */
function validateScreenSizeClamp(minScreenPointSize, maxScreenPointSize) {
  const DEFAULT_MIN = 2;
  const DEFAULT_MAX = 96;

  let min = Number.isFinite(minScreenPointSize) && minScreenPointSize >= 0
    ? minScreenPointSize
    : DEFAULT_MIN;
  let max = Number.isFinite(maxScreenPointSize) && maxScreenPointSize >= 0
    ? maxScreenPointSize
    : DEFAULT_MAX;

  if (min > max) {
    console.warn(
      `buildPointCloud: minScreenPointSize (${minScreenPointSize}) > maxScreenPointSize ` +
      `(${maxScreenPointSize}) — falling back to defaults (${DEFAULT_MIN}, ${DEFAULT_MAX}).`
    );
    min = DEFAULT_MIN;
    max = DEFAULT_MAX;
  }

  return { min, max };
}

/**
 * OPTIONAL helper, NOT called automatically by buildPointCloud(). Queries
 * the actual WebGL context's supported point-size range
 * (ALIASED_POINT_SIZE_RANGE) so an integration layer that DOES have
 * access to the renderer (e.g. ThreeScene.jsx) can clamp
 * maxScreenPointSize to a value the current GPU/driver actually supports,
 * rather than assuming any fixed constant works everywhere.
 *
 * This is explicitly left unwired — see REPORT.md "Remaining work".
 *
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{min:number, max:number} | null} null if the range can't be queried
 */
export function getHardwarePointSizeRange(renderer) {
  try {
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    if (!range || range.length < 2) return null;
    return { min: range[0], max: range[1] };
  } catch (e) {
    return null;
  }
}

function buildSizeVertexShader(hasColor, usesMxrapAttenuation) {
  return `
    attribute float pointSize;
    ${
      usesMxrapAttenuation
        ? `uniform float distanceAttenuationA;
    uniform float distanceAttenuationB;
    uniform float distanceAttenuationC;
    uniform float pointScaleFactor;`
        : "uniform float sizeAttenuationFactor;"
    }
    // Final screen-size clamp (framebuffer pixels — gl_PointSize is
    // always specified in framebuffer pixels per the WebGL/GLSL spec,
    // NOT CSS pixels; see validateScreenSizeClamp()'s doc comment for how
    // renderer.setPixelRatio() changes the drawing-buffer resolution and
    // therefore the relationship between framebuffer and CSS pixels — it
    // does NOT modify the projection matrix). Applied identically to
    // both the real customer attenuation path and the legacy linear
    // fallback path, since both were observed to be capable of producing
    // runaway point sizes at close camera range.
    uniform float minScreenPointSize;
    uniform float maxScreenPointSize;
    ${hasColor ? "" : "uniform vec3 flatColor;"}
    varying vec3 vColor;

    void main() {
      vColor = ${hasColor ? "color" : "flatColor"};
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float rawPointSize;
      ${
        usesMxrapAttenuation
          ? `float d = max(0.0, -mvPosition.z);
      float denominator = max(
        distanceAttenuationA +
        distanceAttenuationB * d +
        distanceAttenuationC * d * d,
        0.000000000001
      );
      float attenuation = sqrt(1.0 / denominator);
      rawPointSize = pointScaleFactor * attenuation * pointSize;`
          : "rawPointSize = pointSize * (sizeAttenuationFactor / max(0.000001, -mvPosition.z));"
      }
      gl_PointSize = clamp(rawPointSize, minScreenPointSize, maxScreenPointSize);
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
 *
 * @param {object} pointSeriesData
 * @param {object} [options]
 * @param {number} [options.minScreenPointSize] - Final clamp floor, in
 *   framebuffer pixels (see shader comment — NOT CSS pixels). Applied
 *   after distance attenuation on both the real customer attenuation path
 *   and the legacy fallback path. Defaults to 2 if omitted/invalid (see
 *   validateScreenSizeClamp() for why 2 rather than 1).
 * @param {number} [options.maxScreenPointSize] - Final clamp ceiling, same
 *   units as minScreenPointSize. Defaults to 96 if omitted/invalid. This is
 *   a conservative default, not tied to any specific GPU's
 *   ALIASED_POINT_SIZE_RANGE — callers rendering on unusual hardware should
 *   query that range themselves and pick a compatible value.
 */
export function buildPointCloud(pointSeriesData, options = {}) {
  const { points, color, size } = pointSeriesData ?? {};
  const {
    colorFn,
    sizeFn,
    sizeAttenuationFactor = 20,
    minPointSize = 2,
    maxPointSize = 40,
    distanceAttenuation,
    pointScaleFactor = 1,
    minScreenPointSize,
    maxScreenPointSize,
  } = options;

  const minimumSize = Number.isFinite(minPointSize) ? minPointSize : 2;
  const maximumSize = Number.isFinite(maxPointSize)
    ? Math.max(maxPointSize, minimumSize)
    : Math.max(40, minimumSize);
  const screenClamp = validateScreenSizeClamp(minScreenPointSize, maxScreenPointSize);
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

  const attenuationParameters = resolveDistanceAttenuation(distanceAttenuation);
  let material;
  if (sizeFn || attenuationParameters) {
    const sizes = new Float32Array(validPoints.length);
    validPoints.forEach((point, index) => {
      sizes[index] = sizeFn
        ? safeSize(sizeFn, point, minimumSize, maximumSize)
        : (Number.isFinite(size) ? size : 0.15);
    });
    geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));

    const hasColor = Boolean(colorFn);
    const uniforms = attenuationParameters
      ? {
          distanceAttenuationA: { value: attenuationParameters.a },
          distanceAttenuationB: { value: attenuationParameters.b },
          distanceAttenuationC: { value: attenuationParameters.c },
          pointScaleFactor: {
            value: Number.isFinite(pointScaleFactor) ? pointScaleFactor : 1,
          },
        }
      : {
          sizeAttenuationFactor: {
            value: Number.isFinite(sizeAttenuationFactor) ? sizeAttenuationFactor : 20,
          },
        };
    uniforms.minScreenPointSize = { value: screenClamp.min };
    uniforms.maxScreenPointSize = { value: screenClamp.max };

    if (!hasColor) {
      const flatColor = new THREE.Color(color ?? 0xffcc00);
      uniforms.flatColor = {
        value: new THREE.Vector3(flatColor.r, flatColor.g, flatColor.b),
      };
    }

    material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: buildSizeVertexShader(hasColor, Boolean(attenuationParameters)),
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
  pointCloud.userData.distanceAttenuation = attenuationParameters
    ? { model: distanceAttenuation, ...attenuationParameters }
    : null;

  return pointCloud;
}
