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
// Corresponds to a ~1280px-wide buffer; only prevents a divide-by-undefined;
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

  if (!Number.isFinite(value)) {
    value = fallback;
  }

  return Math.min(
    maxPointSize,
    Math.max(minPointSize, value)
  );
}

/**
 * OPTIONAL helper. Queries the actual WebGL context's supported point-size
 * range (ALIASED_POINT_SIZE_RANGE) so the integration layer (ThreeScene.jsx),
 * which has the renderer, can pass it to buildPointCloud() as
 * `hardwarePointSizeRange`.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{min:number, max:number} | null}
 */
export function getHardwarePointSizeRange(renderer) {
  try {
    const gl = renderer.getContext();
    const range = gl.getParameter(
      gl.ALIASED_POINT_SIZE_RANGE
    );

    if (!range || range.length < 2) {
      return null;
    }

    if (
      !Number.isFinite(range[0]) ||
      !Number.isFinite(range[1])
    ) {
      return null;
    }

    return {
      min: range[0],
      max: range[1],
    };
  } catch {
    return null;
  }
}

// Textured symbols normally preserve the source image colour.
//
// Generic event spheres can instead be rendered procedurally so the active
// marker colour remains visible while each event still reads visually as a
// shaded sphere.
export function buildPointFragmentShaderSource({
  hasTexture = false,
  tintTextureWithVertexColor = false,
  renderAsShadedSphere = false,
} = {}) {
  return `
    varying vec3 vColor;
    ${
      hasTexture
        ? "uniform sampler2D pointTexture;"
        : ""
    }

    void main() {
      ${
        hasTexture
          ? `
      vec4 texel = texture2D(
        pointTexture,
        gl_PointCoord
      );

      if (texel.a < 0.05) discard;

      gl_FragColor = vec4(
        ${
          tintTextureWithVertexColor
            ? "texel.rgb * vColor"
            : "texel.rgb"
        },
        texel.a
      );
      `
          : renderAsShadedSphere
            ? `
      vec2 coord =
        gl_PointCoord - vec2(0.5);

      float r = length(coord);

      if (r > 0.5) discard;

      // Convert the 2D sprite coordinate into a fake
      // front-facing sphere normal.
      vec2 sphereXY =
        coord / 0.5;

      float z = sqrt(
        max(
          0.0,
          1.0 - dot(
            sphereXY,
            sphereXY
          )
        )
      );

      vec3 normal = normalize(
        vec3(
          sphereXY,
          z
        )
      );

      // Directional light from upper-left/front.
      vec3 lightDir = normalize(
        vec3(
          -0.5,
          0.65,
          1.0
        )
      );

      float diffuse = max(
        dot(
          normal,
          lightDir
        ),
        0.0
      );

      // Keep the shadow side visibly darker.
      float lighting =
        0.22 +
        0.78 * diffuse;

      // Specular highlight.
      vec3 viewDir =
        vec3(
          0.0,
          0.0,
          1.0
        );

      vec3 reflectDir = reflect(
        -lightDir,
        normal
      );

      float specular = pow(
        max(
          dot(
            viewDir,
            reflectDir
          ),
          0.0
        ),
        18.0
      );

      vec3 sphereColor =
        vColor * lighting +
        vec3(
          specular * 0.55
        );

      // Dark outer rim so overlapping markers are
      // easier to distinguish in dense clusters.
      float outlineStart = 0.42;

      if (r > outlineStart) {
        float edge = smoothstep(
          outlineStart,
          0.5,
          r
        );

        sphereColor = mix(
          sphereColor,
          vec3(
            0.04,
            0.04,
            0.04
          ),
          edge * 0.9
        );
      }

      // Soft anti-aliased edge.
      float alpha =
        1.0 -
        smoothstep(
          0.47,
          0.5,
          r
        );

      gl_FragColor =
        vec4(
          sphereColor,
          alpha
        );
      `
            : `
      vec2 coord =
        gl_PointCoord -
        vec2(0.5);

      if (
        length(coord) > 0.5
      ) {
        discard;
      }

      gl_FragColor =
        vec4(
          vColor,
          1.0
        );
      `
      }
    }
  `;
}

/**
 * Build one THREE.Points object for a point series.
 *
 * @param {object} pointSeriesData
 * @param {object} [options]
 * @param {Function} [options.colorFn]
 * @param {Function} [options.sizeFn]
 * @param {THREE.Texture|null} [options.pointTexture]
 * @param {string} [options.distanceAttenuation]
 * @param {number} [options.cameraParallel]
 * @param {number} [options.pointScaleFactor]
 * @param {number} [options.markerDisplayScale]
 * @param {number} [options.parallelCartoonScale]
 * @param {number} [options.pixelSizeNVCx]
 * @param {{min:number,max:number}|null} [options.hardwarePointSizeRange]
 * @param {number} [options.minScreenPointSize]
 * @param {number} [options.maxScreenPointSize]
 * @param {number} [options.minPointSize]
 * @param {number} [options.maxPointSize]
 * @param {boolean} [options.tintTextureWithVertexColor]
 * @param {boolean} [options.renderAsShadedSphere]
 * @param {number} [options.sizeAttenuationFactor]
 */
export function buildPointCloud(
  pointSeriesData,
  options = {}
) {
  const {
    points,
    color,
    size,
  } = pointSeriesData ?? {};

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

    tintTextureWithVertexColor = false,

    renderAsShadedSphere = false,
  } = options;

  // These are numeric clamp bounds only.
  //
  // The semantic marker mapping can still be inverted
  // (e.g. data-min -> size 25, data-max -> size 1).
  const rawMinimumSize =
    Number.isFinite(minPointSize)
      ? minPointSize
      : 2;

  const rawMaximumSize =
    Number.isFinite(maxPointSize)
      ? maxPointSize
      : 40;

  const minimumSize = Math.min(
    rawMinimumSize,
    rawMaximumSize
  );

  const maximumSize = Math.max(
    rawMinimumSize,
    rawMaximumSize
  );

  const validatedClamp =
    validateScreenSizeClamp(
      minScreenPointSize,
      maxScreenPointSize
    );

  if (
    validatedClamp.usedFallback
  ) {
    console.warn(
      `buildPointCloud: invalid screen-size clamp (${minScreenPointSize}, ${maxScreenPointSize}) ` +
        "— falling back to defaults."
    );
  }

  const screenClamp =
    intersectHardwareLimit(
      validatedClamp,
      hardwarePointSizeRange
    );

  const {
    valid: validPoints,
    invalidCount,
    totalCount,
  } = validatePoints(points);

  const positions =
    new Float32Array(
      validPoints.length * 3
    );

  validPoints.forEach(
    (point, index) => {
      positions[
        index * 3
      ] = point.x;

      positions[
        index * 3 + 1
      ] = point.y;

      positions[
        index * 3 + 2
      ] = point.z;
    }
  );

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  geometry.userData.sourceIndices =
    validPoints.map(
      (point, index) =>
        Number.isInteger(
          point.sourceIndex
        )
          ? point.sourceIndex
          : index
    );

  geometry.userData.points =
    validPoints;

  if (colorFn) {
    const colors =
      new Float32Array(
        validPoints.length * 3
      );

    validPoints.forEach(
      (point, index) => {
        const pointColor =
          safeColor(
            colorFn,
            point
          );

        colors[
          index * 3
        ] = pointColor.r;

        colors[
          index * 3 + 1
        ] = pointColor.g;

        colors[
          index * 3 + 2
        ] = pointColor.b;
      }
    );

    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        colors,
        3
      )
    );
  }

  geometry.computeBoundingSphere();

  const attenuationParameters =
    resolveDistanceAttenuation(
      distanceAttenuation
    );

  const usesMxrapAttenuation =
    Boolean(
      attenuationParameters
    );

  const parallel =
    cameraParallel
      ? 1
      : 0;

  const branch =
    usesMxrapAttenuation
      ? selectPointSizeBranch({
          a:
            attenuationParameters.a,
          b:
            attenuationParameters.b,
          cameraParallel:
            parallel,
        })
      : POINT_SIZE_BRANCHES.LEGACY;

  const safePixelSizeNVCx =
    Number.isFinite(
      pixelSizeNVCx
    ) &&
    pixelSizeNVCx > 0
      ? pixelSizeNVCx
      : DEFAULT_PIXEL_SIZE_NVCX;

  let material;

  // A procedurally shaded sphere needs the custom
  // shader even when it has a constant size.
  if (
    sizeFn ||
    usesMxrapAttenuation ||
    renderAsShadedSphere
  ) {
    const sizes =
      new Float32Array(
        validPoints.length
      );

    validPoints.forEach(
      (point, index) => {
        sizes[index] =
          sizeFn
            ? safeSize(
                sizeFn,
                point,
                minimumSize,
                maximumSize
              )
            : Number.isFinite(
                  size
                )
              ? size
              : 0.15;
      }
    );

    geometry.setAttribute(
      "pointSize",
      new THREE.BufferAttribute(
        sizes,
        1
      )
    );

    const hasColor =
      Boolean(colorFn);

    let uniforms;

    if (
      branch ===
      POINT_SIZE_BRANCHES.PERSPECTIVE
    ) {
      uniforms = {
        distanceAttenuationA: {
          value:
            attenuationParameters.a,
        },

        distanceAttenuationB: {
          value:
            attenuationParameters.b,
        },

        distanceAttenuationC: {
          value:
            attenuationParameters.c,
        },

        pointScaleFactor: {
          value:
            Number.isFinite(
              pointScaleFactor
            )
              ? pointScaleFactor
              : 1,
        },
      };
    } else if (
      branch ===
      POINT_SIZE_BRANCHES.ORTHO_CARTOON
    ) {
      uniforms = {
        parallelCartoonScale: {
          value:
            Number.isFinite(
              parallelCartoonScale
            )
              ? parallelCartoonScale
              : 1,
        },

        pixelSizeNVCx: {
          value:
            safePixelSizeNVCx,
        },
      };
    } else if (
      branch ===
      POINT_SIZE_BRANCHES.PARALLEL
    ) {
      uniforms = {
        pixelSizeNVCx: {
          value:
            safePixelSizeNVCx,
        },
      };
    } else {
      uniforms = {
        sizeAttenuationFactor: {
          value:
            Number.isFinite(
              sizeAttenuationFactor
            )
              ? sizeAttenuationFactor
              : 20,
        },
      };
    }

    uniforms.minScreenPointSize = {
      value:
        screenClamp.min,
    };

    uniforms.markerDisplayScale = {
      value:
        Number.isFinite(
          markerDisplayScale
        ) &&
        markerDisplayScale > 0
          ? markerDisplayScale
          : 1,
    };

    uniforms.maxScreenPointSize = {
      value:
        screenClamp.max,
    };

    if (pointTexture) {
      uniforms.pointTexture = {
        value:
          pointTexture,
      };
    }

    if (!hasColor) {
      const flatColor =
        new THREE.Color(
          color ?? 0xffcc00
        );

      uniforms.flatColor = {
        value:
          new THREE.Vector3(
            flatColor.r,
            flatColor.g,
            flatColor.b
          ),
      };
    }

    material =
      new THREE.ShaderMaterial({
        uniforms,

        vertexShader:
          buildSizeVertexShaderSource({
            branch,
            hasColor,
          }),

        fragmentShader:
          buildPointFragmentShaderSource({
            hasTexture:
              Boolean(
                pointTexture
              ),

            tintTextureWithVertexColor,

            renderAsShadedSphere,
          }),

        vertexColors:
          hasColor,

        transparent:
          Boolean(
            pointTexture
          ) ||
          renderAsShadedSphere,

        depthTest: true,

        depthWrite: true,
      });
  } else {
    const hasTexture =
      Boolean(
        pointTexture
      );

    const useVertexColors =
      Boolean(colorFn) &&
      (
        !hasTexture ||
        tintTextureWithVertexColor
      );

    material =
      new THREE.PointsMaterial({
        color:
          hasTexture ||
          colorFn
            ? 0xffffff
            : color ??
              0xffcc00,

        vertexColors:
          useVertexColors,

        size:
          Number.isFinite(
            size
          )
            ? size
            : 0.15,

        sizeAttenuation:
          true,

        map:
          pointTexture,

        transparent:
          hasTexture,

        alphaTest:
          hasTexture
            ? 0.05
            : 0,

        depthTest: true,

        depthWrite: true,
      });
  }

  const pointCloud =
    new THREE.Points(
      geometry,
      material
    );

  pointCloud.userData.validation = {
    totalCount,
    validCount:
      validPoints.length,
    invalidCount,
  };

  pointCloud.userData.distanceAttenuation =
    attenuationParameters
      ? {
          model:
            distanceAttenuation,
          ...attenuationParameters,
        }
      : null;

  pointCloud.userData.pointSizing = {
    branch,

    cameraParallel:
      usesMxrapAttenuation
        ? parallel
        : null,

    model:
      usesMxrapAttenuation
        ? distanceAttenuation
        : null,

    screenClamp: {
      ...screenClamp,
    },
  };

  return pointCloud;
}