// Shared by import validation and direct geometry callers (including mocks).
export function surfaceVertexErrors(vertices) {
  const seen = new Set();
  const errors = [];
  let count = 0;
  const report = (message) => {
    count += 1;
    if (errors.length < 5) errors.push(message);
  };
  vertices.forEach(({ id, x, y, z }, index) => {
    const validId = (typeof id === "number" && Number.isFinite(id)) ||
      (typeof id === "string" && id.trim() !== "");
    if (!validId) report(`vertex row ${index + 1} has an invalid ID.`);
    else if (seen.has(id)) report(`vertex row ${index + 1} has duplicate ID "${id}".`);
    seen.add(id);
    if (![x, y, z].every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) {
      report(`vertex row ${index + 1} has invalid coordinates.`);
    }
  });
  if (count > errors.length) errors.push(`...and ${count - errors.length} more vertex errors.`);
  return errors;
}
