"use client";

// 这是整个 3D Viewer 的核心地基（core scene setup）
// This is the foundational component for the whole 3D viewer.
//
// 相比最初的 demo 版本，这一版根据 8.13 客户会议梳理出的信息做了升级：
// 1. 组件不再写死内容，而是接收一个 sceneData prop（对应一个 scene 的数据）
// 2. 相机位置从 sceneData.cameraPosition 读取，不再写死
// 3. sceneData 变化（切换 scene）时，完整清空旧内容 + 重新加载新内容
//    （这是客户明确要求的行为："切换scene = 丢弃旧模型，加载新模型"）
// 4. 用 buildSurfaceMesh() 把 {vertices, faces} 数据转换成真实几何体，
//    并统一设置 DoubleSide（双面渲染），这也是客户明确要求的
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
    // 这部分跟最初的 demo 版本基本一致：搭好容器、相机、渲染器
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // 关键改动：相机位置从 sceneData 里读取，而不是写死
    // Key change: camera position now comes from sceneData, not hardcoded.
    const camPos = sceneData.cameraPosition ?? { x: 3, y: 3, z: 5 };
    const target = { x: 0, y: 0, z: 0 };
    const distanceToTarget = Math.hypot(camPos.x - target.x, camPos.y - target.y, camPos.z - target.z) || 1;

    // projectionMode lets the parent switch between perspective (default)
    // and orthographic (parallel projection, no foreshortening) — see
    // cameraControls.js for why this exists.
    const camera = createCamera(
      projectionMode,
      container.clientWidth / container.clientHeight,
      distanceToTarget
    );
    camera.position.set(camPos.x, camPos.y, camPos.z);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // ---------- 1b. Camera controls (rotate / zoom / tilt / pan) ----------
    const orbitTarget = new THREE.Vector3(0, 0, 0); // matches camera.lookAt above
    const controls = createCameraControls(camera, renderer.domElement, orbitTarget);

    cameraRef.current = camera;
    controlsRef.current = controls;
    homeViewRef.current = { position: camPos, target: { x: 0, y: 0, z: 0 } };

    // ---------- 2. Lights ----------
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // ---------- 3. 根据 sceneData 加载真实内容 ----------
    // 之前的 demo 版本这里是写死的一个立方体，
    // 现在改成遍历 sceneData.surfaces，用 buildSurfaceMesh() 逐个构建真实几何体
    //
    // Instead of a hardcoded cube, we now loop through sceneData.surfaces
    // and build real geometry from the scene's own data.
    const meshes = [];
    (sceneData.surfaces ?? []).forEach((surfaceData) => {
      const mesh = buildSurfaceMesh(surfaceData);
      scene.add(mesh);
      meshes.push(mesh);
    });

    // 同样遍历 sceneData.pointClouds，用 buildPointCloud() 渲染点数据
    // (events / sensors 等) —— 目前只有位置/大小/纯色，颜色渐变条和
    // marker 贴图属于后续任务。
    // Same idea for sceneData.pointClouds (events / sensors, etc.) — position/
    // size/flat colour only for now; colour ramps and marker sprites are later tasks.
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
      controls.update(); // required every frame when enableDamping is true
      renderer.render(scene, camera);
    }
    animate();

    // ---------- 6. Cleanup（清理）----------
    // 这一步现在承担了两个角色：
    // 1. React 组件卸载时的常规清理
    // 2. sceneData 变化（切换到下一个 scene）时的"完整清空旧内容"
    //    —— 这正是 8.13 会议里客户要求的行为
    //
    // 因为这个函数依赖 sceneData（见下方 useEffect 的依赖数组），
    // 每次 sceneData 变化，React 会先跑这个 cleanup，再重新执行上面的
    // 所有初始化逻辑，天然实现了"清空旧场景 -> 加载新场景"。
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
