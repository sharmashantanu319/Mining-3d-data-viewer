// Resolve exported line membership by ID, never by CSV row index.
// Keep each line separate, including when its membership rows are interleaved.
export function buildLineSeries(vertexRows, lineRows, config, markerDefinitions = []) {
  const vertices = vertexRows.map((row) => ({
    ...row,
    id: row.ID,
    x: row.X ?? row["Location X"],
    y: row.Y ?? row["Location Y"],
    z: row.Z ?? row["Location Z"],
  }));
  const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const grouped = new Map();
  for (const row of lineRows) {
    if (row.LineID == null || row.VertexID == null) continue;
    if (!grouped.has(row.LineID)) grouped.set(row.LineID, []);
    grouped.get(row.LineID).push(byId.get(row.VertexID));
  }
  const lines = [];
  for (const [id, points] of grouped) {
    // Reject the whole malformed line rather than bridging across a missing
    // vertex and inventing a connection that the export never contained.
    if (points.length < 2 || points.some((point) => !point || ![point.x, point.y, point.z].every(Number.isFinite))) {
      console.warn(`Skipping invalid line ${id} in ${config.name ?? "line series"}`);
      continue;
    }
    lines.push({ id, points });
  }
  const usesDefaultRqdPalette = config.colourMarker === "RQD" && !markerDefinitions.some((def) => def.name === "RQD");
  return {
    ...config,
    vertices,
    lines,
    markerDefinitions: usesDefaultRqdPalette ? [...markerDefinitions, defaultRqdMarker()] : markerDefinitions,
    usesDefaultRqdPalette,
    showNullColours: true,
  };
}

// A viewer default, not a palette supplied by the client. Use the same marker
// pipeline for the GPU colours and legend so their scales cannot drift apart.
function defaultRqdMarker() {
  const header = "Up to,Symbol,Start Colour (H),Start Colour (S),Start Colour (V),End Colour (H),End Colour (S),End Colour (V),Colour Ramp,Number of Colours,Transparency [0..100],Colour Space,Start Colour Colour Space,End Colour Colour Space,End Transparency [0..100]";
  return {
    name: "RQD", type: "colour", input: "RQD", inputType: "number",
    minimum: 0, maximum: 100, nullColour: [0.5, 0.5, 0.5],
    legend: { title: "RQD — default palette [%]" },
    rampCsv: `${header}\n,,0,1,1,0.333333333,1,1,linear,,0,HSV,HSV,HSV,0`,
  };
}

export function lineColourSeries(series) {
  return { ...series, points: series.lines.flatMap((line) => line.points) };
}
