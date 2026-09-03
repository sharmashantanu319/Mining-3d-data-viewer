// 模拟数据 / Mock data
//
// 这一版更新了 camera 字段的结构，匹配真实样例数据 config.json 里
// "camera" 字段的形状（Position / Focal / Up 三个独立向量）。
// This version updates the camera field shape to match the real sample
// data's config.json "camera" field (Position / Focal / Up as three
// separate vectors).
//
// 两个 scene 都故意把 focal 设置得离几何体本身有明显距离/角度差异，
// up 向量也故意设置得比较夸张，这样代码有没有正确生效，
// 肉眼一眼就能看出来，不用靠猜测或者数学验证脚本才能确认。
// Both scenes intentionally use a focal point clearly offset from the
// geometry, and a noticeably tilted up vector — so whether the new
// code path is actually working is visually obvious at a glance,
// rather than requiring a math-verification script to confirm.

const scene1 = {
  id: "scene1",
  title: "Scene 1 - Triangle (focal offset to the side)",
  camera: {
    position: { x: 3, y: 2, z: 6 },
    // focal 故意设成 (4, 0.5, 0)，明显偏离三角形本身
    // （三角形顶点在 x: -1~1 之间），这样一打开画面，
    // 三角形应该明显不在正中央，而是偏向一侧。
    // focal is intentionally set to (4, 0.5, 0), clearly offset from
    // the triangle itself (whose vertices sit around x: -1 to 1) —
    // so on load, the triangle should visibly sit off-center rather
    // than dead in the middle.
    focal: { x: 4, y: 0.5, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  },
  surfaces: [
    {
      color: 0x4f8ef7,
      vertices: [
        { id: 101, x: -1, y: 0, z: 0 },
        { id: 102, x: 1, y: 0, z: 0 },
        { id: 103, x: 0, y: 1.5, z: 0 },
      ],
      faces: [{ v1: 101, v2: 102, v3: 103 }],
    },
  ],
  // 模拟 events 点云：对应真实导出数据里 events/data.csv 的 X/Y/Z 列
  // Mock "events" point cloud, standing in for events/data.csv's X/Y/Z columns.
  pointClouds: [
    {
      color: 0xffcc00, // 黄色，代表地震事件（events）
      size: 0.12,
      points: [
        { id: 201, x: -0.6, y: 0.3, z: 0.4, ml: -2.4 },
        { id: 202, x: 0.2, y: 0.6, z: -0.3, ml: -0.8 },
        { id: 203, x: 0.5, y: 0.9, z: 0.2, ml: 0.5 },
        { id: 204, x: -0.3, y: 1.1, z: -0.5, ml: 1.9 },
        { id: 205, x: 0.8, y: 0.4, z: 0.1, ml: 2.8 },
        { id: 206, x: -0.8, y: 0.7, z: -0.2, ml: -1.5 },
      ],
    },
  ],
};

const scene2 = {
  id: "scene2",
  title: "Scene 2 - Quad (camera rolled ~45 degrees)",
  camera: {
    position: { x: -4, y: 3, z: 5 },
    focal: { x: 0, y: 0, z: 0 },
    // 45 度倾斜的 up 向量（不是轻微倾斜，是很夸张的倾斜），
    // 画面看起来应该像整个"歪着头"看，而不是水平端正的视角 ——
    // 用来验证 camera.up.set() 是否真的在 lookAt 之前生效了。
    // A 45-degree tilted up vector (not subtle — deliberately extreme).
    // The view should look visibly "rolled"/tilted rather than level —
    // this is what proves camera.up.set() is actually taking effect
    // before lookAt runs.
    up: { x: 0.7071, y: 0.7071, z: 0 },
  },
  surfaces: [
    {
      color: 0xe0724a,
      vertices: [
        { id: 1, x: -1.2, y: -1, z: 0 },
        { id: 2, x: 1.2, y: -1, z: 0 },
        { id: 3, x: 1.2, y: 1, z: 0 },
        { id: 4, x: -1.2, y: 1, z: 0 },
      ],
      faces: [
        { v1: 1, v2: 2, v3: 3 },
        { v1: 1, v2: 3, v3: 4 },
      ],
    },
  ],
  // 模拟 sensors 点云：对应真实导出数据里 sensors/data.csv 的 X/Y/Z 列
  // Mock "sensors" point cloud, standing in for sensors/data.csv's X/Y/Z columns.
  pointClouds: [
    {
      color: 0x33cc66, // 绿色，代表传感器（sensors）
      size: 0.1,
      points: [
        { id: 1, x: -1.4, y: -0.6, z: 0.5 },
        { id: 2, x: 1.5, y: 0.4, z: -0.4 },
        { id: 3, x: 0.6, y: 1.2, z: 0.3 },
        { id: 4, x: -0.8, y: 1.3, z: -0.2 },
        { id: 5, x: 1.6, y: -0.9, z: 0.2 },
      ],
    },
  ],
};

export const mockScenes = [scene1, scene2];
// Standalone validation fixtures. They are not included in mockScenes, so
// the regular scene walkthrough remains unchanged.
export const mockCorruptedPoints = {
  points: [
    { id: "ok-1", x: 0.1, y: 0.2, z: 0.3, ml: 1 },
    { id: "bad-missing-x", y: 0.2, z: 0.3 },
    { id: "bad-nan", x: NaN, y: 0.2, z: 0.3 },
    { id: "bad-infinite", x: Infinity, y: 0.2, z: 0.3 },
    null,
    { id: "ok-2", x: -0.5, y: 0.1, z: 0.4, ml: -1.2 },
  ],
};

export const mockEmptyPoints = { points: [] };
export const mockMissingPoints = {};
