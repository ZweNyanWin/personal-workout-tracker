/** Mechanical contradiction checks. Passing these does not establish coaching quality. */
const numericRange = "(\\d+(?:\\.\\d+)?)(?:\\s*[-–]\\s*(\\d+(?:\\.\\d+)?))?";
const valueAfterLabel = new RegExp(`^\\s*[:=]?\\s*${numericRange}(?![\\p{L}\\p{N}_]|\\.\\S|\\s*[-–])`, "u");
// A minus sign is part of the written target, never a delimiter that turns a
// negative reserve into a positive one. Keep descending positive RIR ranges.
const valueBeforeRir = new RegExp(`(?:^|[^\\p{L}\\p{N}_.\\-−–])${numericRange}\\s*$`, "u");

function labelledTargets(clause) {
  return [...clause.matchAll(/\b(?:RPE|RIR)(?=\b|\d)|(?<=\d)RIR\b/gi)].map((label) => {
    const kind = label[0].toUpperCase();
    const match = valueAfterLabel.exec(clause.slice(label.index + label[0].length))
      ?? (kind === "RIR" ? valueBeforeRir.exec(clause.slice(0, label.index)) : null);
    return { kind, match };
  });
}

export function effortProblems(text) {
  const issues = [];
  // A nonempty JSON string is not necessarily an effort target. Keep genuine
  // qualitative cues such as easy recovery or hold quality, but reject the
  // punctuation-only output observed during actual candidate evaluation.
  if (!/\p{L}/u.test(text)) issues.push("The effort target must describe effort or hold quality, not punctuation or a bare number.");
  const clauses = text.split(/[;\n]/);
  for (const clause of clauses) {
    const targets = labelledTargets(clause);
    if (targets.some(({ match }) => !match)) issues.push("The effort target is missing its value or has an unparseable RPE/RIR value.");
    for (const { kind, match } of targets) if (kind === "RPE" && match) {
      const bounds = [Number(match[1]), Number(match[2] ?? match[1])];
      if (Math.min(...bounds) < 5 || Math.max(...bounds) > 10) issues.push("Resistance-training RPE must be between 5 and 10.");
    }
    const rpe = /\bRPE\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i.exec(clause);
    const rir = /\b(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(?:RIR|reps?\s+(?:in\s+reserve|left|remaining))/i.exec(clause)
      || /\bRIR\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i.exec(clause);
    if (rpe) {
      const rpeBounds = [Number(rpe[1]), Number(rpe[2] ?? rpe[1])].sort((a, b) => a - b);
      if (rpeBounds[0] < 5 || rpeBounds[1] > 10) issues.push("Resistance-training RPE must be between 5 and 10.");
      if (rir) {
        const rirBounds = [Number(rir[1]), Number(rir[2] ?? rir[1])].sort((a, b) => a - b);
        if (Math.abs(10 - rpeBounds[1] - rirBounds[0]) > 0.51
          || Math.abs(10 - rpeBounds[0] - rirBounds[1]) > 0.51) issues.push("RPE and repetitions in reserve contradict each other.");
      }
    }
  }
  return [...new Set(issues)];
}

export function programEffortProblems(value) {
  if (Array.isArray(value)) return value.flatMap(programEffortProblems);
  if (value && typeof value === "object") {
    const own = typeof value.effort === "string" ? effortProblems(value.effort) : [];
    const nested = Object.values(value).filter((item) => item && typeof item === "object").flatMap(programEffortProblems);
    return [...own, ...nested];
  }
  return [];
}
