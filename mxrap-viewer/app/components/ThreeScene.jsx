"use client";

// 这是整个 3D Viewer 的核心地基（core scene setup）
// This is the foundational component for the whole 3D viewer.
//
// 相机的 position / focal / up 都从 sceneData.camera 读取，
// near/far 根据相机到焦点的真实距离动态计算（不能用固定数字，
// 否则真实矿井坐标和 mock 坐标尺度差太多，会导致深度精度问题、
// 画面完全空白）。
// Camera position/focal/up are read from sceneData.camera; near/far
// are computed dynamically from the real camera-to-focal distance
// (fixed numbers don't work because mock and real mine coordinates
// differ by orders of magnitude, causing depth-precision issues and a
// blank screen).
//
// Camera navigation (rotate/zoom/tilt/pan, with limits, plus a smooth
// "reset view" animation) lives in cameraControls.js and is wired in below.
// resetView() is exposed via ref so a parent can add a "Reset View" button.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { buildAnnotation, disposeAnnotations, resolveLabelFont } from "./annotationsBuilder";
import { applyCameraState, convertCameraState, snapshotCameraState } from "./cameraState";
import { buildSurfaceMesh } from "./geometryBuilder";
import { buildLineSegments, lineObjectHasSegments } from "./linesBuilder";
import { axisIndicatorTitle, updateAxisIndicator } from "./orientationGizmo";
import AxisIndicator from "./AxisIndicator";
import PlanGridLabels, { updatePlanGridLabels } from "./PlanGridLabels";
import { computePlanGrid } from "./planGrid";
import { buildPointCloud, getHardwarePointSizeRange } from "./pointsBuilder";
import {
  resolveMarkerRenderOptions,
} from "./pointMarkerResolver";
import { resolveSurfaceVertexColours } from "./surfaceMarkerResolver";
import { applySurfaceStyle } from "./surfaceStyle";
import {
  orthoParallelScaleFromCamera,
  parallelCartoonScale as computeParallelCartoonScale,
} from "./pointSizing";
import {
  animateCameraTo,
  createCamera,
  createCameraControls,
  fitBoxToView,
  levelCameraUp,
  presetCameraOffset,
  setPlanNavigation,
  stopCameraGlide,
  updateCameraAspect,
} from "./cameraControls";

// 默认相机设置，用于 sceneData.camera 缺失字段时的兜底
// Default camera settings, used as a fallback when sceneData.camera is
// missing some (or all) fields.
const DEFAULT_CAMERA = {
  position: { x: 3, y: 3, z: 5 },
  focal: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
};

// Plan-view grid lines (planGrid.js): a little lighter than the viewport
// background (0x121a20), and drawn before everything else so the data stays
// on top of them.
const PLAN_GRID_COLOUR = 0x2b3a44;

// The renderer/camera-dependent inputs to the customer point-size model
// (see pointSizing.js), shared by every point cloud regardless of whether
// it's rendered via getDemoRenderOptions (mock data) or
// resolveMarkerRenderOptions (real marker-defs data): which projection the
// camera uses, the drawing-buffer-derived `pixelSizeNVCx`, the orthographic
// `parallelCartoonScale`, and the GPU's real point-size range. ThreeScene
// computes `sizing` and refreshes the orthographic values every frame.
function buildSharedPointSizing(sizing = {}) {
  // renderWindowDPI / 72, with renderWindowDPI approximated as
  // 96 * devicePixelRatio and the ratio capped at 2 (an earlier safety
  // decision for very high-DPR displays). Perspective branch only.
  const pointScaleFactor = Math.min(window.devicePixelRatio, 2) * (96 / 72);

  return {
    pointScaleFactor,
    cameraParallel: sizing.cameraParallel ?? 0,
    pixelSizeNVCx: sizing.pixelSizeNVCx,
    parallelCartoonScale: sizing.parallelCartoonScale,
    hardwarePointSizeRange: sizing.hardwarePointSizeRange ?? null,
    // Final screen-size safety clamp (framebuffer pixels). 2px floor rather
    // than 1px: a literal 1px floor did not render reliably in a software
    // WebGL context. The 96px ceiling is further intersected with the GPU's
    // real ALIASED_POINT_SIZE_RANGE inside buildPointCloud when
    // `hardwarePointSizeRange` is supplied.
    minScreenPointSize: 2,
    maxScreenPointSize: 96,
  };
}

// Real mXrap marker-image assets (e.g. Sphere-Question.png, Triaxial.png)
// ship as fully opaque PNGs with a plain black background instead of a real
// alpha channel — the point-symbol fragment shader discards on alpha, so
// without this they render as solid black squares. Detect images with no
// genuine per-pixel alpha (every pixel already opaque) and chroma-key pure
// black to transparent; an asset that does carry real alpha (e.g. the
// Events series' soft-shaded sphere sprites) is returned untouched so its
// anti-aliased edges aren't clipped.
function keyOutOpaqueBlackBackground(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  let hasRealAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      hasRealAlpha = true;
      break;
    }
  }
  if (hasRealAlpha) return image;

  const BLACK_THRESHOLD = 10;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] <= BLACK_THRESHOLD && data[i + 1] <= BLACK_THRESHOLD && data[i + 2] <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

// Temporary demo adapter used to exercise the point renderer's per-point
// colour and size paths for mock scenes (no real marker-defs data). Real
// scenes go through resolveMarkerRenderOptions instead; see the forEach
// below.
function getDemoRenderOptions(pointSeriesData) {
  if (!pointSeriesData.points?.[0] || pointSeriesData.points[0].ml === undefined) {
    // No per-point value to map from, so no colour/size-by-value. Still route
    // through the shader clamp path with a flat, calibrated size (mid-range of
    // the same 0.3-1.2 window the ml branch uses) instead of falling through
    // to the uncalibrated fixed `size` in mockScenes.js, which was never tuned
    // for the "cartoon" distance-attenuation formula.
    return {
      sizeFn: () => 0.6,
      minPointSize: 0.3,
      maxPointSize: 1.2,
      distanceAttenuation: pointSeriesData.distanceAttenuation,
    };
  }

  // DEMO-ONLY calibration for this mock scene's normalised coordinates and
  // ~3-8 unit camera distances. NOT the customer's real marker-size
  // configuration (that operates on real mining-coordinate distances and
  // uses very different values, e.g. sizeMinimum 1.0 / sizeMaximum 25.0 —
  // see config.json). Applying the customer's real 1-25 range directly to
  // this normalised demo scene was tested and found to produce points
  // clamped against the screen-size ceiling almost immediately (the
  // "cartoon" attenuation model grows much faster relative to this scene's
  // small coordinate scale than it does at real mining-coordinate scale).
  // 0.3-1.2 was chosen by computing expected pixel sizes across this demo's
  // typical camera distances (3-8 units) and confirming the result stays
  // within the screen clamp's range without pinning to either bound —
  // i.e. distance attenuation is actually visible, not swamped by the
  // clamp. When real customer data/config lands, this whole function
  // should be replaced, not extended.
  return {
    colorFn: (point) => {
      const value = Math.min(1, Math.max(0, (point.ml + 4) / 8));
      return { r: value, g: 0.2, b: 1 - value };
    },
    sizeFn: (point) => 0.3 + 0.9 * Math.min(1, Math.max(0, (point.ml + 4) / 8)),
    minPointSize: 0.3,
    maxPointSize: 1.2,
    distanceAttenuation: pointSeriesData.distanceAttenuation,
  };
}

// A uniform scale.setScalar() would squash a sprite-based annotation label
// (buildAnnotation's faceCamera/render2d branch) back to a square, undoing
// the aspect-aware scale it set up — see annotationsBuilder.js. Mesh-based
// annotations (fixed-orientation) already bake their aspect ratio into
// PlaneGeometry(width, height), so a uniform scalar is correct for them.
function applyAnnotationScale(object, factor) {
  if (object.isSprite) {
    const aspect = object.userData.aspectRatio ?? 1;
    object.scale.set(aspect * factor, factor, 1);
  } else {
    object.scale.setScalar(factor);
  }
}

// Shared between the initial scene build and the style-override rebuild
// effect so the filter/build/baseScale logic only lives in one place.
// A surface's mesh as the user styled it (Surface Style, surfaceStyle.js):
// its colour marker, single colour and opacity.
function buildStyledSurfaceMesh(surfaceData, style) {
  const styled = applySurfaceStyle(surfaceData, style);
  return buildSurfaceMesh(styled, resolveSurfaceVertexColours(styled));
}

function buildAnnotationObjects(sceneData, style) {
  return (sceneData.annotations ?? [])
    .filter((annotationData) => annotationData?.text)
    .map((annotationData) => ({
      object: buildAnnotation(annotationData, style),
      baseScale: Number.isFinite(annotationData.scale) ? annotationData.scale : 10,
    }));
}

const ThreeScene = forwardRef(function ThreeScene(
  {
    sceneData,
    visiblePointClouds = null,
    lineVisibility = {},
    surfaceVisibility = {},
    surfaceStyles = {},
    projectionMode = "perspective",
    annotationsVisible = true,
    annotationScale = 1,
    annotationFont = null,
    annotationTextColor = null,
    annotationBackgroundColor = null,
    markerScale = 0.5,
    onCameraChange = null,
    selectedPoint = null,
    onPointHover = null,
    onPointSelect = null,
  },
  ref
) {
  const containerRef = useRef(null);
  const linesRef = useRef([]);
  const lineVisibilityRef = useRef(lineVisibility);
  useEffect(() => {
    lineVisibilityRef.current = lineVisibility;
    linesRef.current.forEach((object, index) => {
      object.visible = (lineVisibility[index] ?? sceneData.lineSeries?.[index]?.visible !== false) && lineObjectHasSegments(object);
    });
  }, [lineVisibility, sceneData]);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const axisIndicatorRef = useRef(null); // the XYZ indicator's <svg>
  const planGridOverlayRef = useRef(null); // the plan-view grid's labels
  const homeDistanceRef = useRef(null); // export camera to focal distance; sizes the orthographic frustum
  const homeViewRef = useRef(null); // { position, target } to return to on reset
  const cancelAnimationRef = useRef(null);
  const sceneRef = useRef(null);
  const pointCloudsRef = useRef([]);
  const meshesRef = useRef([]);
  const surfaceVisibilityRef = useRef(surfaceVisibility);
  useEffect(() => {
    surfaceVisibilityRef.current = surfaceVisibility;
    // Change only the mesh visibility. Rebuilding the scene here would reset
    // the camera and unnecessarily recreate the point and RMQ geometry.
    meshesRef.current.forEach((mesh, index) => {
      mesh.visible = surfaceVisibility[index] ?? sceneData.surfaces?.[index]?.visible !== false;
    });
  }, [surfaceVisibility, sceneData]);
  // Each surface mesh is built with its Surface Style; a change of style
  // rebuilds only that surface's mesh, so the camera and everything else
  // stay as they are. A colour picker fires on every drag step, so the
  // rebuild waits until the colour settles.
  const surfaceStylesRef = useRef(surfaceStyles);
  surfaceStylesRef.current = surfaceStyles;
  const builtSurfaceStylesRef = useRef([]); // the style each mesh in meshesRef was built with
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const surfaces = sceneData.surfaces ?? [];
      meshesRef.current = meshesRef.current.map((mesh, index) => {
        const style = surfaceStyles[index];
        if (builtSurfaceStylesRef.current[index] === style || !surfaces[index]) return mesh;
        const nextMesh = buildStyledSurfaceMesh(surfaces[index], style);
        nextMesh.visible = mesh.visible;
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        scene.add(nextMesh);
        builtSurfaceStylesRef.current[index] = style;
        return nextMesh;
      });
    }, 120);
    return () => clearTimeout(timeoutId);
  }, [surfaceStyles, sceneData]);
  const markerScaleRef = useRef(markerScale);
  markerScaleRef.current = markerScale;
  const buildPointCloudRef = useRef(null);
  const visiblePointCloudsRef = useRef(visiblePointClouds);
  visiblePointCloudsRef.current = visiblePointClouds;
  const annotationsRef = useRef([]);
  const annotationSettingsRef = useRef({ annotationsVisible, annotationScale });
  annotationSettingsRef.current = { annotationsVisible, annotationScale };
  // `annotationFont` is a font-family string (e.g. from ANNOTATION_FONT_CHOICES);
  // annotationsBuilder combines it with each annotation's own size/weight.
  const annotationStyleRef = useRef({ fontFamily: annotationFont, textColor: annotationTextColor, backgroundColor: annotationBackgroundColor });
  annotationStyleRef.current = { fontFamily: annotationFont, textColor: annotationTextColor, backgroundColor: annotationBackgroundColor };
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const pointCallbacksRef = useRef({ onPointHover, onPointSelect });
  pointCallbacksRef.current = { onPointHover, onPointSelect };
  const selectedPointRef = useRef(selectedPoint);
  selectedPointRef.current = selectedPoint;
  const syncSelectedHighlightRef = useRef(null);

  useEffect(() => {
    annotationsRef.current.forEach(({ object, baseScale }) => {
      object.visible = annotationsVisible;
      applyAnnotationScale(object, baseScale * annotationScale);
    });
  }, [annotationsVisible, annotationScale]);

  // Font/colour overrides change what's painted onto each label's canvas
  // (and, for fonts, its measured size), so the labels are rebuilt from
  // scratch rather than patched in place — same annotationsBuilder helpers
  // the initial scene build uses, just re-run with the new style. Debounced
  // (a colour <input type="color"> fires onChange continuously while
  // dragging) and gated on the fonts actually being loaded, since a canvas
  // draws with whatever font is available *now* and never gets repainted.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      const style = annotationStyleRef.current;
      const fonts = new Set(
        (sceneData.annotations ?? [])
          .filter((annotationData) => annotationData?.text)
          .map((annotationData) => resolveLabelFont(annotationData, style.fontFamily))
      );
      Promise.all([...fonts].map((font) => document.fonts?.load(font).catch(() => {}))).then(() => {
        if (cancelled || sceneRef.current !== scene) return;
        const nextAnnotations = buildAnnotationObjects(sceneData, style);
        disposeAnnotations(annotationsRef.current, scene);
        nextAnnotations.forEach(({ object }) => scene.add(object));
        annotationsRef.current = nextAnnotations;
        annotationsRef.current.forEach(({ object, baseScale }) => {
          object.visible = annotationSettingsRef.current.annotationsVisible;
          applyAnnotationScale(object, baseScale * annotationSettingsRef.current.annotationScale);
        });
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationFont, annotationTextColor, annotationBackgroundColor]);

  // Bounding box of the currently rendered point clouds, lines and surfaces (not
  // the annotations, rings, or axes helper), used by fitScene()/
  // setPresetView() to frame what's actually visible right now rather than
  // the export's original camera framing (which can be badly off after
  // filtering most of a series out).
  function computeSceneBounds() {
    const box = new THREE.Box3();
    let hasContent = false;
    for (const object of [...pointCloudsRef.current, ...linesRef.current, ...meshesRef.current]) {
      if (!object.visible) continue;
      const objectBox = new THREE.Box3().setFromObject(object);
      if (Number.isFinite(objectBox.min.x) && Number.isFinite(objectBox.max.x)) {
        box.union(objectBox);
        hasContent = true;
      }
    }
    return hasContent ? box : null;
  }

  // The distance a camera with the given (perspective) field of view needs
  // to be from a bounding sphere's centre to fit the whole sphere in frame,
  // with a 20% margin. Orthographic cameras ignore fov for their own zoom,
  // but still need a reasonable distance for near/far and pan/zoom feel.
  function fitDistance(camera, radius) {
    const fovDegrees = camera.isPerspectiveCamera ? camera.fov : 50;
    return (Math.max(radius, 1e-6) / Math.sin(THREE.MathUtils.degToRad(fovDegrees / 2))) * 1.2;
  }

  // Animates the camera to look at the box's centre from `direction` (from
  // the centre towards the camera), close enough - or for an orthographic
  // camera, zoomed in enough - that the box fills the view (fitBoxToView).
  function frameBox(camera, controls, box, direction) {
    const center = box.getCenter(new THREE.Vector3());
    const framing = fitBoxToView(camera, box, direction, camera.up) ?? {
      distance: fitDistance(camera, box.getBoundingSphere(new THREE.Sphere()).radius),
      zoom: null,
    };
    const position = center.clone().add(direction.clone().normalize().multiplyScalar(framing.distance));
    cancelAnimationRef.current?.();
    cancelAnimationRef.current = animateCameraTo(camera, controls, position, center, undefined, framing.zoom);
  }

  useImperativeHandle(ref, () => ({
    resetView() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const home = homeViewRef.current;
      if (!camera || !controls || !home) return;

      cancelAnimationRef.current?.();
      // An orthographic camera starts at zoom 1, so that is "home" too.
      cancelAnimationRef.current = animateCameraTo(camera, controls, home.position, home.target, undefined, 1);
    },

    // Current camera state (position, orbit target, up vector, orthographic
    // zoom and projection kind, see cameraState.js), for a caller (page.js's
    // per-scene camera memory and session persistence) to snapshot and later
    // restore verbatim.
    getCameraState() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return null;
      return snapshotCameraState(camera, controls.target);
    },

    // Snaps straight to the given state — no animation, since this is
    // "restore exactly where I left off", not a guided navigation. A state
    // captured through the other kind of camera (before a perspective /
    // orthographic switch) is converted so the same view stays on screen.
    setCameraState(state) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const projection = camera.isOrthographicCamera ? "orthographic" : "perspective";
      const converted = convertCameraState(state, projection, homeDistanceRef.current);
      if (!converted) return;
      cancelAnimationRef.current?.();
      stopCameraGlide(controls);
      applyCameraState(camera, controls, converted);
    },

    // Reframes on the currently visible data, keeping the current viewing
    // direction (just moving along it), rather than jumping back to the
    // export's original camera position/angle the way resetView() does.
    fitScene() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const box = computeSceneBounds();
      if (!box) return;

      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
      frameBox(camera, controls, box, direction);
    },

    // Plan / section views like mXrap's XY, XZ and YZ buttons ("top",
    // "front", "side"; see presetCameraOffset), framed on the currently
    // visible data like fitScene(). The camera's up is not changed, so
    // orbiting afterwards still turns around the scene's vertical.
    setPresetView(view) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const offset = presetCameraOffset(view, camera.up, 1);
      if (!offset) return;
      const direction = new THREE.Vector3(offset.x, offset.y, offset.z);

      const box = computeSceneBounds();
      if (box) {
        frameBox(camera, controls, box, direction);
        return;
      }
      // Nothing visible to frame: turn to the view, keeping distance and zoom.
      const target = controls.target.clone();
      direction.normalize().multiplyScalar(camera.position.distanceTo(target));
      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateCameraTo(camera, controls, target.clone().add(direction), target);
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sceneData) return;

    // ---------- 1. Scene / Camera / Renderer ----------
    const scene = new THREE.Scene();
    // Slightly lighter blue-black than the panel chrome's near-black
    // (--color-base #0C1110), so the model reads as sitting "in" the
    // viewport rather than blending into it.
    scene.background = new THREE.Color(0x121a20);
    sceneRef.current = scene;

    const camPos = sceneData.camera?.position ?? DEFAULT_CAMERA.position;
    const camFocal = sceneData.camera?.focal ?? DEFAULT_CAMERA.focal;
    const camUp = sceneData.camera?.up ?? DEFAULT_CAMERA.up;

    const distanceToTarget =
      Math.hypot(camPos.x - camFocal.x, camPos.y - camFocal.y, camPos.z - camFocal.z) || 10;
    homeDistanceRef.current = distanceToTarget;

    // projectionMode lets the parent switch between perspective (default)
    // and orthographic (parallel projection, no foreshortening) — see
    // cameraControls.js for why this exists.
    const camera = createCamera(
      projectionMode,
      container.clientWidth / container.clientHeight,
      distanceToTarget
    );

    camera.position.set(camPos.x, camPos.y, camPos.z);
    // A level export camera orbits around true vertical (see levelCameraUp).
    const levelUp = levelCameraUp(camUp, camPos, camFocal);
    camera.up.set(levelUp.x, levelUp.y, levelUp.z); // 必须在 lookAt 之前设置，否则不生效
    camera.lookAt(camFocal.x, camFocal.y, camFocal.z);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function createSelectionRing(colour) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, 64, 64);
      context.strokeStyle = colour;
      context.lineWidth = 7;
      context.beginPath();
      context.arc(32, 32, 24, 0, Math.PI * 2);
      context.stroke();
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(0.065);
      sprite.renderOrder = 1000;
      sprite.visible = false;
      scene.add(sprite);
      return sprite;
    }

    const hoverRing = createSelectionRing("#84cc16");
    const selectionRing = createSelectionRing("#e8f7d1");

    // ---------- 1b. Camera controls (rotate / zoom / tilt / pan) ----------
    const orbitTarget = new THREE.Vector3(camFocal.x, camFocal.y, camFocal.z);
    const controls = createCameraControls(camera, renderer.domElement, orbitTarget);

    cameraRef.current = camera;
    controlsRef.current = controls;
    homeViewRef.current = { position: camPos, target: camFocal };

    function handleControlsChange() {
      onCameraChangeRef.current?.(snapshotCameraState(camera, controls.target));
    }
    controls.addEventListener("change", handleControlsChange);

    // ---------- 1c. Point-size inputs that depend on renderer / camera ----------
    // The GPU's supported point-size range is queried once. The rest
    // (drawing-buffer width -> pixelSizeNVCx, orthographic parallelCartoonScale)
    // change on zoom/resize, so they're recomputed here and refreshed every
    // frame in the animation loop. See pointSizing.js for the customer model.
    const hardwarePointSizeRange = getHardwarePointSizeRange(renderer);
    const drawingBufferSize = new THREE.Vector2();
    const textureCache = new Map();

    function getSymbolTexture(dataUrl) {
      if (!dataUrl) return null;
      if (textureCache.has(dataUrl)) return textureCache.get(dataUrl);
      const texture = new THREE.Texture();
      texture.colorSpace = THREE.SRGBColorSpace;
      const image = new Image();
      image.onload = () => {
        texture.image = keyOutOpaqueBlackBackground(image);
        texture.needsUpdate = true;
      };
      image.onerror = () => {
        texture.userData.loadFailed = true;
      };
      image.src = dataUrl;
      textureCache.set(dataUrl, texture);
      return texture;
    }

    function currentPointSizing() {
      renderer.getDrawingBufferSize(drawingBufferSize);
      const bufferWidth = Math.max(1, drawingBufferSize.x);
      const isParallel = camera.isOrthographicCamera === true;
      return {
        cameraParallel: isParallel ? 1 : 0,
        pixelSizeNVCx: 2 / bufferWidth,
        parallelCartoonScale: isParallel
          ? computeParallelCartoonScale(orthoParallelScaleFromCamera(camera))
          : 1,
        hardwarePointSizeRange,
      };
    }

    // ---------- 2. Lights ----------
    // Stronger than the light-theme defaults, and a second fill light from
    // the opposite side: against the dark viewport background, flatter
    // lighting made surfaces/points harder to read as 3D shapes rather than
    // silhouettes.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-6, -4, -8);
    scene.add(fillLight);

    // ---------- 3. 根据 sceneData 加载真实内容 ----------
    const meshes = [];
    (sceneData.surfaces ?? []).forEach((surfaceData, index) => {
      // Real marker-def data (parsed from the export's markers.json) takes
      // priority; surfaces with no resolvable colour marker fall back to
      // the flat placeholder colour buildSurfaceMesh's own default handles.
      const style = surfaceStylesRef.current[index];
      const mesh = buildStyledSurfaceMesh(surfaceData, style);
      builtSurfaceStylesRef.current[index] = style;
      mesh.visible = surfaceVisibilityRef.current[index] ?? surfaceData.visible !== false;
      scene.add(mesh);
      meshes.push(mesh);
    });
    meshesRef.current = meshes;
    const lineObjects = (sceneData.lineSeries ?? []).map((series, index) => {
      const object = buildLineSegments(series);
      object.visible = (lineVisibilityRef.current[index] ?? series.visible !== false) && lineObjectHasSegments(object);
      scene.add(object);
      return object;
    });
    linesRef.current = lineObjects;

function createPointCloud(pointSeriesData) {
  const contentOptions =
    resolveMarkerRenderOptions(pointSeriesData) ??
    getDemoRenderOptions(pointSeriesData);

  const renderOptions = {
    ...contentOptions,
    ...buildSharedPointSizing(currentPointSizing()),
    markerDisplayScale: markerScaleRef.current,
  };

  // Seismic Events using the magnitude sphere style
  // are rendered as procedurally shaded spheres.
  if (contentOptions.renderAsShadedSphere) {
    return buildPointCloud(
      pointSeriesData,
      {
        ...renderOptions,
        pointTexture: null,
        renderAsShadedSphere: true,
      }
    );
  }

  // No symbol mapping: render as normal points.
  if (!contentOptions.symbolFn) {
    return buildPointCloud(
      pointSeriesData,
      renderOptions
    );
  }

  // Symbol-based series such as Sensors are grouped
  // by texture.
  const batches = new Map();

  for (const point of pointSeriesData.points ?? []) {
    const symbol =
      contentOptions.symbolFn(point);

    const dataUrl =
      symbol
        ? contentOptions.symbolAssets?.[symbol]
        : null;

    const batchKey =
      dataUrl ?? "__no_texture__";

    if (!batches.has(batchKey)) {
      batches.set(batchKey, {
        dataUrl,
        points: [],
      });
    }

    batches.get(batchKey).points.push(point);
  }

  const group = new THREE.Group();

  for (const batch of batches.values()) {
    const pointTexture =
      batch.dataUrl
        ? getSymbolTexture(batch.dataUrl)
        : null;

    const points = buildPointCloud(
      {
        ...pointSeriesData,
        points: batch.points,
      },
      {
        ...renderOptions,
        pointTexture,
        tintTextureWithVertexColor: contentOptions.tintSymbols === true,
      }
    );

    group.add(points);
  }

  group.userData.symbolBatchCount =
    batches.size;

  return group;
}

    function forEachPointObject(object, callback) {
      object?.traverse((child) => {
        if (child.isPoints) callback(child);
      });
    }

    function disposePointObject(object) {
      forEachPointObject(object, (pointCloud) => {
        pointCloud.geometry.dispose();
        pointCloud.material.dispose();
      });
    }

    const pointClouds = [];
    const initialPointCloudData = Array.isArray(visiblePointCloudsRef.current)
      ? visiblePointCloudsRef.current
      : sceneData.pointClouds ?? [];
    initialPointCloudData.forEach((pointSeriesData, seriesIndex) => {
      const pointCloud = createPointCloud(pointSeriesData);
      forEachPointObject(pointCloud, (points) => {
        points.userData.seriesIndex = seriesIndex;
      });
      scene.add(pointCloud);
      pointClouds.push(pointCloud);
    });
    pointCloudsRef.current = pointClouds;
    buildPointCloudRef.current = createPointCloud;

    function inspectIntersection(intersection) {
      const points = intersection?.object;
      const point = points?.geometry?.userData?.points?.[intersection.index];
      if (!point) return null;
      return {
        point,
        sourceIndex: Number.isInteger(point.sourceIndex)
          ? point.sourceIndex
          : points.geometry.userData.sourceIndices?.[intersection.index] ?? intersection.index,
        seriesIndex: points.userData.seriesIndex ?? 0,
        position: intersection.point.clone(),
      };
    }

    function pickPoint(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Points.threshold = Math.max(0.02, camera.position.distanceTo(controls.target) * 0.008);
      const intersections = raycaster.intersectObjects(pointCloudsRef.current, true);
      return inspectIntersection(intersections[0]);
    }

    // Click reuses the most recent hover's intersection rather than
    // re-raycasting from the click event: `click`'s MouseEvent.clientX/Y are
    // integer-rounded (unlike `pointermove`'s fractional coordinates), and
    // that sub-pixel rounding was enough to turn a hit into a miss at the
    // edge of a point's small raycast threshold. Reusing the hover result
    // also matches user intent more directly — clicking selects whatever the
    // ring is currently showing.
    let lastHoverKey = null;
    let lastInspected = null;
    function handlePointerMove(event) {
      const inspected = pickPoint(event);
      lastInspected = inspected;
      hoverRing.visible = Boolean(inspected);
      if (inspected) hoverRing.position.copy(inspected.position);
      renderer.domElement.style.cursor = inspected ? "pointer" : "grab";
      const nextHoverKey = inspected ? `${inspected.seriesIndex}:${inspected.sourceIndex}` : null;
      if (nextHoverKey !== lastHoverKey) {
        lastHoverKey = nextHoverKey;
        pointCallbacksRef.current.onPointHover?.(inspected);
      }
    }

    function handlePointerLeave() {
      hoverRing.visible = false;
      renderer.domElement.style.cursor = "grab";
      lastInspected = null;
      if (lastHoverKey !== null) {
        lastHoverKey = null;
        pointCallbacksRef.current.onPointHover?.(null);
      }
    }

    function handleClick(event) {
      const inspected = lastInspected ?? pickPoint(event);
      selectionRing.visible = Boolean(inspected);
      if (inspected) selectionRing.position.copy(inspected.position);
      pointCallbacksRef.current.onPointSelect?.(inspected);
    }

    function syncSelectedHighlight(selection) {
      selectionRing.visible = false;
      if (!selection) return;
      for (const pointObject of pointCloudsRef.current) {
        let found = false;
        forEachPointObject(pointObject, (points) => {
          if (found || points.userData.seriesIndex !== selection.seriesIndex) return;
          const pointIndex = points.geometry.userData.sourceIndices?.indexOf(selection.sourceIndex) ?? -1;
          if (pointIndex < 0) return;
          const position = points.geometry.getAttribute("position");
          selectionRing.position.set(
            position.getX(pointIndex),
            position.getY(pointIndex),
            position.getZ(pointIndex)
          );
          selectionRing.visible = true;
          found = true;
        });
        if (found) break;
      }
    }

    syncSelectedHighlightRef.current = syncSelectedHighlight;
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("click", handleClick);
    syncSelectedHighlight(selectedPointRef.current);

    const annotations = buildAnnotationObjects(sceneData, annotationStyleRef.current);
    annotations.forEach(({ object }) => scene.add(object));
    annotationsRef.current = annotations;
    annotationsRef.current.forEach(({ object, baseScale }) => {
      object.visible = annotationSettingsRef.current.annotationsVisible;
      applyAnnotationScale(object, baseScale * annotationSettingsRef.current.annotationScale);
    });

    // Keep the orthographic point-size uniforms in step with zoom / resize.
    // Perspective materials don't declare these uniforms, so they're skipped;
    // currentPointSizing() is only recomputed when an orthographic material
    // is actually present.
    function refreshOrthographicPointSizing() {
      let sizing = null;
      for (const pointObject of pointCloudsRef.current) {
        forEachPointObject(pointObject, (pointCloud) => {
          const uniforms = pointCloud.material?.uniforms;
          if (!uniforms) return;
          if (!uniforms.pixelSizeNVCx && !uniforms.parallelCartoonScale) return;
          if (!sizing) sizing = currentPointSizing();
          if (uniforms.pixelSizeNVCx) {
            uniforms.pixelSizeNVCx.value = sizing.pixelSizeNVCx;
          }
          if (uniforms.parallelCartoonScale) {
            uniforms.parallelCartoonScale.value = sizing.parallelCartoonScale;
          }
        });
      }
    }

    // Bottom-left XYZ indicator (an SVG over the canvas, see
    // orientationGizmo.js). Forgetting the last orientation makes the first
    // frame of a rebuilt scene draw it.
    const axisIndicatorMemo = {};

    // Plan-view grid (planGrid.js): shown only while the orthographic camera
    // looks straight along an axis. Its lines ignore depth and are drawn
    // first, so surfaces, lines and points always cover them. In the same
    // views a drag pans instead of rotating (setPlanNavigation).
    const planGrid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: PLAN_GRID_COLOUR, depthTest: false, depthWrite: false })
    );
    planGrid.renderOrder = -1;
    planGrid.frustumCulled = false;
    planGrid.visible = false;
    scene.add(planGrid);
    const planGridMemo = { key: null, plan: false };
    const planGridOverlay = planGridOverlayRef.current;

    function refreshPlanGrid() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const key = [
        camera.position.x, camera.position.y, camera.position.z,
        camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w,
        camera.zoom, camera.left, camera.right, camera.top, camera.bottom,
        controls.target.x, controls.target.y, controls.target.z, width, height,
      ].join(",");
      if (key === planGridMemo.key) return;
      planGridMemo.key = key;

      const grid = computePlanGrid(camera, controls.target, width, height);
      if (grid) {
        const positions = new Float32Array(grid.lines.length * 6);
        grid.lines.forEach((line, index) => {
          line.from.toArray(positions, index * 6);
          line.to.toArray(positions, index * 6 + 3);
        });
        planGrid.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      }
      planGrid.visible = Boolean(grid);
      updatePlanGridLabels(planGridOverlay, grid, width, height);
      if (planGridMemo.plan !== Boolean(grid)) {
        planGridMemo.plan = Boolean(grid);
        setPlanNavigation(controls, planGridMemo.plan);
      }
    }

    // ---------- 4. Resize 监听 ----------
    function handleResize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      updateCameraAspect(camera, width, height);
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", handleResize);
    // The viewport also changes size while the window stays the same: the
    // side panels collapse and expand, and the import report opens above it.
    // Listening to the window alone left the canvas at its old size - an
    // empty strip beside the legend, or part of the scene hidden under it.
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    resizeObserver?.observe(container);

    // ---------- 5. 渲染循环 ----------
    let animationId;
    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update();
      refreshOrthographicPointSizing();
      refreshPlanGrid();
      renderer.render(scene, camera);
      updateAxisIndicator(axisIndicatorRef.current, camera.quaternion, axisIndicatorMemo);
    }
    animate();

    // ---------- 6. Cleanup（清理）----------
    return () => {
      cancelAnimationFrame(animationId);
      cancelAnimationRef.current?.();
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("click", handleClick);

      // The meshes now in the scene: a Surface Style change replaces them.
      meshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      lineObjects.forEach((object) => {
        object.geometry.dispose();
        object.material.dispose();
      });
      linesRef.current = [];

      pointCloudsRef.current.forEach(disposePointObject);
      textureCache.forEach((texture) => texture.dispose());
      textureCache.clear();
      [hoverRing, selectionRing].forEach((ring) => {
        ring.material.map?.dispose();
        ring.material.dispose();
        scene.remove(ring);
      });

      // Dispose whatever labels are in the scene now — after a style change
      // that is the rebuilt set, not the array built when the scene was created.
      disposeAnnotations(annotationsRef.current);
      annotationsRef.current = [];

      planGrid.geometry.dispose();
      planGrid.material.dispose();
      scene.remove(planGrid);
      updatePlanGridLabels(planGridOverlay, null);

      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      pointCloudsRef.current = [];
      meshesRef.current = [];
      buildPointCloudRef.current = null;
      syncSelectedHighlightRef.current = null;
    };
  }, [sceneData, projectionMode]); // Key: re-run the full teardown/rebuild whenever sceneData or projectionMode changes

  // Filtering replaces point-cloud geometry only. The scene, camera,
  // controls, surfaces and current view remain intact while the visible
  // rows change.
  useEffect(() => {
    const scene = sceneRef.current;
    const createPointCloud = buildPointCloudRef.current;
    if (!scene || !createPointCloud || !Array.isArray(visiblePointClouds)) return;

    const currentPointClouds = pointCloudsRef.current;
    const nextPointClouds = visiblePointClouds.map((seriesData, seriesIndex) => {
      const pointObject = createPointCloud(seriesData);
      pointObject.traverse((child) => {
        if (child.isPoints) child.userData.seriesIndex = seriesIndex;
      });
      return pointObject;
    });

    currentPointClouds.forEach((pointObject) => {
      scene.remove(pointObject);
      pointObject.traverse((child) => {
        if (!child.isPoints) return;
        child.geometry.dispose();
        child.material.dispose();
      });
    });
    nextPointClouds.forEach((pointCloud) => scene.add(pointCloud));
    pointCloudsRef.current = nextPointClouds;
  }, [visiblePointClouds]);

  useEffect(() => {
    syncSelectedHighlightRef.current?.(selectedPoint);
  }, [selectedPoint, visiblePointClouds]);

  useEffect(() => {
    pointCloudsRef.current.forEach((object) => object.traverse((child) => {
      const uniform = child.material?.uniforms?.markerDisplayScale;
      if (uniform) uniform.value = markerScale;
    }));
  }, [markerScale, visiblePointClouds, sceneData, projectionMode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <PlanGridLabels ref={planGridOverlayRef} />
      <AxisIndicator ref={axisIndicatorRef} title={axisIndicatorTitle(sceneData?.camera?.up ?? DEFAULT_CAMERA.up)} />
    </div>
  );
});

export default ThreeScene;
