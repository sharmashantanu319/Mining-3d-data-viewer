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

describe("parseExportFile - annotations", () => {
  it("parses top-level display annotations from location, colour and HTML text", async () => {
    const config = {
      type: "3dview",
      annotations: [{
        location: [10410.5, 10236.47, 3069.7],
        colour: "rgb(255,0,0)",
        text: "Area of <b>interest</b>",
      }],
    };
    const buf = await buildZip({ config });

    const result = await parseExportFile(buf);

    expect(result.scenes[0].annotations).toEqual([{
      text: "Area of <b>interest</b>",
      x: 10410.5,
      y: 10236.47,
      z: 3069.7,
      color: "rgb(255,0,0)",
      faceCamera: true,
      render2d: false,
    }]);
  });

  it("parses text series rows and rendering modes into scene annotations", async () => {
    const config = {
      type: "3dview",
      camera: { Position: [1, 2, 3], Focal: [0, 0, 0], Up: [0, 1, 0] },
      series: [{ name: "Labels", type: "text", data: "labels", faceCamera: true }],
    };
    const buf = await buildZip({
      config,
      files: {
        labels: "X,Y,Z,Text,Dip,Dip Direction,Rake\n10,20,30,Portal A,10,20,30\n11,21,31,Portal B,40,50,60",
      },
    });

    const result = await parseExportFile(buf);

    expect(result.scenes[0].annotations).toEqual([
      {
        text: "Portal A", x: 10, y: 20, z: 30, render2d: false, faceCamera: true,
        dip: 10, dipDirection: 20, rake: 30,
      },
      {
        text: "Portal B", x: 11, y: 21, z: 31, render2d: false, faceCamera: true,
        dip: 40, dipDirection: 50, rake: 60,
      },
    ]);
  });

  it("reads an export whose files are under an export root folder", async () => {
    const zip = new JSZip();
    zip.file("export/info.json", JSON.stringify({
      title: "Rooted export",
      slides: [{ displays: [{ title: "3D", folder: "s1-3dview" }] }],
    }));
    zip.file("export/s1-3dview/config.json", JSON.stringify({
      type: "3dview",
      series: [{ name: "Labels", type: "text", data: "labels", render2d: true }],
    }));
    zip.file("export/data/labels.csv", "X,Y,Z,Text\n1,2,3,Portal");

    const result = await parseExportFile(await zip.generateAsync({ type: "uint8array" }));

    expect(result.scenes[0].annotations[0]).toMatchObject({
      text: "Portal",
      render2d: true,
      faceCamera: false,
    });
  });
});
