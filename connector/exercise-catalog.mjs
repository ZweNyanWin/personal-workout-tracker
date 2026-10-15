const normalize = (name) => String(name ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const groupLabel = "(?:top\\s+(?:set|single)|backdowns?|back[- ]?off(?:\\s+sets?)?|technique|primary|secondary)";
const groupSuffix = new RegExp(`\\s*(?:[—–-]\\s*${groupLabel}|\\(\\s*${groupLabel}\\s*\\)|\\s+${groupLabel})\\s*$`, "i");
const withoutGroupLabel = (name) => String(name ?? "").replace(groupSuffix, "").trim();
import { trainingWeekProblems } from "../lib/coach/training-constraints.mjs";

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

export function exerciseCatalogProblems(week, catalog = [], constraints) {
  const allowed = new Set(catalog.map((item) => normalize(item.name)));
  const issues = constraints ? trainingWeekProblems(week, constraints, catalog) : [];
  for (const day of week.days ?? []) for (const exercise of day.exercises ?? []) {
    if (catalog.length && !allowed.has(normalize(exercise.name)) && !allowed.has(normalize(withoutGroupLabel(exercise.name)))) {
      issues.push(`Day ${day.number} includes an exercise outside the permitted draft list. Choose an exact saved or explicitly written source name, or ask the coach to add the missing variation.`);
    }
  }
  return [...new Set(issues)];
}

export function exerciseCatalogContext(catalog = [], { compact = false } = {}) {
  const entries = compact ? catalog.map(({ name, equipment }) => ({ name, equipment })) : catalog;
  return catalog.length ? `PERMITTED DRAFT EXERCISES (server-supplied saved entries and any explicitly written coach source names):\n${JSON.stringify(entries)}\nChoose exact names from this list. A source name permits formatting the coach's prescription; it does not mean the exercise was saved, approved, available or completed. Retrieved templates do not authorize new names or substitutions. Separate top/backdown groups may share one name. If a required variation is missing, ask the coach to add it.\n` : "";
}
