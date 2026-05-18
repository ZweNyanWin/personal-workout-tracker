export type ParsedTemplateExercise = {
  name: string;
  target_sets: number | null;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
  percent_1rm: number | null;
  notes: string | null;
};

export type ParsedTemplateSession = {
  title: string;
  notes: string | null;
  exercises: ParsedTemplateExercise[];
};

export type ParsedTemplateWeek = {
  weekNumber: number;
  title: string;
  sessions: ParsedTemplateSession[];
};

export type ParsedProgramTemplate = {
  title: string;
  description: string | null;
  weeks: ParsedTemplateWeek[];
};

export type StrengthExposureOptions = {
  enabled: boolean;
  percent1rm: number;
};

const WEEK_RE = /^week\s+(\d+)(?:\s*\((.*?)\))?/i;
const DAY_RE = /^day\s+\d+\s*[-–—]\s*(.+)$/i;
const BULLET_SESSION_RE = /^\*\s*([^:]+):\s*(.+)$/;
const NUMBERED_EXERCISE_RE = /^\d+[\.)]\s*(.+)$/;

export function parseProgramTemplateText(
  rawText: string,
  explicitTitle?: string,
  strengthExposure?: StrengthExposureOptions
): ParsedProgramTemplate {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Paste a program template first.");
  }

  const firstLine = lines[0] ?? "";
  const inferredTitle = inferTitle(firstLine);
  const title = explicitTitle?.trim() || inferredTitle;
  const focus = lines.find((line) => /^focus\s*:/i.test(line));
  const description = focus ? focus.replace(/^focus\s*:\s*/i, "").trim() : null;

  const weeks: ParsedTemplateWeek[] = [];
  let currentWeek: ParsedTemplateWeek | null = null;
  let currentSession: ParsedTemplateSession | null = null;
  const baseSessions = new Map<string, ParsedTemplateSession>();

  for (const line of lines) {
    const weekMatch = line.match(WEEK_RE);
    if (weekMatch) {
      currentWeek = {
        weekNumber: Number(weekMatch[1]),
        title: buildWeekTitle(Number(weekMatch[1]), weekMatch[2]),
        sessions: [],
      };
      weeks.push(currentWeek);
      currentSession = null;

      const restOfLine = line.slice(weekMatch[0].length).trim();
      const dayInWeekLine = restOfLine.match(DAY_RE);
      if (dayInWeekLine) {
        currentSession = {
          title: cleanSessionTitle(dayInWeekLine[1]),
          notes: null,
          exercises: [],
        };
        currentWeek.sessions.push(currentSession);
      }
      continue;
    }

    if (!currentWeek) continue;

    const dayMatch = line.match(DAY_RE);
    if (dayMatch) {
      currentSession = {
        title: cleanSessionTitle(dayMatch[1]),
        notes: null,
        exercises: [],
      };
      currentWeek.sessions.push(currentSession);
      continue;
    }

    const numberedMatch = line.match(NUMBERED_EXERCISE_RE);
    if (numberedMatch && currentSession) {
      currentSession.exercises.push(parseExerciseSegment(numberedMatch[1]));
      if (currentWeek.weekNumber === 1) {
        baseSessions.set(sessionKey(currentSession.title), cloneSession(currentSession));
      }
      continue;
    }

    const bulletMatch = line.match(BULLET_SESSION_RE);
    if (bulletMatch) {
      const sessionTitle = cleanSessionTitle(bulletMatch[1]);
      const base = baseSessions.get(sessionKey(sessionTitle));
      const session = base
        ? { ...cloneSession(base), title: sessionTitle }
        : { title: sessionTitle, notes: null, exercises: [] };

      applySessionSummary(session, bulletMatch[2]);
      currentWeek.sessions.push(session);
    }
  }

  if (weeks.length === 0) {
    throw new Error("No weeks found. Start week headings with `WEEK 1`, `WEEK 2`, etc.");
  }

  for (const week of weeks) {
    if (week.sessions.length === 0) {
      throw new Error(`Week ${week.weekNumber} has no sessions.`);
    }
  }

  if (strengthExposure?.enabled) {
    addStrengthExposureSingles(weeks, strengthExposure.percent1rm);
  }

  return { title, description, weeks };
}

export function normalizeExerciseKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\bwtd\b/g, "weighted")
    .replace(/\binc\b/g, "incline")
    .replace(/\bhb\b/g, "high bar")
    .replace(/\bcgb\b/g, "close grip bench")
    .replace(/\bsingle\b/g, "")
    .replace(/\bbackdowns?\b/g, "")
    .replace(/\bpress\b/g, "press")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalExerciseName(name: string) {
  const key = normalizeExerciseKey(name);
  if (/\bbench\b/.test(key) && /\bclose grip\b/.test(key)) return "Close-Grip Bench Press";
  if (/\blarsen\b/.test(key)) return "Larsen Press";
  if (/\bpin press\b/.test(key) || /\bslingshot\b/.test(key)) return "Pin Press / Slingshot Bench";
  if (/\bbench\b/.test(key) || key === "bench press") return "Competition Bench Press";
  if (/\bpaused\b/.test(key) && /\bhigh bar\b/.test(key)) return "Paused High-Bar Squat";
  if (/\btempo\b/.test(key) && (/\bsquat\b/.test(key) || /\bhigh bar\b/.test(key))) return "Tempo Squat";
  if (/\bhigh bar\b/.test(key) || key === "highbar" || key === "high bar squat") return "High-Bar Squat";
  if (/\bsquat\b/.test(key)) return "High-Bar Squat";
  if (/\brdl\b/.test(key) || /\bromanian deadlift\b/.test(key)) return "Romanian Deadlift";
  if (/\bconventional deadlift\b/.test(key) || key === "deadlift" || /\bdeadlift\b/.test(key)) return "Conventional Deadlift";
  if (/\bweighted\b/.test(key) && /\bpull/.test(key)) return "Weighted Pull-Up";
  if (/\bpull/.test(key) && /\bup/.test(key)) return "Weighted Pull-Up";
  if (/\bpushdown\b/.test(key)) return "Tricep Pushdown";
  if (/\blateral raise\b/.test(key)) return "DB Lateral Raise";
  if (/\bcurl/.test(key)) return "DB Curl";
  if (/\babs?\b/.test(key) || /\bcable crunch\b/.test(key) || /\bhanging raise\b/.test(key)) return "Cable Crunch";
  if (/\bleg extension\b/.test(key)) return "Leg Extension";
  if (/\bleg press\b/.test(key)) return "Leg Press";
  if (/\bhamstring curl\b/.test(key) || /\bleg curl\b/.test(key)) return "Leg Curl";
  if (/\blat pulldown\b/.test(key)) return "Lat Pulldown";
  if (/\bchest supported row\b/.test(key)) return "Chest-Supported Row";
  if (/\bcable fly\b/.test(key) || /\bpec deck\b/.test(key)) return "Cable Fly / Pec Deck";
  if (/\bbulgarian\b/.test(key)) return "Bulgarian Split Squat";
  if (/\bincline\b/.test(key) && /\bsmith\b/.test(key)) return "Incline Smith Press";
  if (/\bcalf raise/.test(key)) return "Calf Raises";
  return titleCase(name.replace(/\s+/g, " ").trim());
}

function inferTitle(firstLine: string) {
  const cleaned = firstLine
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/rebuild/i.test(cleaned)) {
    const weeks = cleaned.match(/\((weeks?\s+\d+\s*[-–]\s*\d+)\)/i)?.[1];
    return weeks ? `Hypertrophy (${titleCase(weeks)})` : "Hypertrophy Template";
  }

  return cleaned || "Imported Program Template";
}

function buildWeekTitle(weekNumber: number, label?: string) {
  const normalized = normalizePhaseLabel(label);
  return normalized ? `Week ${weekNumber} - ${normalized}` : `Week ${weekNumber}`;
}

function normalizePhaseLabel(label?: string) {
  if (!label) return null;
  const clean = label.replace(/\s+/g, " ").trim();
  if (/rebuild/i.test(clean)) return clean.replace(/rebuild/gi, "Hypertrophy");
  return titleCase(clean);
}

function cleanSessionTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseExerciseSegment(segment: string): ParsedTemplateExercise {
  const original = segment.trim();
  const colonIndex = original.indexOf(":");
  const rawName = colonIndex >= 0 ? original.slice(0, colonIndex).trim() : original;
  const prescription = colonIndex >= 0 ? original.slice(colonIndex + 1).trim() : "";
  const parentheticalNotes = Array.from(original.matchAll(/\(([^)]+)\)/g)).map((m) => m[1].trim());
  const cleanName = rawName.replace(/\([^)]*\)/g, "").trim();
  const notes = [rawName.match(/\(([^)]+)\)/)?.[1], prescription || null, ...parentheticalNotes]
    .filter(Boolean)
    .join(" | ");

  const setRepMatch = prescription.match(/(\d+)\s*[x×*]\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)/i);
  const kgMatch = prescription.match(/@\s*\+?([0-9]+(?:\.[0-9]+)?)\s*kg\b/i);
  const lbMatch = prescription.match(/@\s*\+?([0-9]+(?:\.[0-9]+)?)\s*lb\b/i);
  const percentMatch = prescription.match(/@\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[-–]\s*([0-9]+(?:\.[0-9]+)?))?\s*%/i);
  const rpeMatch = prescription.match(/\brpe\s*([0-9]+(?:\.[0-9]+)?)/i);

  let targetWeightKg: number | null = null;
  if (kgMatch) targetWeightKg = Number(kgMatch[1]);
  if (!kgMatch && lbMatch) targetWeightKg = Math.round(Number(lbMatch[1]) * 0.453592 * 10) / 10;

  let percent1rm: number | null = null;
  if (percentMatch) {
    const low = Number(percentMatch[1]);
    const high = percentMatch[2] ? Number(percentMatch[2]) : low;
    percent1rm = Math.round(((low + high) / 2) * 10) / 10;
  }

  return {
    name: cleanName,
    target_sets: setRepMatch ? Number(setRepMatch[1]) : null,
    target_reps: setRepMatch ? setRepMatch[2].replace(/\s*[–-]\s*/g, "-") : null,
    target_weight_kg: targetWeightKg,
    target_rpe: rpeMatch ? Number(rpeMatch[1]) : null,
    percent_1rm: percent1rm,
    notes: notes || null,
  };
}

function applySessionSummary(session: ParsedTemplateSession, summary: string) {
  const parts = summary.split("|").map((part) => part.trim()).filter(Boolean);
  const updatedIndexes = new Set<number>();

  for (const part of parts) {
    if (/^accessories\s*:/i.test(part)) {
      applyAccessorySummary(session, part.replace(/^accessories\s*:\s*/i, "").trim(), updatedIndexes);
      continue;
    }

    const parsed = parseExerciseSegment(part);
    const index = findMatchingExerciseIndex(session.exercises, parsed.name);
    if (index >= 0) {
      session.exercises[index] = mergeExercise(session.exercises[index], parsed);
      updatedIndexes.add(index);
    } else {
      session.exercises.push(parsed);
      updatedIndexes.add(session.exercises.length - 1);
    }
  }
}

function applyAccessorySummary(
  session: ParsedTemplateSession,
  summary: string,
  updatedIndexes: Set<number>
) {
  const oneSet = /\b1\s+set\b/i.test(summary);
  for (let i = 0; i < session.exercises.length; i += 1) {
    if (updatedIndexes.has(i)) continue;
    session.exercises[i] = {
      ...session.exercises[i],
      target_sets: oneSet ? 1 : session.exercises[i].target_sets,
      notes: appendNote(session.exercises[i].notes, summary),
    };
  }
}

function mergeExercise(base: ParsedTemplateExercise, update: ParsedTemplateExercise) {
  return {
    ...base,
    target_sets: update.target_sets ?? base.target_sets,
    target_reps: update.target_reps ?? base.target_reps,
    target_weight_kg: update.target_weight_kg ?? base.target_weight_kg,
    target_rpe: update.target_rpe ?? base.target_rpe,
    percent_1rm: update.percent_1rm ?? base.percent_1rm,
    notes: appendNote(base.notes, update.notes),
  };
}

function findMatchingExerciseIndex(exercises: ParsedTemplateExercise[], name: string) {
  const key = normalizeExerciseKey(name);
  return exercises.findIndex((exercise) => {
    const exerciseKey = normalizeExerciseKey(exercise.name);
    return exerciseKey === key || exerciseKey.includes(key) || key.includes(exerciseKey);
  });
}

function addStrengthExposureSingles(weeks: ParsedTemplateWeek[], percent1rm: number) {
  const boundedPercent = Math.min(100, Math.max(1, percent1rm || 82.5));
  for (const week of weeks) {
    for (const session of week.sessions) {
      const isUpper = /upper/i.test(session.title) || session.exercises.some((ex) => /bench/i.test(ex.name));
      const isLower = /lower/i.test(session.title) || session.exercises.some((ex) => /squat/i.test(ex.name));

      if (isUpper && !hasExposureSingle(session, "bench")) {
        session.exercises.unshift(exposureSingle("Bench Strength Exposure Single", boundedPercent));
      }

      if (isLower && !hasExposureSingle(session, "squat")) {
        session.exercises.unshift(exposureSingle("Squat Strength Exposure Single", boundedPercent));
      }
    }
  }
}

function hasExposureSingle(session: ParsedTemplateSession, lift: "bench" | "squat") {
  return session.exercises.some((exercise) => {
    const key = normalizeExerciseKey(exercise.name);
    return key.includes(lift) && exercise.target_sets === 1 && exercise.target_reps === "1";
  });
}

function exposureSingle(name: string, percent1rm: number): ParsedTemplateExercise {
  return {
    name,
    target_sets: 1,
    target_reps: "1",
    target_weight_kg: null,
    target_rpe: null,
    percent_1rm: percent1rm,
    notes: "Strength exposure single; use 80-85%, smooth enough to triple on a good day.",
  };
}

function cloneSession(session: ParsedTemplateSession): ParsedTemplateSession {
  return {
    title: session.title,
    notes: session.notes,
    exercises: session.exercises.map((exercise) => ({ ...exercise })),
  };
}

function appendNote(current: string | null, next: string | null) {
  if (!next) return current;
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current} | ${next}`;
}

function sessionKey(title: string) {
  return normalizeExerciseKey(title);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
