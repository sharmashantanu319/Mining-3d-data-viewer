// 这个文件专门负责"点数据 → Three.js 点云"的转换
// This file is responsible for converting raw point data into a Three.js point cloud.
//
// 背景 / Background:
// mXrap 导出的 events / sensors 数据都是一份 { X, Y, Z, ...属性 } 的表格
// （例如 events/data.csv、sensors/data.csv），每一行对应一个点。
// 这里先只处理"点在哪里、多大、什么颜色"这三件基础信息，
// 不处理颜色渐变条 / marker 贴图（那是 color interpolation 和 markers 任务的范围，
// 分别见 07.09 和 14.09 的任务）。
//
// This mirrors mXrap's events/sensors export tables (one row per point,
// with X/Y/Z plus extra attributes). For now we only handle position,
// size and a flat colour — colour-ramp interpolation and marker sprites
// are separate tasks (07.09 / 14.09) and will layer on top of this later.

import * as THREE from "three";

/**
 * 把一组 { id, x, y, z } 点，转换成 Three.js 的 Points 对象（点云）
 * Convert a list of { id, x, y, z } points into a Three.js Points object.
 *
 * 用 THREE.Points 而不是逐个 Mesh，是因为客户提到过场景里可能有
 * "上百万个点"（见 Business Requirements Analysis 的风险评估），
 * THREE.Points 用一份 BufferGeometry 画所有点，比逐个建 Mesh 省资源得多。
 *
 * We use THREE.Points (a single draw call over one BufferGeometry) rather
 * than one Mesh per point, since the client's export data can contain
 * millions of points — this is the performance-friendly approach.
 *
 * @param {{
 *   points: Array<{id: number|string, x: number, y: number, z: number}>,
 *   color?: number,
 *   size?: number,
 * }} pointSeriesData
 * @returns {THREE.Points}
 */
export function buildPointCloud(pointSeriesData) {
  const { points, color, size } = pointSeriesData;

  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // 占位材质：先用统一大小 + 纯色画所有点，颜色渐变条以后接入
  // Placeholder material: uniform size + flat colour for now, colour
  // ramps will be wired in by the color-interpolation task.
  const material = new THREE.PointsMaterial({
    color: color ?? 0xffcc00,
    size: size ?? 0.15,
    sizeAttenuation: true, // 近大远小，符合 3D 空间里的透视直觉
  });

  return new THREE.Points(geometry, material);
}
