const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16 };
const number = "(?:\\d{1,2}|" + Object.keys(words).join("|") + ")";
const value = (text) => words[text.toLowerCase()] ?? Number(text);
function negated(text, index) {
  const prefix = text.slice(Math.max(0, index - 70), index).split(/[.!?;\n]/).at(-1);
  return /\b(?:not|never|don['’]?t|do not|no need|needn['’]?t|previously|formerly|last year|used to)\b[^,]*$/i.test(prefix);
}

/** Explicit schedule requests override stale form defaults. Progression notes,
 * historical week labels and negated durations are not schedule requests.
 * Latest explicit request wins, so a correction after a pasted plan is honored.
 * @param {string} brief
 * @param {{startWeek:number,weekCount:number,daysPerWeek:number}} selected
 */
export function resolveRequestedScope(brief, selected) {
  const text = brief.normalize("NFKC").replace(/[–—]/g, "-");
  const requests = [];
  const duration = new RegExp(`\\b(?:for\\s+(?:just\\s+|only\\s+)?|just\\s+|only\\s+|a\\s+|an\\s+)(${number})\\s*[- ]?\\s*weeks?\\b|\\b(${number})\\s*[- ]?\\s*weeks?\\s+(?:block|draft|program|plan)\\b`, "gi");
  for (const match of text.matchAll(duration)) {
    if (negated(text, match.index)) continue;
    const count = value(match[1] ?? match[2]);
    if (count < 1 || count > 16) throw new Error("Request between 1 and 16 weeks per draft.");
    requests.push({ index: match.index, weekCount: count });
  }
  for (const match of text.matchAll(/\b(?:only|just|write|give(?:\s+me)?)\s+weeks?\s+(\d{1,2})\s*(?:-|to|through)\s*(\d{1,2})\b/gi)) {
    if (negated(text, match.index)) continue;
    const first = Number(match[1]), last = Number(match[2]);
    if (first < 1 || last < first || last > 52 || last - first >= 16) throw new Error("Use an ordered week range of at most 16 weeks, within weeks 1–52.");
    requests.push({ index: match.index, startWeek: first, weekCount: last - first + 1 });
  }
  const frequency = new RegExp(`\\b(${number})\\s*[- ]?\\s*(?:nonconsecutive\\s+)?(?:training\\s+)?days?\\s*(?:per\\s+week|a\\s+week|/\\s*week|weekly)\\b|\\b(?:every\\s*day|daily|seven[- ]day|7[- ]day)\\b`, "gi");
  const frequencies = [];
  for (const match of text.matchAll(frequency)) {
    if (negated(text, match.index)) continue;
    const days = match[1] ? value(match[1]) : 7;
    if (days < 1 || days > 7) throw new Error("Request between 1 and 7 scheduled days per week.");
    frequencies.push({ index: match.index, daysPerWeek: days });
  }
  const weeks = requests.sort((a, b) => a.index - b.index).at(-1);
  const days = frequencies.at(-1);
  const scope = { ...selected, ...(weeks ? { startWeek: weeks.startWeek ?? selected.startWeek, weekCount: weeks.weekCount } : {}), ...(days ? { daysPerWeek: days.daysPerWeek } : {}) };
  const changed = Object.keys(selected).some((key) => selected[key] !== scope[key]);
  return { scope, changed, explicit: Boolean(weeks || days) };
}
