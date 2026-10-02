const normalize = (name) => String(name ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const groupLabel = "(?:top\\s+(?:set|single)|backdowns?|back[- ]?off(?:\\s+sets?)?|technique|primary|secondary)";
const groupSuffix = new RegExp(`\\s*(?:[—–-]\\s*${groupLabel}|\\(\\s*${groupLabel}\\s*\\)|\\s+${groupLabel})\\s*$`, "i");
const withoutGroupLabel = (name) => String(name ?? "").replace(groupSuffix, "").trim();

export function validateExerciseCatalog(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 150 || JSON.stringify(value).length > 12000) throw new Error("The saved exercise library is empty or too large");
  const ids = new Set();
  const names = new Set();
  for (const exercise of value) {
    if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)
      || Object.keys(exercise).some((key) => !["id", "name", "category", "equipment"].includes(key))
      || typeof exercise.id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(exercise.id)
      || ids.has(exercise.id.toLowerCase())
      || typeof exercise.name !== "string" || !exercise.name.trim() || exercise.name !== exercise.name.trim() || exercise.name.length > 120
      || /[\u0000-\u001f\u007f]/.test(exercise.name) || names.has(normalize(exercise.name))
      || [exercise.category, exercise.equipment].some((text) => text !== undefined && (typeof text !== "string" || text.length > 80))) throw new Error("Invalid saved exercise library");
    ids.add(exercise.id.toLowerCase());
    names.add(normalize(exercise.name));
  }
  return value;
}

export function exerciseCatalogProblems(week, catalog = []) {
  if (!catalog.length) return [];
  const allowed = new Set(catalog.map((item) => normalize(item.name)));
  const issues = [];
  for (const day of week.days ?? []) for (const exercise of day.exercises ?? []) {
    if (!allowed.has(normalize(exercise.name)) && !allowed.has(normalize(withoutGroupLabel(exercise.name)))) {
      issues.push(`Day ${day.number} includes an exercise outside the coach's saved library. Choose an exact library name or ask the coach to add the missing variation.`);
    }
  }
  return [...new Set(issues)];
}

export function exerciseCatalogContext(catalog = []) {
  return catalog.length ? `COACH'S SAVED EXERCISE LIBRARY (server-supplied data, own saved exercises first):\n${JSON.stringify(catalog)}\nChoose exact names from this library. Source templates are inspiration; they do not authorize inventing exercises or substituting an unavailable variation. Separate top/backdown groups may share one library name. If a required variation is missing, ask the coach to add it.\n` : "";
}
