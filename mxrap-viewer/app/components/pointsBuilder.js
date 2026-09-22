// Convert mXrap point-series rows into an efficient Three.js point cloud.

import * as THREE from "three";
import {
  resolveDistanceAttenuation,
  validateScreenSizeClamp,
  intersectHardwareLimit,
  selectPointSizeBranch,
  buildSizeVertexShaderSource,
  POINT_SIZE_BRANCHES,
} from "./pointSizing";

// Fallback for `mx_pixelSizeNVC.x` (= 2 / drawing-buffer width) when a caller
// uses an orthographic branch without wiring the real viewport width in.
// Corresponds to a ~1280px-wide buffer; only prevents a divide-by-undefined,
// ThreeScene always passes and keeps the real value updated.
const DEFAULT_PIXEL_SIZE_NVCX = 2 / 1280;

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

/**
 * OPTIONAL helper. Queries the actual WebGL context's supported point-size
 * range (ALIASED_POINT_SIZE_RANGE) so the integration layer (ThreeScene.jsx),
 * which has the renderer, can pass it to buildPointCloud() as
 * `hardwarePointSizeRange` — the final screen clamp is then intersected with
 * it (see intersectHardwareLimit in pointSizing.js) rather than assuming a
 * fixed ceiling works on every GPU/driver.
 *
 * `buildPointCloud` itself is renderer-agnostic and never calls this.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{min:number, max:number} | null} null if the range can't be queried
 */
export function getHardwarePointSizeRange(renderer) {
  try {
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    if (!range || range.length < 2) return null;
    if (!Number.isFinite(range[0]) || !Number.isFinite(range[1])) return null;
    return { min: range[0], max: range[1] };
  } catch {
    return null;
  }
}

// Symbol (textured) points render the texture's own colour untouched
// (client decision: symbol colour should reflect the data file, not the
// active colour marker) — only the alpha channel is used, to discard
// transparent pixels. Untextured points keep the existing per-vertex/flat
// colour driven by the active colour marker.
export function buildPointFragmentShaderSource({ hasTexture = false } = {}) {
  return `
    varying vec3 vColor;
    ${hasTexture ? "uniform sampler2D pointTexture;" : ""}

    void main() {
      ${
        hasTexture
          ? `vec4 texel = texture2D(pointTexture, gl_PointCoord);
      if (texel.a < 0.05) discard;
      gl_FragColor = vec4(texel.rgb, texel.a);`
          : `vec2 coord = gl_PointCoord - vec2(0.5);
      if (length(coord) > 0.5) discard;
      gl_FragColor = vec4(vColor, 1.0);`
      }
    }
  `;
}

/**
 * Build one THREE.Points object for a point series.
 *
 * Validation counts are exposed through pointCloud.userData.validation and the
 * resolved size model through pointCloud.userData.pointSizing; the return type
 * stays backward-compatible.
 *
 * @param {object} pointSeriesData
 * @param {object} [options]
 * @param {Function} [options.colorFn] - point -> {r,g,b} in 0..1
 * @param {Function} [options.sizeFn] - point -> per-point marker size
 * @param {THREE.Texture|null} [options.pointTexture] - shared symbol texture for this batch
 * @param {string} [options.distanceAttenuation] - "cartoon" | "real" | "fixed"
 * @param {number} [options.cameraParallel] - 0 perspective (default), 1 orthographic
 * @param {number} [options.pointScaleFactor] - renderWindowDPI / 72 (perspective branch)
 * @param {number} [options.markerDisplayScale] - display multiplier after projection, before screen clamp (default 1)
 * @param {number} [options.parallelCartoonScale] - orthographic "cartoon" branch factor
 * @param {number} [options.pixelSizeNVCx] - 2 / drawing-buffer width (orthographic branches)
 * @param {{min:number,max:number}|null} [options.hardwarePointSizeRange] - from getHardwarePointSizeRange()
 * @param {number} [options.minScreenPointSize] - final clamp floor, framebuffer px (default 2)
 * @param {number} [options.maxScreenPointSize] - final clamp ceiling, framebuffer px (default 96)
 * @param {number} [options.minPointSize] - clamp applied to sizeFn output (default 2)
 * @param {number} [options.maxPointSize] - clamp applied to sizeFn output (default 40)
 * @param {number} [options.sizeAttenuationFactor] - legacy fallback only (default 20)
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
    cameraParallel = 0,
    pointScaleFactor = 1,
    markerDisplayScale = 1,
    parallelCartoonScale,
    pixelSizeNVCx,
    hardwarePointSizeRange = null,
    minScreenPointSize,
    maxScreenPointSize,
    pointTexture = null,
  } = options;

  const minimumSize = Number.isFinite(minPointSize) ? minPointSize : 2;
  const maximumSize = Number.isFinite(maxPointSize)
    ? Math.max(maxPointSize, minimumSize)
    : Math.max(40, minimumSize);

  const validatedClamp = validateScreenSizeClamp(minScreenPointSize, maxScreenPointSize);
  if (validatedClamp.usedFallback) {
    console.warn(
      `buildPointCloud: invalid screen-size clamp (${minScreenPointSize}, ${maxScreenPointSize}) ` +
        "— falling back to defaults."
    );
  }
  const screenClamp = intersectHardwareLimit(validatedClamp, hardwarePointSizeRange);

  const { valid: validPoints, invalidCount, totalCount } = validatePoints(points);

  const positions = new Float32Array(validPoints.length * 3);
  validPoints.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.userData.sourceIndices = validPoints.map((point, index) =>
    Number.isInteger(point.sourceIndex) ? point.sourceIndex : index
  );
  geometry.userData.points = validPoints;

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
  const usesMxrapAttenuation = Boolean(attenuationParameters);
  const parallel = cameraParallel ? 1 : 0;
  const branch = usesMxrapAttenuation
    ? selectPointSizeBranch({
        a: attenuationParameters.a,
        b: attenuationParameters.b,
        cameraParallel: parallel,
      })
    : POINT_SIZE_BRANCHES.LEGACY;

  const safePixelSizeNVCx =
    Number.isFinite(pixelSizeNVCx) && pixelSizeNVCx > 0
      ? pixelSizeNVCx
      : DEFAULT_PIXEL_SIZE_NVCX;

  let material;
  if (sizeFn || usesMxrapAttenuation) {
    const sizes = new Float32Array(validPoints.length);
    validPoints.forEach((point, index) => {
      sizes[index] = sizeFn
        ? safeSize(sizeFn, point, minimumSize, maximumSize)
        : Number.isFinite(size)
          ? size
          : 0.15;
    });
    geometry.setAttribute("pointSize", new THREE.BufferAttribute(sizes, 1));

    const hasColor = Boolean(colorFn);

    let uniforms;
    if (branch === POINT_SIZE_BRANCHES.PERSPECTIVE) {
      uniforms = {
        distanceAttenuationA: { value: attenuationParameters.a },
        distanceAttenuationB: { value: attenuationParameters.b },
        distanceAttenuationC: { value: attenuationParameters.c },
        pointScaleFactor: {
          value: Number.isFinite(pointScaleFactor) ? pointScaleFactor : 1,
        },
      };
    } else if (branch === POINT_SIZE_BRANCHES.ORTHO_CARTOON) {
      uniforms = {
        parallelCartoonScale: {
          value: Number.isFinite(parallelCartoonScale) ? parallelCartoonScale : 1,
        },
        pixelSizeNVCx: { value: safePixelSizeNVCx },
      };
    } else if (branch === POINT_SIZE_BRANCHES.PARALLEL) {
      uniforms = {
        pixelSizeNVCx: { value: safePixelSizeNVCx },
      };
    } else {
      uniforms = {
        sizeAttenuationFactor: {
          value: Number.isFinite(sizeAttenuationFactor) ? sizeAttenuationFactor : 20,
        },
      };
    }
    uniforms.minScreenPointSize = { value: screenClamp.min };
    uniforms.markerDisplayScale = {
      value: Number.isFinite(markerDisplayScale) && markerDisplayScale > 0 ? markerDisplayScale : 1,
    };
    uniforms.maxScreenPointSize = { value: screenClamp.max };
    if (pointTexture) uniforms.pointTexture = { value: pointTexture };

    if (!hasColor) {
      const flatColor = new THREE.Color(color ?? 0xffcc00);
      uniforms.flatColor = {
        value: new THREE.Vector3(flatColor.r, flatColor.g, flatColor.b),
      };
    }

    material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: buildSizeVertexShaderSource({ branch, hasColor }),
      fragmentShader: buildPointFragmentShaderSource({ hasTexture: Boolean(pointTexture) }),
      vertexColors: hasColor,
      transparent: Boolean(pointTexture),
    });
  } else {
    const hasTexture = Boolean(pointTexture);
    material = new THREE.PointsMaterial({
      // Symbol images show their own original colours from the data file
      // and are never tinted by the active colour marker (client decision).
      // Points with no symbol (circle fallback) keep the existing
      // vertex-colour behaviour.
      color: hasTexture || colorFn ? 0xffffff : color ?? 0xffcc00,
      vertexColors: hasTexture ? false : Boolean(colorFn),
      size: Number.isFinite(size) ? size : 0.15,
      sizeAttenuation: true,
      map: pointTexture,
      transparent: hasTexture,
      alphaTest: hasTexture ? 0.05 : 0,
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
  pointCloud.userData.pointSizing = {
    branch,
    cameraParallel: usesMxrapAttenuation ? parallel : null,
    model: usesMxrapAttenuation ? distanceAttenuation : null,
    screenClamp: { ...screenClamp },
  };

  return pointCloud;
}
