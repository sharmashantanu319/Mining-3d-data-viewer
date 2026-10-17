import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { uniqueDisplayTitles } from "../displayTitles";
import { parseExportFile } from "../parseExportFile";

describe("uniqueDisplayTitles", () => {
  it("leaves unique titles exactly as exported", () => {
    expect(uniqueDisplayTitles([
      { title: "General 3D View", slideTitle: "Slide 1" },
      { title: "RMQ 3D View", slideTitle: "Slide 2" },
    ])).toEqual(["General 3D View", "RMQ 3D View"]);
  });

  it("prefixes repeated titles with their slide title", () => {
    expect(uniqueDisplayTitles([
      { title: "Hazard on Excavations", slideTitle: "Hazards 2018" },
      { title: "Hazard on Excavations", slideTitle: "Hazards 2020" },
      { title: "Hazard on Excavations", slideTitle: "Hazards 2022" },
    ])).toEqual([
      "Hazards 2018 · Hazard on Excavations",
      "Hazards 2020 · Hazard on Excavations",
      "Hazards 2022 · Hazard on Excavations",
    ]);
  });

  it("numbers titles that still repeat without distinct slide titles", () => {
    expect(uniqueDisplayTitles([
      { title: "View", slideTitle: null },
      { title: "View", slideTitle: "" },
      { title: "Other", slideTitle: null },
    ])).toEqual(["View (1)", "View (2)", "Other"]);
    expect(uniqueDisplayTitles([
      { title: "View", slideTitle: "Same" },
      { title: "View", slideTitle: "Same" },
    ])).toEqual(["Same · View (1)", "Same · View (2)"]);
  });
});

describe("parseExportFile scene and chart titles", () => {
  it("disambiguates repeated scene and chart titles with slide titles", async () => {
    const zip = new JSZip();
    const view = { type: "3dview", series: [] };
    const chart = { type: "chart", name: "Chart", axes: { bottom: { enabled: true }, left: { enabled: true } }, series: [] };
    zip.file("info.json", JSON.stringify({ slides: [
      { title: "2021-10-17", displays: [{ folder: "s1-view", title: "Responses 3D" }, { folder: "s1-chart", title: "Time after Trigger" }] },
      { title: "2019-08-08 Stacked", displays: [{ folder: "s2-view", title: "Responses 3D" }, { folder: "s2-chart", title: "Time after Trigger" }] },
    ] }));
    for (const folder of ["s1-view", "s2-view"]) zip.file(`${folder}/config.json`, JSON.stringify(view));
    for (const folder of ["s1-chart", "s2-chart"]) zip.file(`${folder}/config.json`, JSON.stringify(chart));
    const result = await parseExportFile(await zip.generateAsync({ type: "uint8array" }));
    expect(result.scenes.map((scene) => scene.title)).toEqual(["2021-10-17 · Responses 3D", "2019-08-08 Stacked · Responses 3D"]);
    expect(result.charts.map((c) => c.title)).toEqual(["2021-10-17 · Time after Trigger", "2019-08-08 Stacked · Time after Trigger"]);
  });
});
