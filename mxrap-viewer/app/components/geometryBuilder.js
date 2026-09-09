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
  if (!Array.isArray(vertices) || !Array.isArray(faces)) {
    throw new Error(
      "Surface requires vertices and faces arrays."
    );
  }

  if (vertices.length === 0) {
    throw new Error("Surface contains no vertices.");
  }

  const idToIndex = new Map();

  const positions =
    new Float32Array(vertices.length * 3);

  const materialValues =
    new Float32Array(vertices.length);

  vertices.forEach((vertex, index) => {
    if (idToIndex.has(vertex.id)) {
      console.warn(
        `Duplicate vertex ID ${vertex.id}`
      );
    }

    idToIndex.set(vertex.id, index);

    positions[index * 3] = vertex.x;
    positions[index * 3 + 1] = vertex.y;
    positions[index * 3 + 2] = vertex.z;

    materialValues[index] =
      vertex.materialValue ?? 0;
  });

  const indices = [];

  faces.forEach((face) => {
    const i1 = idToIndex.get(face.v1);
    const i2 = idToIndex.get(face.v2);
    const i3 = idToIndex.get(face.v3);

    if (
      i1 === undefined ||
      i2 === undefined ||
      i3 === undefined
    ) {
      console.warn(
        "Invalid face skipped:",
        face
      );
      return;
    }

    // Degenerate triangle
    if (
      i1 === i2 ||
      i2 === i3 ||
      i1 === i3
    ) {
      return;
    }

    indices.push(i1, i2, i3);
  });

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  geometry.setAttribute(
    "materialValue",
    new THREE.BufferAttribute(
      materialValues,
      1
    )
  );

  geometry.setIndex(
    new THREE.Uint32BufferAttribute(
      indices,
      1
    )
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

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
  const geometry =
    buildSurfaceGeometry(
      surfaceData.vertices,
      surfaceData.faces
    );

  const material =
    new THREE.MeshStandardMaterial({
      color: surfaceData.color ?? 0x888888,
      side: THREE.DoubleSide,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.name =
    surfaceData.name ?? "Surface";

  mesh.visible =
    surfaceData.visible ?? true;

  mesh.userData = {
    type: "surface",

    vertexCount:
      surfaceData.vertices.length,

    faceCount:
      surfaceData.faces.length,

    colourMarker:
      surfaceData.colourMarker,
  };

  return mesh;
}
