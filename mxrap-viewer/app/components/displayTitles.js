// Some exports give every slide's display the same title (TestHazards:
// "Hazard on Excavations" three times; TestResponseViewer: "Responses 3D"
// and "Time after Trigger" three times each), so the scene and chart
// pickers showed identical entries. The slide titles ("Hazards 2018",
// "Hazards 2020", ...) are what tell them apart.
//
// Titles that are already unique are left exactly as exported. A repeated
// title is prefixed with its slide title; if that still repeats (no slide
// title, or identical ones) the entries are numbered.
export function uniqueDisplayTitles(items) {
  const list = Array.isArray(items) ? items : [];
  const count = (titles) => titles.reduce((map, title) => map.set(title, (map.get(title) ?? 0) + 1), new Map());

  const counts = count(list.map((item) => item.title));
  const withSlide = list.map(({ title, slideTitle }) => {
    const slide = typeof slideTitle === "string" ? slideTitle.trim() : "";
    return counts.get(title) > 1 && slide && slide !== title ? `${slide} · ${title}` : title;
  });

  const totals = count(withSlide);
  const seen = new Map();
  return withSlide.map((title) => {
    if (totals.get(title) === 1) return title;
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return `${title} (${n})`;
  });
}
