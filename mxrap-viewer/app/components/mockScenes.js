// 模拟数据 / Mock data
//
// 目前还没有拿到客户真实的导出文件，所以先用这两份手写的模拟数据，
// 验证 ThreeScene 组件的核心逻辑：
// 1. 能否根据 sceneData 正确渲染出对应的 surface（表面）
// 2. 能否根据 sceneData.cameraPosition 设置相机位置
// 3. 切换 scene 时，能否完整清空旧内容、加载新内容
// 4. 能否根据 sceneData.pointClouds 正确渲染出点云（对应 events/sensors 数据）
//
// 等 Amritansh/Hongfei 的 parser 任务完成、真实数据结构确定后，
// 这份文件可以直接被替换，不影响 ThreeScene 组件本身的逻辑。

// Scene 1：一个简单的三角形平面（3 个顶点，1 个面）
// 顶点 ID 特意不从 0/1 连续开始，用来验证 ID -> 数组下标 映射逻辑是否正确
const scene1 = {
  id: "scene1",
  title: "Scene 1 - Simple Triangle",
  cameraPosition: { x: 3, y: 3, z: 5 },
  surfaces: [
    {
      color: 0x4f8ef7, // 蓝色
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
        { id: 201, x: -0.6, y: 0.3, z: 0.4 },
        { id: 202, x: 0.2, y: 0.6, z: -0.3 },
        { id: 203, x: 0.5, y: 0.9, z: 0.2 },
        { id: 204, x: -0.3, y: 1.1, z: -0.5 },
        { id: 205, x: 0.8, y: 0.4, z: 0.1 },
        { id: 206, x: -0.8, y: 0.7, z: -0.2 },
      ],
    },
  ],
};

// Scene 2：一个由两个三角形组成的四边形（正方形平面），相机位置也不同
const scene2 = {
  id: "scene2",
  title: "Scene 2 - Quad Plane",
  cameraPosition: { x: -4, y: 2, z: 4 },
  surfaces: [
    {
      color: 0xe0724a, // 橙红色，方便肉眼区分和 scene1 是不同的场景
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
