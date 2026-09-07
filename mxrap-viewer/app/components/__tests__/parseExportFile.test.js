import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseExportFile } from "../parseExportFile";

// Build a minimal export zip in memory (no customer files committed).
async function buildZip({ config, files = {} }) {
  const zip = new JSZip();
  zip.file(
    "info.json",
    JSON.stringify({
      version: 1,
      title: "Test export",
      slides: [{ title: "S1", displays: [{ title: "3D", folder: "s1-3dview" }] }],
    })
  );
  zip.file("s1-3dview/config.json", JSON.stringify(config));
  for (const [name, content] of Object.entries(files)) {
    zip.file(`data/${name}.csv`, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const POINTS_CONFIG = {
  type: "3dview",
  name: "3D view",
  camera: { Position: [1, 2, 3], Focal: [0, 0, 0], Up: [0, 0, 1] },
  series: [
    {
      name: "Events",
      type: "points",
      data: "events",
      markerMenu: "events/markers",
      colourMarker: "Mag/Spheres",
      sizeMinimum: 1,
      sizeMaximum: 25,
      nullSizes: 4,
      distanceAttenuation: "cartoon",
      visible: true,
      legend: true,
    },
  ],
};

const EVENTS_CSV = [
  "ID,DateTime,X,Y,Z,ML",
  "1,2023-05-01 00:00:00,10,20,30,-1.5",
  "2,2023-05-01 01:00:00,11,21,31,0.5",
  "3,2023-05-01 02:00:00,12,22,32,2.1",
].join("\n");

describe("parseExportFile - point series", () => {
  it("parses a points series into scene.pointClouds", async () => {
    const buf = await buildZip({ config: POINTS_CONFIG, files: { events: EVENTS_CSV } });
    const result = await parseExportFile(buf);

    expect(result.scenes).toHaveLength(1);
    const scene = result.scenes[0];
    expect(scene.pointClouds).toHaveLength(1);

    const events = scene.pointClouds[0];
    expect(events.name).toBe("Events");
    expect(events.colourMarker).toBe("Mag/Spheres");
    expect(events.markerMenu).toBe("events/markers");
    expect(events.distanceAttenuation).toBe("cartoon");
    expect(events.points).toHaveLength(3);
    expect(events.points[0]).toMatchObject({ x: 10, y: 20, z: 30, ML: -1.5 });
  });

  it("still parses surfaces alongside points, and keeps camera", async () => {
    const config = {
      ...POINTS_CONFIG,
      series: [
        ...POINTS_CONFIG.series,
        { name: "MGM", type: "surface", "data-vertices": "verts", "data-faces": "faces" },
      ],
    };
    const buf = await buildZip({
      config,
      files: {
        events: EVENTS_CSV,
        verts: "ID,Location X,Location Y,Location Z\n1,0,0,0\n2,1,0,0\n3,0,1,0",
        faces: "V1,V2,V3\n1,2,3",
      },
    });
    const result = await parseExportFile(buf);
    const scene = result.scenes[0];

    expect(scene.pointClouds).toHaveLength(1);
    expect(scene.surfaces).toHaveLength(1);
    expect(scene.camera.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("skips a points series whose data CSV is missing, without crashing", async () => {
    const buf = await buildZip({ config: POINTS_CONFIG, files: {} });
    const result = await parseExportFile(buf);
    expect(result.scenes[0].pointClouds).toEqual([]);
  });

  it("a scene with no point series gets an empty pointClouds array", async () => {
    const config = {
      ...POINTS_CONFIG,
      series: [{ name: "MGM", type: "surface", "data-vertices": "v", "data-faces": "f" }],
    };
    const buf = await buildZip({
      config,
      files: { v: "ID,Location X,Location Y,Location Z\n1,0,0,0", f: "V1,V2,V3\n1,1,1" },
    });
    const result = await parseExportFile(buf);
    expect(result.scenes[0].pointClouds).toEqual([]);
  });
});
