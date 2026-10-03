/** Bounded parser for explicit rest clauses, not a general coaching-brief parser.
 * Supports named/group-qualified rest, unit-bearing durations, and bare Rest: 3
 * (minutes). The model's restIsExplicit flag is deliberately never consulted. */
const normalize = (text) => String(text ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const hasPhrase = (text, phrase) => (` ${normalize(text)} `).includes(` ${phrase} `);
const groupSuffix = /\s*(?:[—–-]\s*|\(\s*|\s+)(?:top\s+(?:set|single)|backdowns?|back[- ]?off(?:\s+sets?)?|technique|primary|secondary)\s*\)?\s*$/i;
const number = "(\\d+(?:\\.\\d+)?)(?:\\s*(?:[-–—]|to)\\s*(\\d+(?:\\.\\d+)?))?";
const unit = "(min(?:ute)?s?|sec(?:ond)?s?|m|s)";
const forward = new RegExp(`\\brest(?:\\s+time)?(?:\\s+(?:between\\s+(?:working\\s+)?sets|after\\s+(?:each\\s+)?sets?|for))?\\s*[:=]?\\s*(?:(?:is|should\\s+be|must\\s+be)\\s+)?(?:exactly\\s+)?${number}\\s*${unit}?(?![\\p{L}\\p{N}.])`, "giu");
const reverse = new RegExp(`\\b${number}\\s*${unit}\\s+(?:of\\s+)?rest\\b`, "giu");
const groups = [
  ["top single", /\btop\s+single\b/i, /\btop\s+single\b/i],
  ["top", /\btop\s+set\b/i, /\btop\s+(?:sets?|single)\b/i],
  ["backdown", /\b(?:backdowns?|back[- ]?off(?:\s+sets?)?)\b/i, /\b(?:backdowns?|back[- ]?off(?:\s+sets?)?)\b/i],
  ["technique", /\btechnique\b/i, /\btechnique\b/i],
  ["primary", /\bprimary\b/i, /\bprimary\b/i],
  ["secondary", /\bsecondary\b/i, /\bsecondary\b/i],
];

function duration(match) {
  const factor = !match[3] || /^m/i.test(match[3]) ? 60 : 1;
  const min = Number(match[1]) * factor;
  const max = Number(match[2] ?? match[1]) * factor;
  if (![min, max].every((seconds) => Number.isInteger(seconds) && seconds >= 15 && seconds <= 600) || min > max) {
    throw new Error("An explicit rest duration must be 15–600 whole seconds, with an ordered range.");
  }
  return { restSeconds: Math.round((min + max) / 2), ...(min !== max ? { restRangeSeconds: { min, max } } : {}) };
}

function segments(brief) {
  // Sentence periods split clauses; decimal duration periods remain intact.
  const pieces = brief.split(/;|\r?\n|(?<!\d)\.|\.(?!\d)/u);
  const result = [];
  for (let index = 0; index < pieces.length; index++) {
    let text = pieces[index].trim();
    // A labeled multiline rest value belongs to its preceding label.
    if (/\brest(?:\s+time)?(?:\s+between\s+(?:working\s+)?sets)?\s*[:=]?\s*$/i.test(text)
      && /^\s*\d+(?:\.\d+)?(?:\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?|m|s)?\s*$/i.test(pieces[index + 1] ?? "")) {
      text += ` ${pieces[++index].trim()}`;
    }
    result.push(text);
  }
  return result;
}

function selector(text, week) {
  const normalized = normalize(text);
  const bases = [...new Set((week.days ?? []).flatMap((day) => (day.exercises ?? []).map((exercise) => normalize(String(exercise.name ?? "").replace(groupSuffix, "")))))];
  const exact = bases.filter((name) => name && hasPhrase(normalized, name));
  // Longer names disambiguate a concrete variant from its basic lift name.
  const names = exact.filter((name) => !exact.some((other) => other !== name && hasPhrase(other, name)));
  const families = names.length ? [] : ["bench", "squat", "deadlift"].filter((name) => new RegExp(`\\b${name}(?:ing|s|ting)?\\b`, "i").test(normalized));
  const group = groups.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const dayMatch = /\bday\s*#?\s*(\d+)\b/i.exec(text);
  const weekMatch = /\bweek\s*#?\s*(\d+)\b/i.exec(text);
  return {
    names, families, groups: group, dayNumber: dayMatch ? Number(dayMatch[1]) : undefined,
    weekNumber: weekMatch ? Number(weekMatch[1]) : undefined,
    qualified: names.length > 0 || families.length > 0 || group.length > 0 || !!dayMatch || !!weekMatch,
  };
}

function targetMatches(target, day, exercise, week) {
  if ((target.dayNumber !== undefined && target.dayNumber !== day.number) || (target.weekNumber !== undefined && target.weekNumber !== week.number)) return false;
  const name = normalize(String(exercise.name ?? "").replace(groupSuffix, ""));
  if (target.names.length && !target.names.includes(name)) return false;
  if (target.families.length && !target.families.some((family) => new RegExp(`\\b${family}\\b`, "i").test(name))) return false;
  const groupText = `${exercise.name ?? ""} ${exercise.notes ?? ""}`;
  if (target.groups.length && !target.groups.every((label) => groups.find(([group]) => group === label)[2].test(groupText))) return false;
  return true;
}

function specificity(target) {
  return (target.names.length ? 8 : target.families.length ? 4 : 0) + target.groups.length * 2
    + Number(target.dayNumber !== undefined) + Number(target.weekNumber !== undefined);
}

function prescriptions(brief, week) {
  const result = [];
  let heading;
  for (const segment of segments(brief)) {
    if (!segment) { heading = undefined; continue; }
    const matches = [...segment.matchAll(forward), ...segment.matchAll(reverse)].sort((a, b) => a.index - b.index);
    if (!matches.length) {
      // A standalone exercise/day heading can qualify its following Rest line.
      const candidate = selector(segment, week);
      const headingText = normalize(segment);
      const namedHeading = candidate.names.includes(headingText)
        || candidate.families.some((family) => headingText === family || headingText === `${family} press`)
        || /^(?:top (?:single|set)|backdowns?|back off(?: sets?)?|technique|primary|secondary|day \d+|week \d+)$/i.test(headingText);
      if (candidate.qualified && namedHeading) heading = candidate;
      continue;
    }
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      const start = index ? matches[index - 1].index + matches[index - 1][0].length : 0;
      const prefix = segment.slice(start, match.index).split(",").map((piece) => piece.trim()).filter(Boolean).at(-1) ?? "";
      // Post-duration targets need an explicit relation; later unrelated
      // exercise names in the sentence must not attach to this rest value.
      const tail = segment.slice(match.index + match[0].length, index + 1 < matches.length ? matches[index + 1].index : segment.length);
      const suffix = /^\s*(?:for|on|after)\b/i.test(tail) ? tail.split(",")[0] : "";
      if (/\b(?:do\s+not|don['’]?t|never)\s+(?:change|replace|set|use|add|prescribe)\b/i.test(`${prefix} ${suffix}`)
        || /\b(?:not|no)\s*$/i.test(prefix)) continue;
      const before = selector(prefix, week), after = selector(suffix, week);
      let target = before.qualified ? before : after.qualified ? after : heading;
      if (before.qualified && after.qualified && JSON.stringify(before) !== JSON.stringify(after)) {
        throw new Error("An explicit rest clause has conflicting exercise/group targets; clarify it before generating.");
      }
      // Unsupported explicit post-duration exercise names are not global rest.
      if (!target && suffix && !/\b(?:all|every|each)\s+(?:exercise|set|working\s+set)s?\b/i.test(suffix)) continue;
      target ??= { names: [], families: [], groups: [], qualified: false };
      result.push({ target, ...duration(match) });
      if (result.length > 64) throw new Error("The brief contains too many explicit rest clauses.");
    }
  }
  return result;
}

/** Return one association per exercise. Missing rest remains undefined; callers
 * can apply their chosen high-RPE default. Conflicting equally specific written
 * prescriptions fail instead of trusting a model provenance flag or guessing. */
export function resolveBriefRestPrescriptions(brief, week) {
  if (typeof brief !== "string" || brief.length > 6000) throw new Error("The rest brief must be at most 6,000 characters.");
  const rules = prescriptions(brief, week);
  const result = [];
  for (const day of week.days ?? []) for (const [exerciseIndex, exercise] of (day.exercises ?? []).entries()) {
    const applicable = rules.filter((rule) => targetMatches(rule.target, day, exercise, week));
    const best = applicable.filter((rule) => specificity(rule.target) === Math.max(...applicable.map((item) => specificity(item.target))));
    const identities = new Set(best.map(({ restSeconds, restRangeSeconds }) => JSON.stringify({ restSeconds, restRangeSeconds })));
    if (identities.size > 1) throw new Error("The brief gives conflicting rest durations for an exercise; clarify it before generating.");
    const prescription = best[0];
    result.push({ dayNumber: day.number, exerciseIndex, restSeconds: prescription?.restSeconds,
      ...(prescription?.restRangeSeconds ? { restRangeSeconds: prescription.restRangeSeconds } : {}) });
  }
  return result;
}
