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
import { buildSurfaceMesh } from "./geometryBuilder";
import { buildPointCloud } from "./pointsBuilder";
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

// Temporary demo adapter used to exercise the point renderer's per-point
// colour and size paths. The parser remains plain serialisable data; the
// dedicated colour-interpolation task will replace this adapter later.
function getDemoRenderOptions(pointSeriesData) {
  if (!pointSeriesData.points?.[0] || pointSeriesData.points[0].ml === undefined) {
    return {};
  }

  return {
    colorFn: (point) => {
      const value = Math.min(1, Math.max(0, (point.ml + 4) / 8));
      return { r: value, g: 0.2, b: 1 - value };
    },
    sizeFn: (point) => 4 + Math.max(0, point.ml + 4),
  };
}

const ThreeScene = forwardRef(function ThreeScene({ sceneData, projectionMode = "perspective" }, ref) {
  const containerRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const homeViewRef = useRef(null); // { position, target } to return to on reset
  const cancelAnimationRef = useRef(null);

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

    // near/far 不能用固定数字，必须根据相机到焦点的真实距离动态计算。
    // near/far cannot be fixed numbers — they must be computed from the
    // real camera-to-focal distance.
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

    const pointClouds = [];
    (sceneData.pointClouds ?? []).forEach((pointSeriesData) => {
      const renderOptions = getDemoRenderOptions(pointSeriesData);
      const pointCloud = buildPointCloud(pointSeriesData, renderOptions);
      scene.add(pointCloud);
      pointClouds.push(pointCloud);
    });

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

      pointClouds.forEach((pointCloud) => {
        pointCloud.geometry.dispose();
        pointCloud.material.dispose();
      });

      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [sceneData, projectionMode]); // Key: re-run the full teardown/rebuild whenever sceneData or projectionMode changes

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

export default ThreeScene;