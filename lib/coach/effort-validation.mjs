/** Mechanical contradiction checks. Passing these does not establish coaching quality. */
export function effortProblems(text) {
  const issues = [];
  const clauses = text.split(/[;\n]/);
  for (const clause of clauses) {
    const rpe = /\bRPE\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i.exec(clause);
    const rir = /\b(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(?:RIR|reps?\s+(?:in\s+reserve|left|remaining))/i.exec(clause)
      || /\bRIR\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i.exec(clause);
    if (rpe) {
      const rpeBounds = [Number(rpe[1]), Number(rpe[2] ?? rpe[1])].sort((a, b) => a - b);
      if (rpeBounds[0] < 5 || rpeBounds[1] > 10) issues.push("Resistance-training RPE must be between 5 and 10.");
      if (rir) {
        const rirBounds = [Number(rir[1]), Number(rir[2] ?? rir[1])].sort((a, b) => a - b);
        if (Math.abs(10 - rpeBounds[1] - rirBounds[0]) > 0.51
          || Math.abs(10 - rpeBounds[0] - rirBounds[1]) > 0.51) issues.push("RPE and repetitions in reserve contradict each other.");
      }
    }
    if ((!rpe && /\bRPE\s*[:=]?\s*$/i.test(clause.trim())) || (!rir && /\bRIR\s*[:=]?\s*$/i.test(clause.trim()))) issues.push("The effort target is missing its value.");
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
