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
import { buildAnnotation, disposeAnnotation } from "./annotationsBuilder";
import { buildSurfaceMesh } from "./geometryBuilder";
import { buildPointCloud, getHardwarePointSizeRange } from "./pointsBuilder";
import {
  resolveMarkerRenderOptions,
} from "./pointMarkerResolver";
import { resolveSurfaceVertexColours } from "./surfaceMarkerResolver";
import {
  orthoParallelScaleFromCamera,
  parallelCartoonScale as computeParallelCartoonScale,
} from "./pointSizing";
import {
  animateCameraTo,
  createCamera,
  createCameraControls,
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

const ThreeScene = forwardRef(function ThreeScene(
  {
    sceneData,
    visiblePointClouds = null,
    projectionMode = "perspective",
    annotationsVisible = true,
    annotationScale = 1,
    markerScale = 0.5,
    onCameraChange = null,
    selectedPoint = null,
    onPointHover = null,
    onPointSelect = null,
  },
  ref
) {
  const containerRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const homeViewRef = useRef(null); // { position, target } to return to on reset
  const cancelAnimationRef = useRef(null);
  const sceneRef = useRef(null);
  const pointCloudsRef = useRef([]);
  const meshesRef = useRef([]);
  const markerScaleRef = useRef(markerScale);
  markerScaleRef.current = markerScale;
  const buildPointCloudRef = useRef(null);
  const visiblePointCloudsRef = useRef(visiblePointClouds);
  visiblePointCloudsRef.current = visiblePointClouds;
  const annotationsRef = useRef([]);
  const annotationSettingsRef = useRef({ annotationsVisible, annotationScale });
  annotationSettingsRef.current = { annotationsVisible, annotationScale };
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

  // Bounding box of the currently rendered point clouds and surfaces (not
  // the annotations, rings, or axes helper), used by fitScene()/
  // setPresetView() to frame what's actually visible right now rather than
  // the export's original camera framing (which can be badly off after
  // filtering most of a series out).
  function computeSceneBounds() {
    const box = new THREE.Box3();
    let hasContent = false;
    for (const object of [...pointCloudsRef.current, ...meshesRef.current]) {
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

  useImperativeHandle(ref, () => ({
    resetView() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const home = homeViewRef.current;
      if (!camera || !controls || !home) return;

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateCameraTo(camera, controls, home.position, home.target);
    },

    // Current camera position/orbit target, for a caller (page.js's session
    // persistence) to snapshot and later restore verbatim.
    getCameraState() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return null;
      return {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      };
    },

    // Snaps straight to the given position/target — no animation, since this
    // is "restore exactly where I left off", not a guided navigation.
    setCameraState(state) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls || !state?.position || !state?.target) return;
      cancelAnimationRef.current?.();
      camera.position.set(state.position.x, state.position.y, state.position.z);
      controls.target.set(state.target.x, state.target.y, state.target.z);
      controls.update();
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

      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
      direction.normalize().multiplyScalar(fitDistance(camera, radius));

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateCameraTo(camera, controls, center.clone().add(direction), center);
    },

    // Snaps to a world-axis-aligned view (assumes the scene's own "up" is
    // world +Y, true for every mock and real sample seen so far — a tilted
    // export "up" would need each axis re-derived from it, out of scope
    // here). Frames on the currently visible data like fitScene().
    setPresetView(axis) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const box = computeSceneBounds();
      const center = box ? box.getCenter(new THREE.Vector3()) : controls.target.clone();
      const radius = box
        ? box.getBoundingSphere(new THREE.Sphere()).radius
        : camera.position.distanceTo(controls.target);
      const distance = fitDistance(camera, radius);

      const presets = {
        top: { offset: new THREE.Vector3(0, distance, 0), up: new THREE.Vector3(0, 0, -1) },
        front: { offset: new THREE.Vector3(0, 0, distance), up: new THREE.Vector3(0, 1, 0) },
        side: { offset: new THREE.Vector3(distance, 0, 0), up: new THREE.Vector3(0, 1, 0) },
      };
      const preset = presets[axis];
      if (!preset) return;

      camera.up.copy(preset.up);
      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateCameraTo(camera, controls, center.clone().add(preset.offset), center);
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

    // projectionMode lets the parent switch between perspective (default)
    // and orthographic (parallel projection, no foreshortening) — see
    // cameraControls.js for why this exists.
    const camera = createCamera(
      projectionMode,
      container.clientWidth / container.clientHeight,
      distanceToTarget
    );

    camera.position.set(camPos.x, camPos.y, camPos.z);
    camera.up.set(camUp.x, camUp.y, camUp.z); // 必须在 lookAt 之前设置，否则不生效
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
      onCameraChangeRef.current?.({
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      });
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
    (sceneData.surfaces ?? []).forEach((surfaceData) => {
      // Real marker-def data (parsed from the export's markers.json) takes
      // priority; surfaces with no resolvable colour marker fall back to
      // the flat placeholder colour buildSurfaceMesh's own default handles.
      const vertexColours = resolveSurfaceVertexColours(surfaceData);
      const mesh = buildSurfaceMesh(surfaceData, vertexColours);
      scene.add(mesh);
      meshes.push(mesh);
    });
    meshesRef.current = meshes;

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
        tintTextureWithVertexColor: false,
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

    const annotations = [];
    (sceneData.annotations ?? []).forEach((annotationData) => {
      if (!annotationData?.text) return;
      const annotation = buildAnnotation(annotationData);
      scene.add(annotation);
      annotations.push({
        object: annotation,
        baseScale: Number.isFinite(annotationData.scale) ? annotationData.scale : 10,
      });
    });
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

    // 坐标轴辅助线，方便调试时确认方向
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // ---------- 4. Resize 监听 ----------
    function handleResize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      updateCameraAspect(camera, width, height);
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", handleResize);

    // ---------- 5. 渲染循环 ----------
    let animationId;
    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update();
      refreshOrthographicPointSizing();
      renderer.render(scene, camera);
    }
    animate();

    // ---------- 6. Cleanup（清理）----------
    return () => {
      cancelAnimationFrame(animationId);
      cancelAnimationRef.current?.();
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("click", handleClick);

      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });

      pointCloudsRef.current.forEach(disposePointObject);
      textureCache.forEach((texture) => texture.dispose());
      textureCache.clear();
      [hoverRing, selectionRing].forEach((ring) => {
        ring.material.map?.dispose();
        ring.material.dispose();
        scene.remove(ring);
      });

      annotations.forEach(({ object }) => disposeAnnotation(object));
      annotationsRef.current = [];

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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

export default ThreeScene;
