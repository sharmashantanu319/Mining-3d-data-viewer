// 这个文件专门负责"数据 → Three.js 几何体"的转换
// This file is responsible for converting raw data into Three.js geometry.
//
// 背景 / Background:
// 8.13 客户会议里，Matt 说明了 surface（表面）数据的结构：
// - vertices（顶点）表：每个顶点有唯一 ID，以及 x/y/z 坐标
// - faces（面）表：每一行是 3 个顶点 ID，表示这 3 个点连成一个三角形
//
// 需要注意 / Important caveat:
// 顶点表的 ID 不一定从 0 开始连续排列，但 Three.js 的 setIndex()
// 需要的是"数组下标"（从 0 开始）。所以这里需要先建一个
// "ID → 数组下标" 的映射表，再把 faces 里的 ID 转换成下标。

import * as THREE from "three";

/**
 * 把 { vertices, faces } 格式的数据，转换成 Three.js 的 BufferGeometry
 * Convert { vertices, faces } data into a Three.js BufferGeometry.
 *
 * @param {Array<{id: number|string, x: number, y: number, z: number}>} vertices
 * @param {Array<{v1: number|string, v2: number|string, v3: number|string}>} faces
 * @returns {THREE.BufferGeometry}
 */
export function buildSurfaceGeometry(vertices, faces) {
  // 第一步：建立 "顶点 ID → 数组下标" 的映射表
  // Step 1: build an "ID -> array index" lookup map.
  // 例如顶点 ID 是 [5, 10, 23]，映射后变成 [0, 1, 2]（数组下标）
  const idToIndex = new Map();
  const positions = new Float32Array(vertices.length * 3);

  vertices.forEach((vertex, index) => {
    idToIndex.set(vertex.id, index);
    positions[index * 3] = vertex.x;
    positions[index * 3 + 1] = vertex.y;
    positions[index * 3 + 2] = vertex.z;
  });

  // 第二步：把 faces 里的顶点 ID，通过映射表转换成数组下标
  // Step 2: convert each face's vertex IDs into array indices using the map.
  const indices = [];
  faces.forEach((face) => {
    const i1 = idToIndex.get(face.v1);
    const i2 = idToIndex.get(face.v2);
    const i3 = idToIndex.get(face.v3);

    // 防御性检查：如果某个 ID 在顶点表里找不到，跳过这个面并给出警告
    // Defensive check: if an ID isn't found in the vertex table, skip this face.
    if (i1 === undefined || i2 === undefined || i3 === undefined) {
      console.warn("Invalid vertex reference, face skipped:", face);
      return;
    }
    indices.push(i1, i2, i3);
  });

  // 第三步：用整理好的数据创建 BufferGeometry
  // Step 3: create the BufferGeometry from the processed data.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  // 计算法线：让光照效果正确显示（否则表面看起来是平的、没有明暗层次）
  // Compute normals so lighting renders correctly (otherwise surfaces look flat).
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * 根据一份 surface 数据（{vertices, faces, color}），
 * 创建一个完整的、可以直接 add 进 scene 的 Mesh
 * Build a ready-to-add THREE.Mesh from a surface data object.
 *
 * @param {{vertices: Array, faces: Array, color?: number}} surfaceData
 * @returns {THREE.Mesh}
 */
export function buildSurfaceMesh(surfaceData) {
  const geometry = buildSurfaceGeometry(surfaceData.vertices, surfaceData.faces);

  // 8.13 会议关键结论：MXRAP 里所有表面必须双面可见（不做背面剔除）
  // Key finding from 8.13 meeting: MXRAP surfaces must always render
  // from both sides (no back-face culling), because engineers need to
  // inspect the model from any camera angle.
  //
  // 关于颜色 / About color:
  // 目前先用简单的纯色材质占位。真正的"颜色渐变条插值"（color ramp
  // interpolation）需要自定义 shader，属于后续 Warson 的任务
  // (07.09 "Implement color interpolation")，这里先不实现，
  // 但保留了 surfaceData.color 作为占位的输入通道。
  const material = new THREE.MeshStandardMaterial({
    color: surfaceData.color ?? 0x4f8ef7,
    side: THREE.DoubleSide, // 关键设置：双面渲染
  });

  return new THREE.Mesh(geometry, material);
}
