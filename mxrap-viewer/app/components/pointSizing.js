// Pure point-size math for the mXrap marker model.
//
// This module is deliberately free of any `three` import so it can be unit
// tested in isolation (see app/components/__tests__/pointSizing.test.js). It is
// the single source of truth for:
//   - the named distance-attenuation models,
//   - the final screen-size clamp validation,
//   - the GPU hardware point-size intersection,
//   - the Three.js -> VTK `parallelScale` mapping,
//   - which of the customer's gl_PointSize formulas applies, and
//   - the vertex-shader source that implements them.
//
// ---------------------------------------------------------------------------
// Customer specification (mXrap / VTK), provided verbatim:
//
//   if ((mx_distanceAttenuationB > 0 && cameraParallel == 0) ||
//       mx_distanceAttenuationA > 0) {
//     float d = max(0, -gl_Position.z);
//     float attenuation = sqrt(
//       1 / (mx_distanceAttenuationA
//            + mx_distanceAttenuationB * d
//            + mx_distanceAttenuationC * d * d));
//     gl_Position = VCDCMatrix * gl_Position;
//     gl_PointSize = mx_pointScaleFactor * attenuation * mx_pointSize;
//   } else if (mx_distanceAttenuationB > 0) {
//     gl_Position = VCDCMatrix * gl_Position;
//     gl_PointSize = (VCDCMatrix[0][0] * mx_parallelCartoonScale * mx_pointSize)
//                    / (gl_Position.w * mx_pixelSizeNVC.x);
//   } else {
//     gl_Position = VCDCMatrix * gl_Position;
//     gl_PointSize = (VCDCMatrix[0][0] * mx_pointSize)
//                    / (gl_Position.w * mx_pixelSizeNVC.x);
//   }
//
//   cameraParallel        : 0 perspective, 1 orthographic
//   mx_pointSize          : marker output size (our per-point `pointSize`)
//   VCDCMatrix            : view -> device coords (Three.js `projectionMatrix`)
//   mx_pointScaleFactor   : renderWindowDPI / 72.0
//   mx_pixelSizeNVC.x     : 2.0 / viewportWidth  (drawing-buffer px, not CSS)
//
//   parallelCartoonScale = 1.0
//   if parallelScale < 50:   parallelScale / 100.0
//   elif parallelScale < 300: 0.5 + ((parallelScale - 50) / 500.0)
//   else:                     0.5 * log10(parallelScale - 200)
//
// Three.js <-> VTK mapping assumptions (each covered by a test):
//   * `cameraParallel`  <- `camera.isOrthographicCamera ? 1 : 0`
//   * `VCDCMatrix`       = `camera.projectionMatrix`; `VCDCMatrix[0][0]` is
//                          used directly in GLSL via the built-in
//                          `projectionMatrix` uniform.
//   * `parallelScale`   <- orthoParallelScaleFromCamera() below: the frustum
//                          half-height `(top - bottom) / 2` divided by
//                          `camera.zoom` (OrbitControls zooms an orthographic
//                          camera by changing `.zoom`, leaving top/bottom).
//   * `mx_pixelSizeNVC.x` uses `renderer.getDrawingBufferSize().x`, i.e. the
//                          real framebuffer width including devicePixelRatio.
//   * The perspective formula is preserved exactly as it was before this
//     change; only the two parallel branches are new.
// ---------------------------------------------------------------------------

// --- distance-attenuation models ------------------------------------------

// (a, b, c) coefficients of the quadratic denominator. a>0 => distance
// independent ("fixed"); b>0 => "cartoon"; c-only => "real".
export const DISTANCE_ATTENUATION_MODELS = {
  cartoon: { a: 0, b: 0.0012, c: 1.2e-7 },
  real: { a: 0, b: 0, c: 1.2e-6 },
  fixed: { a: 1.2, b: 0, c: 0 },
};

export function resolveDistanceAttenuation(model) {
  return DISTANCE_ATTENUATION_MODELS[model] ?? null;
}

// --- final screen-size clamp --------------------------------------------

// Framebuffer pixels. Minimum is 2 rather than 1: a literal 1px floor was
// found not to render reliably in a software WebGL context.
export const DEFAULT_SCREEN_CLAMP = Object.freeze({ min: 2, max: 96 });

/**
 * Sanitise the caller-supplied final clamp bounds. Non-finite, negative, or
 * reversed (min > max) input falls back to DEFAULT_SCREEN_CLAMP.
 *
 * @returns {{min:number, max:number, usedFallback:boolean}}
 */
export function validateScreenSizeClamp(minScreenPointSize, maxScreenPointSize) {
  const { min: DMIN, max: DMAX } = DEFAULT_SCREEN_CLAMP;

  let min =
    Number.isFinite(minScreenPointSize) && minScreenPointSize >= 0
      ? minScreenPointSize
      : DMIN;
  let max =
    Number.isFinite(maxScreenPointSize) && maxScreenPointSize >= 0
      ? maxScreenPointSize
      : DMAX;

  let usedFallback =
    min !== minScreenPointSize || max !== maxScreenPointSize;

  if (min > max) {
    min = DMIN;
    max = DMAX;
    usedFallback = true;
  }

  return { min, max, usedFallback };
}

/**
 * Intersect a validated screen clamp with the GPU's supported point-size
 * range (ALIASED_POINT_SIZE_RANGE, as returned by getHardwarePointSizeRange).
 *
 * Pure. `hardwareRange` may be null when the range is unknown, in which case
 * the clamp is returned unchanged. If the intersection would be empty, the
 * hardware bounds win outright — asking the GPU for a size it cannot draw is
 * worse than a slightly out-of-policy size.
 *
 * @param {{min:number,max:number}} clamp - already validated
 * @param {{min:number,max:number}|null|undefined} hardwareRange
 * @returns {{min:number, max:number, clampedByHardware:boolean}}
 */
export function intersectHardwareLimit(clamp, hardwareRange) {
  if (
    !hardwareRange ||
    !Number.isFinite(hardwareRange.min) ||
    !Number.isFinite(hardwareRange.max) ||
    hardwareRange.min > hardwareRange.max
  ) {
    return { min: clamp.min, max: clamp.max, clampedByHardware: false };
  }

  let min = Math.max(clamp.min, hardwareRange.min);
  let max = Math.min(clamp.max, hardwareRange.max);

  if (min > max) {
    min = hardwareRange.min;
    max = hardwareRange.max;
  }

  const clampedByHardware = min !== clamp.min || max !== clamp.max;
  return { min, max, clampedByHardware };
}

// --- Three.js -> VTK parallelScale --------------------------------------

/**
 * VTK's `vtkCamera.parallelScale` is half the viewport height in world units
 * under a parallel projection. Three.js expresses the same quantity as the
 * orthographic frustum half-height `(top - bottom) / 2`, scaled by
 * `1 / camera.zoom` (OrbitControls changes `.zoom`, not the frustum, when
 * zooming an orthographic camera).
 *
 * Accepts a real THREE.OrthographicCamera or any `{ top, bottom, zoom }`.
 * Returns NaN for a missing camera so callers/tests can assert on it.
 *
 * @param {{top:number, bottom:number, zoom?:number}} camera
 * @returns {number}
 */
export function orthoParallelScaleFromCamera(camera) {
  if (!camera || !Number.isFinite(camera.top) || !Number.isFinite(camera.bottom)) {
    return NaN;
  }
  const halfHeight = (camera.top - camera.bottom) / 2;
  const zoom =
    Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  return halfHeight / zoom;
}

/**
 * mXrap's orthographic "cartoon" extra scale factor. Verbatim piecewise
 * function of `parallelScale` from the customer spec. The pieces are
 * continuous at the 50 and 300 boundaries (asserted in the test suite).
 *
 * @param {number} parallelScale
 * @returns {number}
 */
export function parallelCartoonScale(parallelScale) {
  if (!Number.isFinite(parallelScale)) return 1.0;
  if (parallelScale < 50) return parallelScale / 100.0;
  if (parallelScale < 300) return 0.5 + (parallelScale - 50) / 500.0;
  return 0.5 * Math.log10(parallelScale - 200);
}

// --- branch selection ---------------------------------------------------

export const POINT_SIZE_BRANCHES = Object.freeze({
  PERSPECTIVE: "perspective",
  ORTHO_CARTOON: "orthoCartoon",
  PARALLEL: "parallel",
  LEGACY: "legacy",
});

/**
 * Pick which gl_PointSize formula the customer spec selects for the given
 * attenuation coefficients and camera kind. Mirrors the exact GLSL branch
 * conditions:
 *
 *   (b > 0 && cameraParallel == 0) || a > 0  -> 'perspective'
 *   else if b > 0                            -> 'orthoCartoon'
 *   else                                     -> 'parallel'
 *
 *   perspective cartoon (b>0, perspective) -> 'perspective'
 *   fixed          (a>0, either camera)    -> 'perspective' (distance-independent)
 *   orthographic cartoon (b>0, ortho)      -> 'orthoCartoon'
 *   real     (a=0,b=0,c>0, either camera)  -> 'parallel'
 *
 * @param {{a?:number, b?:number, cameraParallel?:number|boolean}} params
 * @returns {'perspective'|'orthoCartoon'|'parallel'}
 */
export function selectPointSizeBranch({ a = 0, b = 0, cameraParallel = 0 } = {}) {
  const parallel = cameraParallel ? 1 : 0;
  if ((b > 0 && parallel === 0) || a > 0) return POINT_SIZE_BRANCHES.PERSPECTIVE;
  if (b > 0) return POINT_SIZE_BRANCHES.ORTHO_CARTOON;
  return POINT_SIZE_BRANCHES.PARALLEL;
}

// --- numeric mirror of the shader --------------------------------------

// Smallest denominator the shader allows before dividing (kept as a decimal
// literal, matching the GLSL, to avoid any exponent-notation parser quirks in
// GLSL ES 1.00).
export const MIN_ATTENUATION_DENOMINATOR = 0.000000000001;

/**
 * JS mirror of the raw (pre-clamp) gl_PointSize the vertex shader computes.
 * Not used at runtime — the GPU shader is authoritative there — but kept in
 * lockstep with buildSizeVertexShaderSource() and asserted against
 * hand-computed values in the test suite.
 *
 * params (by branch):
 *   'perspective':  pointSize, a, b, c, viewDistance (= -mvPosition.z),
 *                   pointScaleFactor
 *   'orthoCartoon': pointSize, projA00 (= projectionMatrix[0][0]),
 *                   clipW (= gl_Position.w, 1 for orthographic),
 *                   pixelSizeNVCx (= 2 / drawingBufferWidth),
 *                   parallelCartoonScale
 *   'parallel':     as 'orthoCartoon' without parallelCartoonScale
 *
 * @returns {number}
 */
export function rawPointSizePx(params) {
  const { branch, pointSize } = params;

  if (branch === POINT_SIZE_BRANCHES.PERSPECTIVE) {
    const { a = 0, b = 0, c = 0, viewDistance, pointScaleFactor } = params;
    const d = Math.max(0, viewDistance);
    const denominator = Math.max(
      a + b * d + c * d * d,
      MIN_ATTENUATION_DENOMINATOR
    );
    const attenuation = Math.sqrt(1 / denominator);
    return pointScaleFactor * attenuation * pointSize;
  }

  const { projA00, clipW = 1, pixelSizeNVCx } = params;
  const extra =
    branch === POINT_SIZE_BRANCHES.ORTHO_CARTOON
      ? params.parallelCartoonScale
      : 1;
  return (projA00 * extra * pointSize) / (clipW * pixelSizeNVCx);
}

/**
 * Apply the final screen-size clamp, exactly as the shader's trailing
 * `clamp(rawPointSize, minScreenPointSize, maxScreenPointSize)` does.
 */
export function clampScreenPointSize(rawPx, clamp) {
  return Math.min(clamp.max, Math.max(clamp.min, rawPx));
}

// --- vertex-shader source --------------------------------------------

// Per-branch uniform declarations. `projectionMatrix` is a Three.js built-in
// and is not declared here.
const BRANCH_UNIFORMS = {
  [POINT_SIZE_BRANCHES.PERSPECTIVE]: `uniform float distanceAttenuationA;
    uniform float distanceAttenuationB;
    uniform float distanceAttenuationC;
    uniform float pointScaleFactor;`,
  [POINT_SIZE_BRANCHES.ORTHO_CARTOON]: `uniform float parallelCartoonScale;
    uniform float pixelSizeNVCx;`,
  [POINT_SIZE_BRANCHES.PARALLEL]: `uniform float pixelSizeNVCx;`,
  [POINT_SIZE_BRANCHES.LEGACY]: `uniform float sizeAttenuationFactor;`,
};

// Per-branch computation of `rawPointSize` (a float declared by the caller).
// Every branch also assigns `gl_Position`.
const BRANCH_BODY = {
  [POINT_SIZE_BRANCHES.PERSPECTIVE]: `
      float d = max(0.0, -mvPosition.z);
      float denominator = max(
        distanceAttenuationA +
        distanceAttenuationB * d +
        distanceAttenuationC * d * d,
        ${MIN_ATTENUATION_DENOMINATOR}
      );
      float attenuation = sqrt(1.0 / denominator);
      gl_Position = projectionMatrix * mvPosition;
      rawPointSize = pointScaleFactor * attenuation * pointSize;`,
  [POINT_SIZE_BRANCHES.ORTHO_CARTOON]: `
      gl_Position = projectionMatrix * mvPosition;
      rawPointSize = (projectionMatrix[0][0] * parallelCartoonScale * pointSize)
        / (gl_Position.w * pixelSizeNVCx);`,
  [POINT_SIZE_BRANCHES.PARALLEL]: `
      gl_Position = projectionMatrix * mvPosition;
      rawPointSize = (projectionMatrix[0][0] * pointSize)
        / (gl_Position.w * pixelSizeNVCx);`,
  [POINT_SIZE_BRANCHES.LEGACY]: `
      gl_Position = projectionMatrix * mvPosition;
      rawPointSize = pointSize * (sizeAttenuationFactor / max(0.000001, -mvPosition.z));`,
};

/**
 * Build the vertex-shader source for the size/colour point material.
 *
 * Pure string construction (no WebGL), so the test suite can assert which
 * camera branch was emitted and that the final screen-size clamp is present.
 * Only one branch's code is emitted — the branch is chosen on the CPU by
 * selectPointSizeBranch() and the whole material is rebuilt when the
 * projection mode changes (ThreeScene tears the scene down on that change).
 *
 * @param {{branch:string, hasColor:boolean}} opts
 * @returns {string}
 */
export function buildSizeVertexShaderSource({ branch, hasColor }) {
  const uniforms = BRANCH_UNIFORMS[branch];
  const body = BRANCH_BODY[branch];
  if (!uniforms || !body) {
    throw new Error(`buildSizeVertexShaderSource: unknown branch "${branch}"`);
  }

  return `
    attribute float pointSize;
    ${uniforms}
    // Final screen-size clamp, in framebuffer pixels (gl_PointSize is always
    // framebuffer pixels per the WebGL/GLSL spec, never CSS pixels). Applied
    // identically on every branch after the raw size is computed.
    uniform float minScreenPointSize;
    uniform float maxScreenPointSize;
    uniform float markerDisplayScale;
    ${hasColor ? "" : "uniform vec3 flatColor;"}
    varying vec3 vColor;

    void main() {
      vColor = ${hasColor ? "color" : "flatColor"};
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float rawPointSize;
${body}
      rawPointSize *= markerDisplayScale;
      gl_PointSize = clamp(rawPointSize, minScreenPointSize, maxScreenPointSize);
    }
  `;
}
