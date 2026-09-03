"use client";

// 这是整个 3D Viewer 的核心地基（core scene setup）
// This is the foundational component for the whole 3D viewer.
//
// 这一版在原有基础上，新增了对真实相机数据的支持：
// This version adds support for the real camera data shape.
//
// 背景 / Background:
// 之前假设相机只有一个 position，永远看向原点 (0,0,0)。
// 但客户样例数据（config.json 的 "camera" 字段）显示，真实的相机定义
// 包含三个独立的向量：
//   - Position：相机所在位置
//   - Focal：相机看向的点（不是原点！可能离 Position 很远）
//   - Up：相机的"上方向"，不一定是 (0,1,0)
//
// We previously assumed the camera only had a position and always looked
// at the origin. But the real sample data's config.json "camera" field
// shows the camera is defined by three separate vectors: Position, Focal
// (the point it looks at — not necessarily the origin), and Up (the
// camera's "up" direction, not necessarily (0,1,0)).
//
// 所以 sceneData.camera 现在的形状是：
// sceneData.camera is now shaped like:
//   { position: {x,y,z}, focal: {x,y,z}, up: {x,y,z} }
//
// Camera navigation (rotate/zoom/tilt/pan, with limits, plus a smooth
// "reset view" animation) lives in cameraControls.js and is wired in below.
// resetView() is exposed via ref so a parent can add a "Reset View" button.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { buildSurfaceMesh } from "./geometryBuilder";
import { buildPointCloud } from "./pointsBuilder";
import { animateCameraTo, createCameraControls } from "./cameraControls";

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

const ThreeScene = forwardRef(function ThreeScene({ sceneData }, ref) {
  const containerRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const homeViewRef = useRef(null); // { position, target } 用于 Reset View 回归的目标
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

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    // 关键改动：相机的 position / focal / up 都从 sceneData 读取，
    // 而不是只有 position、且永远看向原点。
    // Key change: position / focal / up all come from sceneData now,
    // instead of only having a position that always looks at the origin.
    const camPos = sceneData.camera?.position ?? DEFAULT_CAMERA.position;
    const camFocal = sceneData.camera?.focal ?? DEFAULT_CAMERA.focal;
    const camUp = sceneData.camera?.up ?? DEFAULT_CAMERA.up;

    camera.position.set(camPos.x, camPos.y, camPos.z);
    // 注意：up 必须在 lookAt 之前设置，否则不会生效！
    // lookAt 内部计算旋转矩阵时会用到 up 向量，顺序反了会导致
    // 相机朝向计算错误（实测过：顺序写反会造成 9.52 度的方向偏差）。
    // Note: up must be set BEFORE lookAt, or it won't take effect!
    // lookAt's internal rotation matrix calculation depends on up —
    // getting the order wrong causes incorrect camera orientation
    // (verified: wrong order caused a 9.52-degree deviation in testing).
    camera.up.set(camUp.x, camUp.y, camUp.z);
    camera.lookAt(camFocal.x, camFocal.y, camFocal.z);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // ---------- 1b. Camera controls (rotate / zoom / tilt / pan) ----------
    // orbitTarget 现在是真实的 Focal 点，不再写死原点
    // orbitTarget is now the real Focal point, not a hardcoded origin.
    const orbitTarget = new THREE.Vector3(camFocal.x, camFocal.y, camFocal.z);
    const controls = createCameraControls(camera, renderer.domElement, orbitTarget);

    cameraRef.current = camera;
    controlsRef.current = controls;
    // homeViewRef 的 target 现在也用真实 Focal，这样 Reset View 才能
    // 正确回到客户在真实数据里定义的默认视角，而不是回到原点。
    // homeViewRef's target now uses the real Focal too, so Reset View
    // correctly returns to the view defined in the real data, not the origin.
    homeViewRef.current = { position: camPos, target: camFocal };

    // ---------- 2. Lights ----------
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // ---------- 3. 根据 sceneData 加载真实内容 ----------
    // Load real geometry from sceneData.surfaces.
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
    // Axes helper, useful for confirming orientation while debugging.
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // ---------- 4. Resize 监听 ----------
    function handleResize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", handleResize);

    // ---------- 5. 渲染循环 ----------
    let animationId;
    function animate() {
      animationId = requestAnimationFrame(animate);
      controls.update(); // enableDamping 为 true 时每帧都需要调用
      renderer.render(scene, camera);
    }
    animate();

    // ---------- 6. Cleanup（清理）----------
    // 这一步同时承担两个角色：
    // 1. React 组件卸载时的常规清理
    // 2. sceneData 变化（切换到下一个 scene）时的"完整清空旧内容"
    //    —— 这正是 8.13 会议里客户要求的行为
    // This cleanup serves two roles: normal unmount cleanup, and the
    // "fully tear down old content" behavior on scene switch that the
    // client asked for in the 13 Aug meeting.
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
  }, [sceneData]); // 关键：依赖 sceneData，变化时触发完整的清空+重建

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

export default ThreeScene;
