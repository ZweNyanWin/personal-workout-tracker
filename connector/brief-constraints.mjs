const numberWord = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const count = "([1-7]|one|two|three|four|five|six|seven)";
const bench = "bench(?:ing|\\s+press(?:ing)?)?";
const perWeek = "(?:per|each|a)\\s+week|/\\s*week";

function benchFrequency(brief) {
  const patterns = [
    new RegExp(`\\b${count}\\s+(?:days?\\s+of\\s+${bench}|${bench}\\s+days?)\\s*(?:${perWeek})\\b`, "gi"),
    new RegExp(`\\b${bench}\\s+${count}\\s+(?:days?|times?)\\s*(?:${perWeek})\\b`, "gi"),
  ];
  const values = patterns.flatMap((pattern) => [...brief.matchAll(pattern)]
    .map((match) => numberWord[match[1].toLowerCase()] ?? Number(match[1])));
  return values.length && new Set(values).size === 1 ? values[0] : undefined;
}

/** Extract only a narrow set of explicit, checkable coach constraints. */
export function extractBriefConstraints(brief) {
  const normalized = String(brief ?? "").replace(/\s+/g, " ");
  const benchDaysPerWeek = benchFrequency(normalized);
  const constraints = {};
  if (benchDaysPerWeek !== undefined) constraints.benchDaysPerWeek = benchDaysPerWeek;
  if (/\bbullmastiff\b/i.test(normalized)) constraints.namedStyle = "Bullmastiff";

  if (benchDaysPerWeek !== 3) return constraints;
  const thirdExposure = /\b(?:3rd|third)\s+(?:bench\s+)?day\b/i.exec(normalized);
  const scheduledDay = /\bday\s*3\b/i.exec(normalized);
  const anchor = thirdExposure ?? scheduledDay;
  if (!anchor) return constraints;
  const segment = normalized.slice(anchor.index, anchor.index + 300);
  const rpe = /\bRPE\s*5(?:\.0)?\s*(?:-|–|to)\s*6(?:\.0)?\b/i.test(segment);
  const afterSquat = /\bafter\s+(?:the\s+)?(?:main\s+)?squat(?:\s+session)?\b/i.test(segment);
  const maxSets = /\b(?:3|three)\s+sets?\s+(?:must\s+be\s+)?(?:the\s+)?max\b|\b(?:max(?:imum)?|no\s+more\s+than|at\s+most|up\s+to)\s+(?:of\s+)?(?:3|three)\s+sets?\b/i.test(segment);
  const reps = /\b(?:3|three)\s*(?:-|–|to)\s*(?:6|six)\s+reps?\b|\b(?:3|three)\s+sets?\s+of\s+(?:3|three)\s*(?:-|–|to)\s*(?:6|six)\b/i.test(segment);
  const technique = /\b(?:practice\s+(?:the\s+)?technique|technique\s+(?:only|practice|work|day))\b/i.test(segment);
  if (rpe && afterSquat && maxSets && reps && technique) {
    constraints.techniqueBench = {
      ...(thirdExposure ? { exposureOrdinal: 3 } : { scheduledDayNumber: 3 }),
      afterSquat: true,
      maxSets: 3,
      reps: { min: 3, max: 6 },
      rpe: { min: 5, max: 6 },
    };
  }
  return constraints;
}

const isBench = (name) => {
  const label = name ?? "";
  if (/\b(?:larsen|spoto)\s+press\b/i.test(label)) return true;
  return /\bbench\b/i.test(label) && !/\b(?:rows?|flies|fly|dips?|pullovers?|supported?)\b/i.test(label);
};
const isSquat = (name) => /\bsquats?\b/i.test(name ?? "");

function isMainSquatBeforeBench(exercises, firstBenchIndex) {
  const squatGroups = exercises.map((exercise, index) => ({ exercise, name: exercise.name ?? "", index }))
    .filter(({ name }) => isSquat(name));
  const excludesMain = ({ exercise, name }) => /\b(?:warm[- ]?up|body[- ]?weight)\b/i.test(name)
    || /\b(?:warm[- ]?up(?: only)?|body[- ]?weight|unloaded|empty bar|air squat|mobility only)\b/i
      .test(`${exercise.loadOrAssistance ?? ""} ${exercise.notes ?? ""}`);
  const markedMain = squatGroups.filter((group) => /\bmain\b/i.test(group.name) && !excludesMain(group));
  if (markedMain.length) return markedMain.some(({ index }) => index < firstBenchIndex);
  return squatGroups.some((group) => group.index < firstBenchIndex
    && !excludesMain(group)
    && (() => {
      const { name } = group;
      return !/\b(?:air|goblet|split|front|paused?|tempo|pin|box|hack|belt|zercher)\b/i.test(name)
        && (/^\s*squats?\s*$/i.test(name) || /\b(?:high[- ]?bar|low[- ]?bar|back|barbell)\s+squats?\b/i.test(name));
    })());
}

function rpeBounds(effort) {
  const matches = [...String(effort ?? "").matchAll(/\bRPE\s*(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?/gi)];
  if (!matches.length) return null;
  const values = matches.flatMap((match) => [Number(match[1]), Number(match[2] ?? match[1])]);
  return [Math.min(...values), Math.max(...values)];
}

function techniqueDay(benchDays, technique) {
  if (technique.scheduledDayNumber) return benchDays.find((day) => day.number === technique.scheduledDayNumber);
  const ranked = benchDays.map((day) => {
    const benchGroups = day.exercises.filter((exercise) => isBench(exercise.name));
    const effortMatch = benchGroups.some((exercise) => {
      const rpe = rpeBounds(exercise.effort);
      return rpe && rpe[0] >= technique.rpe.min && rpe[1] <= technique.rpe.max;
    });
    const techniqueLabel = /\btechnique\b/i.test(day.title ?? "") || benchGroups.some((exercise) => /\btechnique\b/i.test(exercise.name));
    return { day, score: Number(effortMatch) * 3 + Number(techniqueLabel) * 2 + Number(day.exercises.some((exercise) => isSquat(exercise.name))) };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].day : null;
}

/** Check a generated week against explicit bench constraints, not inferred style. */
export function briefConstraintProblems(week, constraints = {}) {
  if (!constraints.benchDaysPerWeek && !constraints.techniqueBench) return [];
  const days = [...(week?.days ?? [])].sort((a, b) => a.number - b.number);
  const benchDays = days.filter((day) => day.exercises?.some((exercise) => isBench(exercise.name)));
  const issues = [];
  if (constraints.benchDaysPerWeek && benchDays.length !== constraints.benchDaysPerWeek) {
    issues.push(`The coach requested bench training on ${constraints.benchDaysPerWeek} distinct days this week; found ${benchDays.length}. Push-ups and other substitutions do not count as bench training.`);
  }
  const technique = constraints.techniqueBench;
  if (!technique) return issues;
  const day = techniqueDay(benchDays, technique);
  if (!day) {
    issues.push("The coach's additional technique bench exposure after the main squat is missing.");
    return issues;
  }
  const benchGroups = day.exercises.filter((exercise) => isBench(exercise.name));
  if (!benchGroups.length) {
    issues.push(`Day ${day.number} is missing its technique bench group.`);
    return issues;
  }
  if (technique.afterSquat && !isMainSquatBeforeBench(day.exercises, day.exercises.indexOf(benchGroups[0]))) {
    issues.push(`Day ${day.number} needs the main squat before its technique bench work.`);
  }
  const totalSets = benchGroups.reduce((sum, exercise) => sum + (Number.isFinite(exercise.sets) ? exercise.sets : 0), 0);
  if (totalSets > technique.maxSets) issues.push(`Day ${day.number} technique bench must total at most ${technique.maxSets} sets across all bench groups.`);
  for (const exercise of benchGroups) {
    const range = exercise.dose?.kind === "reps" ? exercise.dose.range : null;
    if (!range || range.min < technique.reps.min || range.max > technique.reps.max) {
      issues.push(`Day ${day.number} technique bench reps must stay within ${technique.reps.min}–${technique.reps.max} per set.`);
    }
    const rpe = rpeBounds(exercise.effort);
    if (!rpe || rpe[0] < technique.rpe.min || rpe[1] > technique.rpe.max) {
      issues.push(`Day ${day.number} technique bench must stay at RPE ${technique.rpe.min}–${technique.rpe.max}.`);
    }
  }
  return [...new Set(issues)];
}

const normalizedName = (name) => String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
const loadUnit = (text) => {
  const kg = /\b(?:kg|kgs|kilograms?)\b/i.test(text ?? "");
  const lb = /\b(?:lb|lbs|pounds?)\b/i.test(text ?? "");
  return kg === lb ? null : kg ? "kg" : "lb";
};

function affirmativeText(brief) {
  return brief.replace(/\b(?:do\s+not|don't|never|without|no)\s+(?:change|changes|changing|adjust|edit|modify|revise|update|increase|decrease|add|remove|replace|swap|convert|conversion|switch|set|use|choose)\b.{0,80}?(?=[,.;]|\bbut\b|$)/gi, " ");
}

function strictPreservationRequested(brief) {
  const exact = /\b(?:keep|leave|preserve|retain)\b.{0,55}\b(?:unchanged|the\s+same|exact(?:ly)?|as\s+is|prescriptions?)\b|\b(?:keep|preserve|retain)\b.{0,55}\bsource\s+prescriptions?\b/i.test(brief);
  const changes = /\b(?:change|adjust|edit|modify|revise|update|progress|increase|decrease|add|remove|replace|swap|convert|alter)\b/i.test(affirmativeText(brief));
  return exact && !changes;
}

const broadRewriteRequested = (brief) => /\b(?:rewrite|redesign|rebuild|overhaul|replace)\b.{0,40}\b(?:entire|whole|all)\b.{0,35}\b(?:program|plan|block|week|draft)\b/i.test(affirmativeText(brief));
const rawFragments = (brief) => affirmativeText(String(brief ?? "")).split(/[,;\n]|\.(?=\s|$)|\bbut\b/i).map((part) => part.trim()).filter(Boolean);
const fragments = (brief) => rawFragments(brief).map(normalizedName);
const wordSet = (value) => new Set(normalizedName(value).split(/\s+/).filter(Boolean));
const significantNameWords = (name) => [...wordSet(name)].filter((word) => !new Set([
  "a", "an", "the", "main", "barbell", "dumbbell", "exercise", "movement", "variation", "lift", "top", "backdown", "backdowns", "set", "sets", "single", "day",
]).has(word));
const containsPhrase = (haystack, phrase) => ` ${haystack} `.includes(` ${phrase} `);

function namedChangeFragment(brief, name, verbs) {
  const needle = normalizedName(name);
  if (!needle) return null;
  return fragments(brief).find((fragment) => {
    const index = fragment.indexOf(needle);
    if (index < 0 || !containsPhrase(fragment, needle)) return false;
    return verbs.test(fragment.slice(Math.max(0, index - 65), index));
  }) ?? null;
}

function replacementAllowed(brief, source, next, sourceExercises) {
  if (sourceExercises.filter((item) => normalizedName(item.name) === normalizedName(source.name)).length !== 1) return false;
  const fragment = namedChangeFragment(brief, source.name, /\b(?:replace|swap|substitute)\b/);
  if (!fragment) return false;
  const after = fragment.slice(fragment.indexOf(normalizedName(source.name)) + normalizedName(source.name).length);
  const target = /\b(?:with|for)\b\s+(.+)/.exec(after)?.[1];
  if (!target) return false;
  return exactEditTarget(target, next.name);
}

// A shared word such as "row", "leg" or "curl" is not an exercise identity.
// Allow a precisely named movement followed by a prescription, not a different variant.
function exactEditTarget(target, name) {
  const expected = normalizedName(name);
  const requested = normalizedName(target).replace(/^(?:a|an|the)\s+/, "");
  if (!expected || !requested.startsWith(expected)) return false;
  const trailing = requested.slice(expected.length).trim();
  return !trailing || /^(?:(?:for|at|with|using|to)\s+(?:\d|rpe\b|sets?\b|reps?\b|rest\b)|(?:on|in)\s+(?:day|week)\s+\d\b|(?:after|before)\b|sets?\b|reps?\b|rpe\b|rest\b|\d)/.test(trailing);
}

function removalAllowed(brief, source, sourceExercises) {
  if (sourceExercises.filter((item) => normalizedName(item.name) === normalizedName(source.name)).length !== 1) return false;
  return Boolean(namedChangeFragment(brief, source.name, /\b(?:remove|drop|omit)\b/));
}

function additionAllowed(brief, next) {
  return fragments(brief).some((fragment) => {
    const match = /\b(?:add|include|insert)\b\s+(.+)/.exec(fragment);
    if (!match) return false;
    return exactEditTarget(match[1], next.name);
  });
}

function alignsWithPreciseEdits(sourceExercises, nextExercises, brief) {
  const memo = new Map();
  function aligns(sourceIndex, nextIndex) {
    if (sourceIndex === sourceExercises.length && nextIndex === nextExercises.length) return true;
    const key = `${sourceIndex}:${nextIndex}`;
    if (memo.has(key)) return memo.get(key);
    const source = sourceExercises[sourceIndex], next = nextExercises[nextIndex];
    const valid = Boolean((source && next && normalizedName(source.name) === normalizedName(next.name)
      && aligns(sourceIndex + 1, nextIndex + 1))
      || (source && next && replacementAllowed(brief, source, next, sourceExercises)
        && aligns(sourceIndex + 1, nextIndex + 1))
      || (source && removalAllowed(brief, source, sourceExercises) && aligns(sourceIndex + 1, nextIndex))
      || (next && additionAllowed(brief, next) && aligns(sourceIndex, nextIndex + 1)));
    memo.set(key, valid);
    return valid;
  }
  return aligns(0, 0);
}

/** Check exercise identity and order before names are frozen into a day schema. */
export function sourceTopologyProblems(outlineWeek, sourceWeek, brief = "") {
  if (!sourceWeek || broadRewriteRequested(brief)) return [];
  const sourceDays = sourceWeek.days ?? [], nextDays = outlineWeek?.days ?? [];
  const issues = [];
  if (sourceDays.length !== nextDays.length || sourceDays.some((day, index) => day.number !== nextDays[index]?.number)) {
    issues.push("The existing training days or their order changed without a whole-week rewrite request.");
  }
  const strict = strictPreservationRequested(String(brief ?? ""));
  for (const sourceDay of sourceDays) {
    const nextDay = nextDays.find((day) => day.number === sourceDay.number);
    if (!nextDay) continue;
    const original = sourceDay.exercises ?? [], proposed = nextDay.exercises ?? [];
    if (strict) {
      if (original.length !== proposed.length) issues.push(`Day ${sourceDay.number} changed its exercise-group count despite the exact-preservation request.`);
      for (const [index, source] of original.entries()) {
        if (source.name !== proposed[index]?.name) issues.push(`Day ${sourceDay.number}, group ${index + 1} changed name despite the exact-preservation request.`);
      }
    } else if (!alignsWithPreciseEdits(original, proposed, brief)) {
      issues.push(`Day ${sourceDay.number} changed exercise names or order, or has a missing source exercise variation, without a precise coach edit. Specify the exercise to replace, add, or remove.`);
    }
  }
  return [...new Set(issues)].slice(0, 12);
}

const EDIT_ACTION = /\b(?:change|adjust|edit|modify|revise|update|set|use|choose|increase|decrease|reduce|lower|raise|progress|convert|switch|give|specify|prescribe|make)\b/;
const FIELD_WORDS = {
  sets: /\b(?:sets?|volume)\b|\b\d+\s*[x×]\s*\d+\b/,
  dose: /\b(?:reps?|repetitions?|dose|holds?|seconds?)\b|\b\d+\s*[x×]\s*\d+\b|\bsets?\s+of\s+\d+\b/,
  loadOrAssistance: /\b(?:loads?|weights?|assistance|kgs?|kilograms?|lbs?|pounds?|percent(?:age)?s?)\b/,
  effort: /\b(?:rpe|rir|effort|intensity)\b/,
  restSeconds: /\brest\b/,
};

function fieldEditFragments(field, source, sourceExercises, brief) {
  const names = sourceExercises.map((item) => significantNameWords(item.name));
  return rawFragments(brief).filter((raw) => {
    const fragment = normalizedName(raw);
    if (!FIELD_WORDS[field].test(fragment) || !(EDIT_ACTION.test(fragment)
      || (field === "restSeconds" && /\brest\b.{0,35}\b\d+(?:\.\d+)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?)\b/i.test(fragment)))) return false;
    const words = wordSet(fragment);
    const scores = names.map((tokens) => tokens.filter((token) => words.has(token)).length);
    const highest = Math.max(0, ...scores);
    if (highest === 0) return true; // An explicit field-wide edit, such as "change rest to 3 min".
    const index = sourceExercises.indexOf(source);
    return scores[index] === highest && (scores.filter((score) => score === highest).length === 1 || /\b(?:all|every|each)\b/.test(fragment));
  });
}

function fieldChangeAllowed(field, source, sourceExercises, brief) {
  return fieldEditFragments(field, source, sourceExercises, brief).length > 0;
}

const numeric = "(\\d+(?:\\.\\d+)?)";
const massUnit = "(kg|kgs|kilograms?|lb|lbs|pounds?)";
const lastMatch = (text, expression) => [...text.matchAll(expression)].at(-1);
const scalar = (text, expression) => {
  const match = lastMatch(text, expression);
  if (!match || /^\s*(?:[-–/]|to\b|or\b)\s*\d/i.test(text.slice(match.index + match[0].length))) return null;
  return Number(match[1]);
};
const massValue = (text) => {
  const match = new RegExp(`\\b${numeric}\\s*${massUnit}\\b`, "i").exec(text ?? "");
  return match ? { amount: Number(match[1]), unit: /^k/i.test(match[2]) ? "kg" : "lb" } : null;
};

/** Only unambiguous numerical target edits are checked; vague changes still need review. */
function requestedFieldValue(field, fragment) {
  if (/\b(?:or|maybe|perhaps|depending|optionally|between)\b/i.test(fragment)) return null;
  const pair = /\b(\d+)\s*[x×]\s*(\d+)\b/i.exec(fragment);
  if (field === "sets" || field === "dose") {
    if (pair) return { amount: Number(pair[field === "sets" ? 1 : 2]) };
    const label = field === "sets" ? "sets?" : "(?:reps?|repetitions?)";
    const fromTo = scalar(fragment, new RegExp(`\\b${label}\\s+from\\s+\\d+(?:\\.\\d+)?\\s+to\\s+${numeric}\\b`, "gi"));
    const after = fromTo ?? scalar(fragment, new RegExp(`\\b${label}\\s*(?:to|at|=|:)?\\s*${numeric}\\b`, "gi"));
    const before = scalar(fragment, new RegExp(`\\b${numeric}\\s+${label}\\b`, "gi"));
    const setsOf = field === "dose" ? scalar(fragment, new RegExp(`\\bsets?\\s+of\\s+${numeric}\\b`, "gi")) : null;
    const amount = after ?? before ?? setsOf;
    return amount === null ? null : { amount };
  }
  if (field === "effort") {
    const fromTo = scalar(fragment, new RegExp(`\\bRPE\\s+from\\s+\\d+(?:\\.\\d+)?\\s+to\\s+${numeric}\\b`, "gi"));
    const amount = fromTo ?? scalar(fragment, new RegExp(`\\bRPE\\s*(?:to|at|:|=)?\\s*${numeric}\\b`, "gi"));
    return amount === null ? null : { amount };
  }
  if (field === "restSeconds") {
    const matches = [...fragment.matchAll(new RegExp(`\\b${numeric}\\s*(min(?:ute)?s?|sec(?:ond)?s?)\\b`, "gi"))];
    const match = matches.at(-1);
    if (match && !/^\s*(?:[-–/]|to\b|or\b)\s*\d/i.test(fragment.slice(match.index + match[0].length))) {
      // A duration following "by" is a delta, not an absolute target.
      if (/\bby\s*$/i.test(fragment.slice(0, match.index))) return null;
      if (/\d\s*(?:[-–]|to)\s*$/i.test(fragment.slice(0, match.index)) && !/\bfrom\b/i.test(fragment)) return null;
      return { amount: Number(match[1]) * (/^min/i.test(match[2]) ? 60 : 1) };
    }
    const amount = scalar(fragment, new RegExp(`\\brest\\s*(?:to|at|=|:)?\\s*${numeric}\\b`, "gi"));
    return amount === null ? null : { amount: amount * 60 };
  }
  if (field === "loadOrAssistance") {
    const convert = /\bconvert\b/i.test(fragment) && new RegExp(`\\bto\\s+${massUnit}\\b`, "i").exec(fragment);
    if (convert) return { conversionUnit: /^k/i.test(convert[1]) ? "kg" : "lb" };
    const match = lastMatch(fragment, new RegExp(`\\b${numeric}\\s*${massUnit}\\b`, "gi"));
    if (match && !/\bby\s*$/i.test(fragment.slice(0, match.index))) return { amount: Number(match[1]), unit: /^k/i.test(match[2]) ? "kg" : "lb" };
    const percent = lastMatch(fragment, new RegExp(`\\b${numeric}\\s*%`, "g"));
    return percent && !/\bby\s*$/i.test(fragment.slice(0, percent.index)) ? { amount: Number(percent[1]), unit: "%" } : null;
  }
  return null;
}

function requestedValueProblems(field, source, next, sourceExercises, brief) {
  const targets = fieldEditFragments(field, source, sourceExercises, brief)
    .map((fragment) => requestedFieldValue(field, fragment)).filter(Boolean);
  if (!targets.length || new Set(targets.map((target) => JSON.stringify(target))).size !== 1) return [];
  const target = targets[0];
  let matches = false;
  if (field === "sets" || field === "restSeconds") matches = next[field] === target.amount;
  if (field === "dose") matches = next.dose?.kind === "reps" && next.dose.range?.min === target.amount && next.dose.range?.max === target.amount;
  if (field === "effort") {
    const values = [...String(next.effort ?? "").matchAll(/\bRPE\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*(?:[-–/]|to|or)\s*(\d+(?:\.\d+)?))?/gi)];
    matches = values.length === 1 && Number(values[0][1]) === target.amount && !values[0][2];
  }
  if (field === "loadOrAssistance") {
    const actual = massValue(next.loadOrAssistance);
    if (target.conversionUnit) {
      const prior = massValue(source.loadOrAssistance);
      const expected = prior && prior.amount * (prior.unit === target.conversionUnit ? 1 : target.conversionUnit === "kg" ? 0.45359237 : 1 / 0.45359237);
      matches = Boolean(actual && actual.unit === target.conversionUnit && (!prior || Math.abs(actual.amount - expected) <= Math.max(0.5, expected * 0.005)));
    } else if (target.unit === "%") {
      const actualPercent = /\b(\d+(?:\.\d+)?)\s*%/.exec(next.loadOrAssistance ?? "");
      matches = Boolean(actualPercent && Number(actualPercent[1]) === target.amount);
    } else matches = Boolean(actual && actual.amount === target.amount && actual.unit === target.unit);
  }
  return matches ? [] : [`The requested ${field} target for "${source.name}" was not followed. Preserve the coach's explicit numerical target.`];
}

function comparedDose(dose) {
  if (dose?.kind === "reps") return JSON.stringify({ kind: "reps", min: dose.range?.min, max: dose.range?.max, perSide: dose.perSide });
  if (dose?.kind === "hold") return JSON.stringify({ kind: "hold", min: dose.seconds?.min, max: dose.seconds?.max });
  return JSON.stringify(dose);
}

/** Preserve each source field unless the coach specifically requested its change. */
export function sourcePreservationProblems(week, sourceWeek, brief = "") {
  if (!sourceWeek) return [];
  const instruction = String(brief ?? "");
  const strict = strictPreservationRequested(instruction);
  if (broadRewriteRequested(instruction)) return [];
  const issues = sourceTopologyProblems(week, sourceWeek, instruction);
  const sourceDays = sourceWeek.days ?? [];
  const nextDays = week?.days ?? [];
  for (const sourceDay of sourceDays) {
    const nextDay = nextDays.find((day) => day.number === sourceDay.number);
    if (!nextDay) continue;
    const sourceExercises = sourceDay.exercises ?? [];
    const nextExercises = nextDay.exercises ?? [];
    const matched = new Set();
    for (const [index, source] of sourceExercises.entries()) {
      const sameNameIndex = nextExercises.findIndex((candidate, candidateIndex) =>
        !matched.has(candidateIndex) && normalizedName(candidate.name) === normalizedName(source.name));
      const sameName = sameNameIndex >= 0 ? nextExercises[sameNameIndex] : null;
      if (sameName) matched.add(sameNameIndex);
      if (!sameName && removalAllowed(instruction, source, sourceExercises)) continue;
      const next = sameName ?? nextExercises[index];
      if (!next) continue;
      if (!sameName && replacementAllowed(instruction, source, next, sourceExercises)) continue;
      for (const field of ["sets", "dose", "loadOrAssistance", "effort", "restSeconds"]) {
        if (!strict) issues.push(...requestedValueProblems(field, source, next, sourceExercises, instruction));
        const before = field === "dose" ? comparedDose(source.dose) : source[field];
        const after = field === "dose" ? comparedDose(next.dose) : next[field];
        if (before === after || (!strict && fieldChangeAllowed(field, source, sourceExercises, instruction))) continue;
        if (field === "restSeconds") {
          issues.push(strict
            ? `Day ${sourceDay.number}, group ${index + 1} changed restSeconds despite the exact-preservation request.`
            : `Day ${sourceDay.number} changed "${source.name}" rest from ${source.restSeconds / 60} to ${next.restSeconds / 60} min without a coach request.`);
          continue;
        }
        if (field === "loadOrAssistance") {
          const beforeUnit = loadUnit(source.loadOrAssistance), afterUnit = loadUnit(next.loadOrAssistance);
          if (beforeUnit && afterUnit && beforeUnit !== afterUnit) {
            issues.push(`Day ${sourceDay.number} changed "${source.name}" load units from ${beforeUnit} to ${afterUnit} without a conversion request.`);
            continue;
          }
        }
        issues.push(`Day ${sourceDay.number}, group ${index + 1} changed ${field} without a precise coach request.`);
      }
    }
  }
  return [...new Set(issues)].slice(0, 12);
}
