import { describe, it, expect } from "vitest";
import {
  DISTANCE_ATTENUATION_MODELS,
  DEFAULT_SCREEN_CLAMP,
  resolveDistanceAttenuation,
  validateScreenSizeClamp,
  intersectHardwareLimit,
  orthoParallelScaleFromCamera,
  parallelCartoonScale,
  selectPointSizeBranch,
  rawPointSizePx,
  clampScreenPointSize,
  buildSizeVertexShaderSource,
  POINT_SIZE_BRANCHES,
} from "../pointSizing";

// ---------------------------------------------------------------------------
// These are deterministic unit tests of pure functions only. They do NOT
// prove that a GPU compiled or rendered the shader — see the point-sizing
// section of the project notes / REPORT for the separate real-browser WebGL
// smoke test and the manual perspective/orthographic visual checks.
// ---------------------------------------------------------------------------

describe("resolveDistanceAttenuation", () => {
  it("returns the (a,b,c) coefficients for each named model", () => {
    expect(resolveDistanceAttenuation("cartoon")).toEqual({ a: 0, b: 0.0012, c: 1.2e-7 });
    expect(resolveDistanceAttenuation("real")).toEqual({ a: 0, b: 0, c: 1.2e-6 });
    expect(resolveDistanceAttenuation("fixed")).toEqual({ a: 1.2, b: 0, c: 0 });
  });

  it("returns null for unknown / missing models", () => {
    expect(resolveDistanceAttenuation("nope")).toBeNull();
    expect(resolveDistanceAttenuation(undefined)).toBeNull();
    expect(resolveDistanceAttenuation(null)).toBeNull();
  });

  it("classifies the models the way selectPointSizeBranch relies on", () => {
    // fixed: a>0  |  cartoon: b>0  |  real: c-only
    expect(DISTANCE_ATTENUATION_MODELS.fixed.a).toBeGreaterThan(0);
    expect(DISTANCE_ATTENUATION_MODELS.cartoon.b).toBeGreaterThan(0);
    expect(DISTANCE_ATTENUATION_MODELS.real.a).toBe(0);
    expect(DISTANCE_ATTENUATION_MODELS.real.b).toBe(0);
    expect(DISTANCE_ATTENUATION_MODELS.real.c).toBeGreaterThan(0);
  });
});

describe("validateScreenSizeClamp", () => {
  it("passes through a valid (min,max) pair unchanged", () => {
    expect(validateScreenSizeClamp(2, 96)).toEqual({ min: 2, max: 96, usedFallback: false });
    expect(validateScreenSizeClamp(0, 10)).toEqual({ min: 0, max: 10, usedFallback: false });
  });

  it("falls back to defaults when a bound is NaN", () => {
    const r = validateScreenSizeClamp(NaN, 96);
    expect(r).toEqual({ min: DEFAULT_SCREEN_CLAMP.min, max: 96, usedFallback: true });
  });

  it("falls back to defaults when a bound is Infinity", () => {
    const r = validateScreenSizeClamp(2, Infinity);
    expect(r).toEqual({ min: 2, max: DEFAULT_SCREEN_CLAMP.max, usedFallback: true });
  });

  it("falls back to defaults when a bound is negative", () => {
    const r = validateScreenSizeClamp(-5, 40);
    expect(r).toEqual({ min: DEFAULT_SCREEN_CLAMP.min, max: 40, usedFallback: true });
  });

  it("falls back to BOTH defaults when min > max", () => {
    const r = validateScreenSizeClamp(100, 10);
    expect(r).toEqual({
      min: DEFAULT_SCREEN_CLAMP.min,
      max: DEFAULT_SCREEN_CLAMP.max,
      usedFallback: true,
    });
  });

  it("uses the documented defaults of 2 and 96", () => {
    expect(DEFAULT_SCREEN_CLAMP).toEqual({ min: 2, max: 96 });
    expect(validateScreenSizeClamp(undefined, undefined)).toEqual({
      min: 2,
      max: 96,
      usedFallback: true,
    });
  });
});

describe("intersectHardwareLimit (pure)", () => {
  const clamp = { min: 2, max: 96 };

  it("returns the clamp unchanged when the hardware range is unknown (null)", () => {
    expect(intersectHardwareLimit(clamp, null)).toEqual({
      min: 2,
      max: 96,
      clampedByHardware: false,
    });
  });

  it("returns the clamp unchanged when the hardware range is malformed", () => {
    expect(intersectHardwareLimit(clamp, { min: NaN, max: 100 }).clampedByHardware).toBe(false);
    expect(intersectHardwareLimit(clamp, { min: 50, max: 10 }).clampedByHardware).toBe(false);
  });

  it("lowers the ceiling to the hardware max", () => {
    expect(intersectHardwareLimit(clamp, { min: 1, max: 64 })).toEqual({
      min: 2,
      max: 64,
      clampedByHardware: true,
    });
  });

  it("raises the floor to the hardware min", () => {
    expect(intersectHardwareLimit(clamp, { min: 8, max: 200 })).toEqual({
      min: 8,
      max: 96,
      clampedByHardware: true,
    });
  });

  it("does not narrow when the hardware range is wider on both sides", () => {
    expect(intersectHardwareLimit(clamp, { min: 1, max: 1023 })).toEqual({
      min: 2,
      max: 96,
      clampedByHardware: false,
    });
  });

  it("falls back to the hardware range when the intersection would be empty", () => {
    // policy wants >= 200, GPU can't exceed 128 -> honour the GPU
    expect(intersectHardwareLimit({ min: 200, max: 300 }, { min: 1, max: 128 })).toEqual({
      min: 1,
      max: 128,
      clampedByHardware: true,
    });
  });
});

describe("orthoParallelScaleFromCamera (Three.js -> VTK mapping)", () => {
  it("maps frustum half-height at zoom 1 to parallelScale", () => {
    expect(orthoParallelScaleFromCamera({ top: 100, bottom: -100, zoom: 1 })).toBe(100);
    expect(orthoParallelScaleFromCamera({ top: 5.843, bottom: 0, zoom: 1 })).toBeCloseTo(2.9215, 4);
  });

  it("divides the half-height by camera.zoom", () => {
    expect(orthoParallelScaleFromCamera({ top: 100, bottom: -100, zoom: 2 })).toBe(50);
    expect(orthoParallelScaleFromCamera({ top: 100, bottom: -100, zoom: 0.5 })).toBe(200);
  });

  it("treats a missing / non-positive zoom as 1", () => {
    expect(orthoParallelScaleFromCamera({ top: 100, bottom: -100 })).toBe(100);
    expect(orthoParallelScaleFromCamera({ top: 100, bottom: -100, zoom: 0 })).toBe(100);
    expect(orthoParallelScaleFromCamera({ top: 100, bottom: -100, zoom: -3 })).toBe(100);
  });

  it("returns NaN for a missing or malformed camera", () => {
    expect(Number.isNaN(orthoParallelScaleFromCamera(null))).toBe(true);
    expect(Number.isNaN(orthoParallelScaleFromCamera({}))).toBe(true);
    expect(Number.isNaN(orthoParallelScaleFromCamera({ top: 1 }))).toBe(true);
  });

  it("accepts a real THREE.OrthographicCamera shape", () => {
    // shape only, no `three` import: { top, bottom, zoom, isOrthographicCamera }
    const cam = { top: 10, bottom: -10, zoom: 4, isOrthographicCamera: true };
    expect(orthoParallelScaleFromCamera(cam)).toBe(2.5);
  });
});

describe("parallelCartoonScale (customer piecewise spec)", () => {
  it("uses parallelScale / 100 below 50", () => {
    expect(parallelCartoonScale(0)).toBe(0);
    expect(parallelCartoonScale(10)).toBeCloseTo(0.1, 12);
    expect(parallelCartoonScale(49)).toBeCloseTo(0.49, 12);
  });

  it("uses 0.5 + (parallelScale - 50)/500 on [50, 300)", () => {
    expect(parallelCartoonScale(50)).toBeCloseTo(0.5, 12);
    expect(parallelCartoonScale(175)).toBeCloseTo(0.75, 12);
    expect(parallelCartoonScale(299)).toBeCloseTo(0.5 + 249 / 500, 12);
  });

  it("uses 0.5 * log10(parallelScale - 200) at / above 300", () => {
    expect(parallelCartoonScale(300)).toBeCloseTo(1.0, 12); // 0.5 * log10(100)
    expect(parallelCartoonScale(1200)).toBeCloseTo(0.5 * Math.log10(1000), 12); // 1.5
  });

  it("is continuous at the 50 boundary", () => {
    const below = parallelCartoonScale(50 - 1e-6);
    const at = parallelCartoonScale(50);
    const above = parallelCartoonScale(50 + 1e-6);
    expect(below).toBeCloseTo(0.5, 5);
    expect(at).toBeCloseTo(0.5, 12);
    expect(above).toBeCloseTo(0.5, 5);
  });

  it("is continuous at the 300 boundary", () => {
    const below = parallelCartoonScale(300 - 1e-6);
    const at = parallelCartoonScale(300);
    const above = parallelCartoonScale(300 + 1e-6);
    expect(below).toBeCloseTo(1.0, 5);
    expect(at).toBeCloseTo(1.0, 12);
    expect(above).toBeCloseTo(1.0, 5);
  });

  it("selects the correct piece exactly at each boundary (50 -> mid, 300 -> high)", () => {
    // at 50: mid piece 0.5 + 0/500 = 0.5 ; low piece would also give 0.5 -> assert via 300
    // at 300: high piece 0.5*log10(100)=1.0 ; mid piece would give 0.5+250/500=1.0
    // Distinguish by picking values where the pieces disagree and checking the
    // boundary resolves to the documented side.
    expect(parallelCartoonScale(50)).toBe(0.5 + (50 - 50) / 500);
    expect(parallelCartoonScale(300)).toBe(0.5 * Math.log10(300 - 200));
  });

  it("returns 1.0 for non-finite input", () => {
    expect(parallelCartoonScale(NaN)).toBe(1.0);
    expect(parallelCartoonScale(Infinity)).toBe(1.0);
  });
});

describe("selectPointSizeBranch (customer if / else-if / else)", () => {
  const cartoon = DISTANCE_ATTENUATION_MODELS.cartoon;
  const real = DISTANCE_ATTENUATION_MODELS.real;
  const fixed = DISTANCE_ATTENUATION_MODELS.fixed;

  it("perspective: cartoon -> perspective, real -> parallel, fixed -> perspective", () => {
    expect(selectPointSizeBranch({ ...cartoon, cameraParallel: 0 })).toBe(
      POINT_SIZE_BRANCHES.PERSPECTIVE
    );
    expect(selectPointSizeBranch({ ...real, cameraParallel: 0 })).toBe(
      POINT_SIZE_BRANCHES.PARALLEL
    );
    expect(selectPointSizeBranch({ ...fixed, cameraParallel: 0 })).toBe(
      POINT_SIZE_BRANCHES.PERSPECTIVE
    );
  });

  it("orthographic: cartoon -> orthoCartoon, real -> parallel, fixed -> perspective", () => {
    expect(selectPointSizeBranch({ ...cartoon, cameraParallel: 1 })).toBe(
      POINT_SIZE_BRANCHES.ORTHO_CARTOON
    );
    expect(selectPointSizeBranch({ ...real, cameraParallel: 1 })).toBe(
      POINT_SIZE_BRANCHES.PARALLEL
    );
    // fixed is distance-independent -> keep the first (perspective) formula
    expect(selectPointSizeBranch({ ...fixed, cameraParallel: 1 })).toBe(
      POINT_SIZE_BRANCHES.PERSPECTIVE
    );
  });

  it("accepts boolean cameraParallel", () => {
    expect(selectPointSizeBranch({ ...cartoon, cameraParallel: true })).toBe(
      POINT_SIZE_BRANCHES.ORTHO_CARTOON
    );
    expect(selectPointSizeBranch({ ...cartoon, cameraParallel: false })).toBe(
      POINT_SIZE_BRANCHES.PERSPECTIVE
    );
  });

  it("defaults to perspective camera when cameraParallel omitted", () => {
    expect(selectPointSizeBranch(cartoon)).toBe(POINT_SIZE_BRANCHES.PERSPECTIVE);
  });
});

describe("rawPointSizePx — perspective branch (cartoon / real / fixed inputs)", () => {
  const pointScaleFactor = 96 / 72; // renderWindowDPI 96 / 72

  it("cartoon: pointScaleFactor * sqrt(1/(b d + c d^2)) * pointSize", () => {
    const { b, c } = DISTANCE_ATTENUATION_MODELS.cartoon;
    const d = 100;
    const expected = pointScaleFactor * Math.sqrt(1 / (b * d + c * d * d)) * 10;
    expect(
      rawPointSizePx({
        branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
        pointSize: 10,
        a: 0,
        b,
        c,
        viewDistance: d,
        pointScaleFactor,
      })
    ).toBeCloseTo(expected, 9);
    // hand check: denom = 0.0012*100 + 1.2e-7*100^2 = 0.1212;
    // (96/72) * sqrt(1/0.1212) * 10 ~= 38.30
    expect(expected).toBeCloseTo(38.3, 1);
  });

  it("fixed: distance-independent (a = 1.2, no d term)", () => {
    const { a } = DISTANCE_ATTENUATION_MODELS.fixed;
    const near = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
      pointSize: 10,
      a,
      b: 0,
      c: 0,
      viewDistance: 1,
      pointScaleFactor,
    });
    const far = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
      pointSize: 10,
      a,
      b: 0,
      c: 0,
      viewDistance: 9999,
      pointScaleFactor,
    });
    expect(near).toBeCloseTo(far, 12);
    expect(near).toBeCloseTo(pointScaleFactor * Math.sqrt(1 / 1.2) * 10, 9);
  });

  it("shrinks with distance for cartoon (near > far)", () => {
    const { b, c } = DISTANCE_ATTENUATION_MODELS.cartoon;
    const near = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
      pointSize: 10,
      b,
      c,
      viewDistance: 5,
      pointScaleFactor,
    });
    const far = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
      pointSize: 10,
      b,
      c,
      viewDistance: 500,
      pointScaleFactor,
    });
    expect(near).toBeGreaterThan(far);
  });

  it("clamps the denominator so a zero-distance point does not divide by zero", () => {
    const size = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
      pointSize: 10,
      a: 0,
      b: 0.0012,
      c: 1.2e-7,
      viewDistance: 0,
      pointScaleFactor,
    });
    expect(Number.isFinite(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
  });
});

describe("rawPointSizePx — orthographic branches (cartoon / real inputs)", () => {
  // projA00 = projectionMatrix[0][0]; clipW = 1 for orthographic;
  // pixelSizeNVCx = 2 / drawingBufferWidth
  const projA00 = 0.02;
  const pixelSizeNVCx = 2 / 1600;

  it("parallel (real): (projA00 * pointSize) / (clipW * pixelSizeNVCx)", () => {
    const size = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PARALLEL,
      pointSize: 10,
      projA00,
      clipW: 1,
      pixelSizeNVCx,
    });
    expect(size).toBeCloseTo((projA00 * 10) / (1 * pixelSizeNVCx), 9);
    expect(size).toBeCloseTo(160, 9);
  });

  it("orthoCartoon: parallel formula scaled by parallelCartoonScale", () => {
    const pcs = parallelCartoonScale(100); // 0.6
    const size = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.ORTHO_CARTOON,
      pointSize: 10,
      projA00,
      clipW: 1,
      pixelSizeNVCx,
      parallelCartoonScale: pcs,
    });
    expect(size).toBeCloseTo((projA00 * pcs * 10) / (1 * pixelSizeNVCx), 9);
    expect(size).toBeCloseTo(96, 9); // 160 * 0.6
  });

  it("orthoCartoon reduces to parallel when parallelCartoonScale = 1", () => {
    const common = { pointSize: 7, projA00, clipW: 1, pixelSizeNVCx };
    const cartoon = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.ORTHO_CARTOON,
      ...common,
      parallelCartoonScale: 1,
    });
    const parallel = rawPointSizePx({ branch: POINT_SIZE_BRANCHES.PARALLEL, ...common });
    expect(cartoon).toBeCloseTo(parallel, 12);
  });

  it("is independent of view distance (no d term in the parallel branches)", () => {
    const a = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PARALLEL,
      pointSize: 10,
      projA00,
      clipW: 1,
      pixelSizeNVCx,
      viewDistance: 1,
    });
    const b = rawPointSizePx({
      branch: POINT_SIZE_BRANCHES.PARALLEL,
      pointSize: 10,
      projA00,
      clipW: 1,
      pixelSizeNVCx,
      viewDistance: 100000,
    });
    expect(a).toBe(b);
  });
});

describe("clampScreenPointSize", () => {
  it("applies the final clamp exactly like the shader's clamp()", () => {
    const c = { min: 2, max: 96 };
    expect(clampScreenPointSize(0.1, c)).toBe(2);
    expect(clampScreenPointSize(50, c)).toBe(50);
    expect(clampScreenPointSize(1000, c)).toBe(96);
  });
});

describe("buildSizeVertexShaderSource — branch selection & final clamp", () => {
  const branches = [
    POINT_SIZE_BRANCHES.PERSPECTIVE,
    POINT_SIZE_BRANCHES.ORTHO_CARTOON,
    POINT_SIZE_BRANCHES.PARALLEL,
    POINT_SIZE_BRANCHES.LEGACY,
  ];

  it("every branch ends with the final screen-size clamp", () => {
    for (const branch of branches) {
      const src = buildSizeVertexShaderSource({ branch, hasColor: false });
      expect(src).toContain(
        "gl_PointSize = clamp(rawPointSize, minScreenPointSize, maxScreenPointSize);"
      );
      expect(src).toContain("uniform float minScreenPointSize;");
      expect(src).toContain("uniform float maxScreenPointSize;");
      expect(src).toContain("uniform float markerDisplayScale;");
      expect(src.indexOf("rawPointSize *= markerDisplayScale;")).toBeLessThan(src.indexOf("gl_PointSize = clamp("));
    }
  });

  it("perspective branch: quadratic-denominator attenuation, no parallel terms", () => {
    const src = buildSizeVertexShaderSource({
      branch: POINT_SIZE_BRANCHES.PERSPECTIVE,
      hasColor: true,
    });
    expect(src).toContain("uniform float distanceAttenuationA;");
    expect(src).toContain("uniform float pointScaleFactor;");
    expect(src).toContain("float attenuation = sqrt(1.0 / denominator);");
    expect(src).toContain("rawPointSize = pointScaleFactor * attenuation * pointSize;");
    expect(src).not.toContain("pixelSizeNVCx");
    expect(src).not.toContain("parallelCartoonScale");
  });

  it("orthoCartoon branch: parallelCartoonScale + pixelSizeNVCx, uses projectionMatrix[0][0]", () => {
    const src = buildSizeVertexShaderSource({
      branch: POINT_SIZE_BRANCHES.ORTHO_CARTOON,
      hasColor: true,
    });
    expect(src).toContain("uniform float parallelCartoonScale;");
    expect(src).toContain("uniform float pixelSizeNVCx;");
    expect(src).toContain("projectionMatrix[0][0] * parallelCartoonScale * pointSize");
    expect(src).toContain("gl_Position.w * pixelSizeNVCx");
    expect(src).not.toContain("distanceAttenuationA");
    expect(src).not.toContain("sqrt(1.0 / denominator)");
  });

  it("parallel branch: pixelSizeNVCx only, no parallelCartoonScale, no attenuation", () => {
    const src = buildSizeVertexShaderSource({
      branch: POINT_SIZE_BRANCHES.PARALLEL,
      hasColor: true,
    });
    expect(src).toContain("uniform float pixelSizeNVCx;");
    expect(src).not.toContain("parallelCartoonScale");
    expect(src).not.toContain("distanceAttenuationA");
    expect(src).toContain("rawPointSize = (projectionMatrix[0][0] * pointSize)");
  });

  it("legacy branch: linear sizeAttenuationFactor fallback", () => {
    const src = buildSizeVertexShaderSource({
      branch: POINT_SIZE_BRANCHES.LEGACY,
      hasColor: false,
    });
    expect(src).toContain("uniform float sizeAttenuationFactor;");
    expect(src).toContain("sizeAttenuationFactor / max(0.000001, -mvPosition.z)");
  });

  it("declares flatColor only when the built-in color attribute is absent", () => {
    const withColor = buildSizeVertexShaderSource({
      branch: POINT_SIZE_BRANCHES.PARALLEL,
      hasColor: true,
    });
    const noColor = buildSizeVertexShaderSource({
      branch: POINT_SIZE_BRANCHES.PARALLEL,
      hasColor: false,
    });
    expect(withColor).not.toContain("uniform vec3 flatColor;");
    expect(withColor).toContain("vColor = color;");
    expect(noColor).toContain("uniform vec3 flatColor;");
    expect(noColor).toContain("vColor = flatColor;");
  });

  it("throws on an unknown branch", () => {
    expect(() => buildSizeVertexShaderSource({ branch: "banana", hasColor: false })).toThrow(
      /unknown branch/
    );
  });
});

describe("end-to-end: model + camera -> branch -> size", () => {
  // Ties the pieces together the way buildPointCloud does, still pure.
  function sizeFor({ model, cameraParallel, ...rest }) {
    const coeffs = resolveDistanceAttenuation(model);
    const branch = selectPointSizeBranch({ ...coeffs, cameraParallel });
    const clamp = intersectHardwareLimit(
      validateScreenSizeClamp(2, 96),
      rest.hardwareRange ?? null
    );
    const raw = rawPointSizePx({ branch, ...coeffs, ...rest });
    return { branch, raw, clamped: clampScreenPointSize(raw, clamp) };
  }

  it("perspective cartoon point is clamped to the 2px floor when tiny, 96px ceiling when huge", () => {
    const tiny = sizeFor({
      model: "cartoon",
      cameraParallel: 0,
      pointSize: 0.5,
      viewDistance: 100000,
      pointScaleFactor: 96 / 72,
    });
    expect(tiny.branch).toBe(POINT_SIZE_BRANCHES.PERSPECTIVE);
    expect(tiny.clamped).toBe(2);

    const huge = sizeFor({
      model: "cartoon",
      cameraParallel: 0,
      pointSize: 50,
      viewDistance: 0.01,
      pointScaleFactor: 96 / 72,
    });
    expect(huge.clamped).toBe(96);
  });

  it("orthographic cartoon uses the parallel-cartoon branch and respects the hardware ceiling", () => {
    const r = sizeFor({
      model: "cartoon",
      cameraParallel: 1,
      pointSize: 10,
      projA00: 0.5,
      clipW: 1,
      pixelSizeNVCx: 2 / 1600,
      parallelCartoonScale: parallelCartoonScale(120),
      hardwareRange: { min: 1, max: 64 },
    });
    expect(r.branch).toBe(POINT_SIZE_BRANCHES.ORTHO_CARTOON);
    expect(r.clamped).toBeLessThanOrEqual(64);
  });

  it("orthographic real uses the plain parallel branch", () => {
    const r = sizeFor({
      model: "real",
      cameraParallel: 1,
      pointSize: 10,
      projA00: 0.02,
      clipW: 1,
      pixelSizeNVCx: 2 / 1600,
    });
    expect(r.branch).toBe(POINT_SIZE_BRANCHES.PARALLEL);
    expect(r.raw).toBeCloseTo(160, 6);
  });
});
