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
import { resolveMarkerRenderOptions } from "./pointMarkerResolver";
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

// A THREE.Sprite's geometry is always a unit square, unlike the
// PlaneGeometry-based fixed-orientation labels, so scaling it uniformly
// squashes/stretches the label's real aspect ratio, distorting and
// blurring the text. Scale it per-axis using the aspect ratio
// annotationsBuilder.js stores on the sprite instead.
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
  const buildPointCloudRef = useRef(null);
  const visiblePointCloudsRef = useRef(visiblePointClouds);
  visiblePointCloudsRef.current = visiblePointClouds;
  const annotationsRef = useRef([]);
  const annotationSettingsRef = useRef({ annotationsVisible, annotationScale });
  annotationSettingsRef.current = { annotationsVisible, annotationScale };

  useEffect(() => {
    annotationsRef.current.forEach(({ object, baseScale }) => {
      object.visible = annotationsVisible;
      applyAnnotationScale(object, baseScale * annotationScale);
    });
  }, [annotationsVisible, annotationScale]);

  useImperativeHandle(ref, () => ({
    resetView() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const home = homeViewRef.current;
      if (!camera || !controls || !home) return;

      cancelAnimationRef.current?.();
      cancelAnimationRef.current = animateCameraTo(camera, controls, home.position, home.target);
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sceneData) return;

    // ---------- 1. Scene / Camera / Renderer ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
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

    // ---------- 1b. Camera controls (rotate / zoom / tilt / pan) ----------
    const orbitTarget = new THREE.Vector3(camFocal.x, camFocal.y, camFocal.z);
    const controls = createCameraControls(camera, renderer.domElement, orbitTarget);

    cameraRef.current = camera;
    controlsRef.current = controls;
    homeViewRef.current = { position: camPos, target: camFocal };

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
      const texture = new THREE.TextureLoader().load(
        dataUrl,
        undefined,
        undefined,
        () => {
          texture.userData.loadFailed = true;
        }
      );
      texture.colorSpace = THREE.SRGBColorSpace;
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // ---------- 3. 根据 sceneData 加载真实内容 ----------
    const meshes = [];
    (sceneData.surfaces ?? []).forEach((surfaceData) => {
      const mesh = buildSurfaceMesh(surfaceData);
      scene.add(mesh);
      meshes.push(mesh);
    });

    function createPointCloud(pointSeriesData) {
      // Real marker-defs data (parsed from the export's markers.json) takes
      // priority; mock scenes with no marker definitions fall back to the
      // ml-based demo adapter.
      const contentOptions =
        resolveMarkerRenderOptions(pointSeriesData) ?? getDemoRenderOptions(pointSeriesData);
      const renderOptions = { ...contentOptions, ...buildSharedPointSizing(currentPointSizing()) };
      if (!contentOptions.symbolFn) {
        return buildPointCloud(pointSeriesData, renderOptions);
      }

      const batches = new Map();
      for (const point of pointSeriesData.points ?? []) {
        const symbol = contentOptions.symbolFn(point);
        const dataUrl = symbol ? contentOptions.symbolAssets?.[symbol] : null;
        const batchKey = dataUrl ?? "__circle_fallback__";
        if (!batches.has(batchKey)) batches.set(batchKey, { dataUrl, points: [] });
        batches.get(batchKey).points.push(point);
      }

      const group = new THREE.Group();
      for (const batch of batches.values()) {
        const pointTexture = getSymbolTexture(batch.dataUrl);
        const points = buildPointCloud(
          { ...pointSeriesData, points: batch.points },
          { ...renderOptions, pointTexture }
        );
        group.add(points);
      }
      group.userData.symbolBatchCount = batches.size;
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
    initialPointCloudData.forEach((pointSeriesData) => {
      const pointCloud = createPointCloud(pointSeriesData);
      scene.add(pointCloud);
      pointClouds.push(pointCloud);
    });
    pointCloudsRef.current = pointClouds;
    buildPointCloudRef.current = createPointCloud;

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

      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });

      pointCloudsRef.current.forEach(disposePointObject);
      textureCache.forEach((texture) => texture.dispose());
      textureCache.clear();

      annotations.forEach(({ object }) => disposeAnnotation(object));
      annotationsRef.current = [];

      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      pointCloudsRef.current = [];
      buildPointCloudRef.current = null;
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
    const nextPointClouds = visiblePointClouds.map((seriesData) => createPointCloud(seriesData));

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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

export default ThreeScene;
