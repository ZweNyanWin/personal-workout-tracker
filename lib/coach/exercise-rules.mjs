/** Conservative barbell main-lift classification; accessories keep flexible ranges. */
export function isMainCompound(name) {
  const label = String(name ?? "").trim();
  if (!label) return false;
  if (/\b(?:body[- ]?weight|air|goblet|split|bulgarian|pistol|cossack|sissy|jump|dumbbell|kettlebell|smith|machine|cable|banded|trap[- ]?bar|single[- ]?leg)\b/i.test(label)) return false;
  if (/\b(?:rows?|flies|fly|dips?|pullover|supported?)\b/i.test(label)) return false;

  if (/\bdeadlifts?\b/i.test(label)) {
    return !/\b(?:romanian|rdl|stiff[- ]?leg|hip[- ]?hinge)\b/i.test(label);
  }
  if (/\bsquats?\b/i.test(label)) {
    return !/\b(?:hack|belt)\b/i.test(label);
  }
  return /\bbench\b/i.test(label) || /\b(?:larsen|spoto|overhead|military|strict)\s+press\b/i.test(label);
}

/** Recognize explicit holds and ordinary dynamic strength movements. Unknown
 * custom names remain reviewable; this is not a universal exercise taxonomy. */
export function expectedDoseKind(name) {
  const label = String(name ?? "");
  if (/\b(?:isometric|holds?|static)\b/i.test(label)) return "hold";
  if (/\b(?:press(?:es)?|rows?|curls?|flies|fly|raises?|squats?|deadlifts?|lunges?|dips?|extensions?|kickbacks?|crunch(?:es)?|taps?|push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|sit[- ]?ups?|good[- ]?mornings?)\b/i.test(label)) return "reps";
  if (/\b(?:plank|wall[- ]?sit|l[- ]?sit|front[- ]?lever|back[- ]?lever|planche|handstand|hollow[- ]?body|dead[- ]?hang)\b/i.test(label)) return "hold";
  return null;
}

export function exerciseDoseProblems(exercise) {
  const expected = expectedDoseKind(exercise?.name);
  return expected && exercise.dose?.kind !== expected
    ? [`${exercise.name} needs ${expected === "reps" ? "repetitions" : "a timed hold in seconds"}; check the exercise variation and dose.`] : [];
}

/** Extract an editable scalar RPE; ranges and vague efforts remain unresolved. */
export function mainRpeValue(effort) {
  const text = String(effort ?? "");
  const values = [...text.matchAll(/\bRPE\s*[:=]?\s*(\d+(?:\.\d+)?)/gi)];
  if (values.length !== 1) return null;
  const match = values[0];
  if (/^\s*(?:[-–/]|to\b|or\b)\s*\d/i.test(text.slice(match.index + match[0].length))) return null;
  const value = Number(match[1]);
  return value >= 5 && value <= 10 && Number.isInteger(value * 2) ? value : null;
}

function bodyweightOnly(load) {
  const text = String(load ?? "");
  return /\b(?:body[- ]?weight|bw|unweighted|no\s+external\s+load)\b/i.test(text)
    && !/\b(?:kg|kgs|kilograms?|lb|lbs|pounds?|barbell|plates?|weighted|added)\b/i.test(text);
}

/** Mechanical main-lift checks; passing them does not establish coaching quality. */
export function mainCompoundProblems(exercise) {
  if (!isMainCompound(exercise?.name)) return [];
  const issues = [];
  if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 10) {
    issues.push("Main barbell lift needs an exact set count from 1 to 10.");
  }
  if (exercise.dose?.kind !== "reps") {
    issues.push("Main barbell lift needs a rep target, not a timed hold.");
  } else if (!Number.isInteger(exercise.dose.range?.min) || exercise.dose.range.min !== exercise.dose.range?.max || exercise.dose.range.min < 1 || exercise.dose.range.min > 100) {
    issues.push("Main barbell lift needs one exact rep target, not a rep range.");
  }
  if (mainRpeValue(exercise.effort) === null) {
    issues.push("Main barbell lift needs one numeric RPE from 5 to 10 in 0.5 steps.");
  }
  if (bodyweightOnly(exercise.loadOrAssistance)) {
    issues.push("Main barbell lift needs an external load or load-selection instruction; bodyweight alone is not a working load.");
  }
  return issues;
}
