import { extractTrainingConstraints } from "../lib/coach/training-constraints.mjs";
import { isMainCompound } from "../lib/coach/exercise-rules.mjs";

const clean = (text) => String(text ?? "").replace(/\*\*|__/g, "").trim();
const normalize = (text) => clean(text).normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  .replace(/\bsquats\b/g, "squat").replace(/\brows\b/g, "row").replace(/\bpush ups\b/g, "push up").replace(/\blunges\b/g, "lunge");
const phrase = (text, part) => (` ${normalize(text)} `).includes(` ${normalize(part)} `);

function tables(brief) {
  const result = [];
  const lines = String(brief).split(/\r?\n/).map((line) => line.replace(/^\s*>\s?/, ""));
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\|/.test(lines[index]) || !/^\s*\|[\s:|-]+\|?\s*$/.test(lines[index + 1] ?? "")) continue;
    const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map(clean);
    const header = cells(lines[index]), rows = [];
    index += 2;
    while (index < lines.length && /^\s*\|/.test(lines[index])) {
      rows.push(cells(lines[index++]));
      if (rows.length > 64) throw new Error("The pasted prescription table has too many rows; split it before drafting.");
    }
    index--;
    result.push({ header, rows });
  }
  return result;
}

function sourceChoices(sourceName, catalog, perSide) {
  const source = normalize(sourceName.replace(/^\d+[.)]\s*/, "").replace(/\(optional\)/i, ""));
  const exact = catalog.filter((entry) => normalize(entry.name) === source);
  if (exact.length) return exact.map((entry) => entry.name);
  // Only these explicit spelling/context aliases are recognized. A word such
  // as "row" is not enough to turn a cable exercise into a band variation.
  const aliases = [
    [/^push up on parallettes?$/, ["Parallette Push-up"]],
    [/^dumbbell goblet squat$/, ["Dumbbell Goblet Squat"]],
    [/^dumbbell overhead press$/, ["Dumbbell Overhead Press"]],
    [/^resistance band row$/, ["Resistance Band Row"]],
    [/^bodyweight squat to wall or lunge$/, perSide ? ["Reverse Lunge"] : ["Bodyweight Squat", "Reverse Lunge"]],
    [/^plank on floor or parallettes?$/, ["Plank"]],
    [/^band assisted push up$/, ["Band-Assisted Push-up"]],
  ];
  const names = aliases.find(([pattern]) => pattern.test(source))?.[1] ?? [];
  return catalog.filter((entry) => names.some((name) => normalize(name) === normalize(entry.name))).map((entry) => entry.name);
}

function doseFromCell(cell, header) {
  const text = clean(cell);
  const match = /^(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?\s*(reps?|repetitions?|seconds?|secs?|s)?(?:\s*(?:per|each)\s*(leg|side|arm))?\s*$/i.exec(text);
  if (!match) return null;
  const min = Number(match[1]), max = Number(match[2] ?? match[1]);
  const kind = match[3] ? (/^s/i.test(match[3]) ? "hold" : "reps") : /^(?:seconds?|duration|hold)$/i.test(clean(header)) ? "hold" : "reps";
  if (!Number.isInteger(min) || min < 1 || max < min || max > (kind === "hold" ? 120 : 100)) return null;
  return kind === "hold" ? { kind, seconds: { min, max } } : { kind, range: { min, max }, perSide: Boolean(match[4]) };
}

function rpeBounds(text) {
  const match = /^RPE\s*(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?$/i.exec(clean(text));
  if (!match) return null;
  const min = Number(match[1]), max = Number(match[2] ?? match[1]);
  return min >= 5 && max <= 10 && max >= min && Number.isInteger(min * 2) && Number.isInteger(max * 2) ? { min, max } : null;
}

function explicitGuidance(brief) {
  const guidance = {}, issues = [];
  const lines = String(brief).split(/\r?\n/).map((line) => clean(line.replace(/^\s*>\s?/, "")));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/^[-*]\s+/, "");
    const match = /^(?:#{1,6}\s*)?(progression|regression|warm[- ]?up)\s*(?::\s*(.*)|$)/i.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/[- ]/g, ""), parts = match[2]?.trim() ? [match[2].trim()] : [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor].trim();
      if (!next || /^(?:#{1,6}\s|---|\||(?:[-*]\s+)?[A-Za-z][A-Za-z ]{0,35}\s*:)/.test(next)) break;
      // Nested bullet text belongs to this explicit guidance label. Unlabeled
      // trailing requests do not silently become a progression prescription.
      if (!/^[-*]\s+/.test(next)) break;
      parts.push(next.replace(/^[-*]\s+/, ""));
      index = cursor;
    }
    const value = parts.join(" ");
    if (!value || value.length > 280 || guidance[key]) issues.push(`The pasted ${key} guidance is empty, duplicated, or too long to preserve without truncation. Clarify its complete rule before drafting.`);
    else guidance[key] = value;
  }
  return { guidance, issues };
}

/** A pasted-template import has known provenance and unknown personal
 * readiness. These facts are formatted from server data, never predicted. */
export function groundedMarkdownHeader(contract, scope) {
  if (!contract?.prescriptions.length) return null;
  const end = scope.startWeek + scope.weekCount - 1;
  const scopeLabel = end === scope.startWeek ? `week ${scope.startWeek}` : `weeks ${scope.startWeek}–${end}`;
  const assumptions = [
    "This is a proposed import of the pasted table and daily recipes for coach review; personal readiness is not inferred from a template.",
    "Exercise identities use the supplied compatible catalog, which may contain public defaults; ownership by the coach is not inferred.",
    contract.days.length ? "A daily family choice uses one permitted variation; optional table rows are not required in this bounded import."
      : "The pasted numerical prescription is preserved; its distribution across requested days is proposed where unspecified.",
  ];
  if (contract.days.some((day) => day.recovery)) assumptions.push("The light recovery movement and dose are proposed where unspecified; the coach's whole-session duration is preserved.");
  const progression = contract.guidance?.progression
    ? `Coach-supplied progression (${scopeLabel} requested; later-week rules remain future advice): ${contract.guidance.progression}`
    : "Keep the pasted prescription for the requested scope; any progression must follow the coach's explicit instructions. No additional progression is inferred.";
  const regression = contract.guidance?.regression
    ? `Coach-supplied regression: ${contract.guidance.regression}`
    : "Follow any explicit regression instructions in the brief. If a target is not achievable, ask the coach for an appropriate change; ability has not been verified.";
  return { title: `Imported ${scope.weekCount}-week workout draft`, assumptions, progression, regression,
    focus: "Preserve the pasted daily exercise recipes and numerical targets for coach review." };
}

export function markdownHeaderProblems(value, header) {
  if (!header) return [];
  return value?.title !== header.title || JSON.stringify(value?.assumptions) !== JSON.stringify(header.assumptions)
    || value?.progression !== header.progression || value?.regression !== header.regression || value?.week?.focus !== header.focus
    ? ["The pasted import changed its grounded header facts or explicit coach guidance. Do not invent library ownership, personal ability, safety or progression history."] : [];
}

/** Preserve supported pasted prescriptions without asking the model to infer
 * the table's numerical targets. Ambiguous/missing canonical identities fail
 * clearly; this bounded parser is not a general document importer. */
export function extractMarkdownPrescription(brief, catalog = []) {
  if (typeof brief !== "string" || brief.length > 6000) throw new Error("The pasted coaching brief must be at most 6,000 characters.");
  const parsed = tables(brief), prescriptions = [], days = [], issues = [];
  const sourceGuidance = explicitGuidance(brief);
  const effort = /\beffort\s*:\s*RPE\s*(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?/i.exec(clean(brief));
  const effortBounds = effort ? { min: Number(effort[1]), max: Number(effort[2] ?? effort[1]) } : null;
  for (const table of parsed) {
    const exerciseColumn = table.header.findIndex((value) => /^exercise$/i.test(value));
    const setsColumn = table.header.findIndex((value) => /^sets$/i.test(value));
    const doseColumn = table.header.findIndex((value) => /\b(?:reps?|hold|duration|seconds)\b/i.test(value));
    const effortColumn = table.header.findIndex((value) => /^RPE$/i.test(value));
    if (exerciseColumn < 0 || setsColumn < 0 || doseColumn < 0) {
      if (exerciseColumn >= 0 || (setsColumn >= 0 && doseColumn >= 0)) issues.push("The pasted exercise table needs explicit Exercise, Sets, and Reps / Hold columns. Clarify its format before drafting; unsupported tables are not permission to invent prescriptions.");
      continue;
    }
    if (table.header.some((value, index) => ![exerciseColumn, setsColumn, doseColumn, effortColumn].includes(index) && !/^notes$/i.test(value))) {
      issues.push("This pasted table includes additional target columns that the bounded importer cannot preserve yet. Put explicit effort, load, and rest targets in labeled prose, or use the editable draft before requesting Tommy's help.");
    }
    for (const row of table.rows) {
      const sourceName = row[exerciseColumn] ?? "", sets = Number(row[setsColumn]), dose = doseFromCell(row[doseColumn], table.header[doseColumn]);
      const optional = /\boptional\b/i.test(sourceName);
      if (row.length !== table.header.length || !sourceName || !Number.isInteger(sets) || sets < 1 || sets > 10 || !dose) {
        issues.push("A pasted exercise row has an ambiguous set or repetition/duration target. Clarify that row before drafting."); continue;
      }
      const choices = sourceChoices(sourceName, catalog, dose.kind === "reps" && dose.perSide);
      if (!choices.length) {
        if (!optional) issues.push(`The pasted exercise "${clean(sourceName).replace(/^\d+[.)]\s*/, "")}" has no compatible exact exercise identity. Add/select its variation in the Exercise Library before drafting.`);
        continue;
      }
      if (choices.some(isMainCompound) && (dose.kind !== "reps" || dose.range.min !== dose.range.max)) {
        issues.push(`The pasted main lift "${sourceName}" needs one exact repetition target. Choose an exact rep count before drafting.`); continue;
      }
      const notesColumn = table.header.findIndex((value) => /^notes$/i.test(value));
      const sourceNotes = notesColumn >= 0 ? row[notesColumn] ?? "" : "";
      if (sourceNotes.length > 240) {
        issues.push(`The pasted coaching cue for "${sourceName}" is too long to preserve without truncation. Keep its complete tempo, distance, and technique cue within 240 characters, or edit it in the draft.`); continue;
      }
      const rowEffort = effortColumn >= 0 ? rpeBounds(`RPE ${clean(row[effortColumn]).replace(/^RPE\s*/i, "")}`) : null;
      const noteEfforts = [...sourceNotes.matchAll(/\bRPE\s*\d+(?:\.\d+)?(?:\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?)?/gi)].map((match) => rpeBounds(match[0]));
      if ((effortColumn >= 0 && !rowEffort) || noteEfforts.some((item) => !item) || noteEfforts.length > 1
        || (rowEffort && noteEfforts[0] && JSON.stringify(rowEffort) !== JSON.stringify(noteEfforts[0]))) {
        issues.push(`The pasted effort for "${sourceName}" is unresolved or conflicting. Write one complete RPE target before drafting.`); continue;
      }
      const writtenEffort = rowEffort ?? noteEfforts[0];
      if (writtenEffort && choices.some(isMainCompound) && writtenEffort.min !== writtenEffort.max) {
        issues.push(`The pasted main lift "${sourceName}" needs one exact RPE target, not an RPE range.`); continue;
      }
      const oneDumbbell = /\b(?:hold|use)\s+one\s+(?:(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\s+)?dumbbell\b/i.exec(sourceNotes);
      if (prescriptions.some((item) => item.choices.some((name) => choices.some((choice) => normalize(name) === normalize(choice))))) {
        issues.push(`The pasted exercise "${sourceName}" appears more than once with an unresolved group or variation. Give each top/backdown group its own exact identity before drafting.`); continue;
      }
      prescriptions.push({ sourceName, choices, sets, dose, optional, sourceNotes,
        conditionalFuture: /\b(?:progress\s+to[^.!?\n]{1,100}\bif\s+possible|after\s+\d+\s+weeks?)\b/i.test(sourceNotes),
        oneDumbbell: Boolean(oneDumbbell), ...(writtenEffort ? { writtenEffort } : {}),
        ...(oneDumbbell?.[1] ? { writtenLoad: { value: Number(oneDumbbell[1]), unit: /^k/i.test(oneDumbbell[2]) ? "kg" : "lb" } } : {}) });
    }
  }
  if (!prescriptions.length && !issues.length) return null;
  issues.push(...sourceGuidance.issues);
  for (const table of parsed) {
    const dayColumn = table.header.findIndex((value) => /^day$/i.test(value));
    const focusColumn = table.header.findIndex((value) => /^(?:focus|workout|session)$/i.test(value));
    if (dayColumn < 0 || focusColumn < 0) {
      if (dayColumn >= 0) issues.push("The pasted weekly flow needs explicit Day and Focus / Workout / Session columns. Clarify the unsupported flow before drafting.");
      continue;
    }
    for (const row of table.rows) {
      const number = Number(/^day\s*(\d+)$/i.exec(row[dayColumn] ?? "")?.[1]);
      if (!Number.isInteger(number) || number < 1 || number > 7 || days.some((day) => day.number === number)) {
        issues.push("The pasted weekly flow has an ambiguous or duplicate day number."); continue;
      }
      const focus = row[focusColumn] ?? "";
      if (row.length !== table.header.length || !focus) { issues.push(`Day ${number}'s pasted weekly flow is missing its exact focus.`); continue; }
      if (/\bactive\s+recovery\b/i.test(focus)) {
        const minutes = Number(/\b(\d+(?:\.\d+)?)\s*min(?:ute)?s?\b/i.exec(focus)?.[1]);
        if (!minutes || minutes < 1 || minutes > 180) issues.push(`Day ${number}'s active-recovery flow needs a clear total session duration between 1 and 180 min.`);
        const lightBandOnly = /\blight\s+band\s+(?:work|training)\b/i.test(focus);
        const recoveryChoices = catalog.filter((entry) => lightBandOnly
          ? /\bbands?\b/i.test(entry.name) && /\b(?:rows?|pull[- ]?apart|face[- ]?pull|external\s+rotation|mobility)\b/i.test(entry.name)
          : /\b(?:mobility|stretch(?:ing)?|walk(?:ing)?)\b/i.test(entry.name)).map((entry) => entry.name);
        if (!recoveryChoices.length) issues.push(`Day ${number}'s recovery focus has no compatible light movement in the supplied library. Add/select an easy ${lightBandOnly ? "band movement" : "walking or mobility movement"} before drafting; working push-ups are not a recovery substitute.`);
        days.push({ number, focus, recovery: true, ...(minutes ? { minutes } : {}), lightBandOnly, recoveryChoices, required: [] });
        continue;
      }
      const required = /\bfull[- ]?body\b/i.test(focus) ? prescriptions.filter((item) => !item.optional).map((item) => item.choices) : [];
      if (!required.length) for (const part of focus.split(/[,+]/)) {
        const token = normalize(part);
        if (!token) continue;
        const candidates = prescriptions.filter((item) => !item.optional && (phrase(item.sourceName, token)
          || item.choices.some((name) => phrase(name, token))));
        if (!candidates.length) issues.push(`Day ${number}'s pasted focus "${clean(part)}" does not resolve to a prescribed exercise. Clarify its exact variation before drafting.`);
        else required.push([...new Set(candidates.flatMap((item) => item.choices))]);
      }
      const cooldown = /\b(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s+cool[- ]?down\b/i.exec(focus);
      if (/\bcool[- ]?down\b/i.test(focus) && (!cooldown || Number(cooldown[1]) < 1 || Number(cooldown[1]) > 60)) issues.push(`Day ${number}'s cool-down needs a clear duration between 1 and 60 min.`);
      // An optional assisted push-up belongs only to a day already prescribing
      // push-ups, unless the recipe explicitly includes all optional table rows.
      const optional = prescriptions.filter((item) => item.optional && (phrase(focus, item.sourceName.replace(/\(optional\)/i, ""))
        || (/\bfull[- ]?body\b/i.test(focus) && /\ball\s+(?:above|exercises?)\b/i.test(focus))
        || (item.choices.some((name) => /\bpush[- ]?up\b/i.test(name)) && required.some((choices) => choices.some((name) => /\bpush[- ]?up\b/i.test(name)))))).map((item) => item.choices);
      days.push({ number, focus, recovery: false, required, optional, ...(cooldown ? { cooldownMinutes: Number(cooldown[1]) } : {}) });
    }
  }
  if (days.length && [...days].sort((a, b) => a.number - b.number).some((day, index) => day.number !== index + 1)) issues.push("The pasted weekly flow has missing day numbers. Provide a contiguous Day 1 through the last requested day.");
  if (effortBounds && (effortBounds.min < 5 || effortBounds.max > 10 || effortBounds.max < effortBounds.min)) issues.push("The pasted working-effort target needs a valid resistance-training RPE from 5 to 10.");
  const contract = { prescriptions, days, effortBounds, guidance: sourceGuidance.guidance, dumbbellLoad: extractTrainingConstraints(brief).dumbbellLoad, issues: [...new Set(issues)] };
  // Check annotation budgets before any model call. Complete source cues are
  // never silently trimmed to satisfy the small model's output grammar.
  for (const recipe of days) for (const [index, choices] of recipe.required.entries()) for (const name of choices) {
    try { markdownNotes(contract, recipe.number, name, index); }
    catch (error) { contract.issues.push(error.message); }
  }
  contract.issues = [...new Set(contract.issues)];
  return contract;
}

export function markdownPrescriptionContext(contract) {
  return contract ? `PASTED PRESCRIPTION TABLE AND WEEKLY RECIPE (authoritative numerical coach data):\n${JSON.stringify(contract)}\nChoose one compatible exact identity from each required choice group, once per day; never fill a partial-focus day with the whole exercise table. A full-body day must include every non-optional primary table row; optional entries may be omitted and appear only in a day's allowed optional groups. Preserve each table row's exact sets, rep/duration endpoints and explicit per-side unit. Retain sourceNotes verbatim under the Coach source cue label, including tempo, distance, and walking instructions. Conditional progression within a cue remains labeled future advice; it is not a current exercise or evidence of ability. Do not replace a band row with a dumbbell press. Recovery days are separate light/easy sessions: use qualitative easy/comfortable effort, not a working-set RPE; do not copy hard working-set doses or working-row coaching cues into them. The recovery duration is the whole session target, not an extra warmup before more work. Put any prescribed cool-down after the workout in coaching notes, never in warmup. Do not invent a personalized warm-up from an incomplete pasted table; preserve explicit source warm-up guidance or use the fixed coach-confirmation annotation.\n` : "";
}

export function markdownWarmup(contract, number, sourceDay) {
  if (!contract) return null;
  if (contract.guidance?.warmup) return `Coach-supplied warm-up: ${contract.guidance.warmup}`;
  if (sourceDay?.warmup?.trim()) return sourceDay.warmup;
  const recipe = contract.days.find((day) => day.number === number);
  return recipe?.recovery && recipe.minutes
    ? `The written ${recipe.minutes} min total recovery session includes any familiar warm-up; confirm its content with the coach.`
    : "Confirm the warm-up with your coach; this pasted numerical template alone does not establish a personalized warm-up.";
}

export function markdownNotes(contract, number, name, index, sourceDay) {
  if (!contract) return null;
  const recipe = contract.days.find((day) => day.number === number), source = sourcePrescriptionForDay(contract, number, name);
  const notes = [];
  const existing = sourceDay?.exercises.find((exercise) => exercise.name === name)?.notes?.trim();
  if (existing) notes.push(existing);
  if (source?.sourceNotes) notes.push(`Coach source cue: ${source.sourceNotes}`);
  if (source?.conditionalFuture) notes.push("Conditional progression in this cue is future advice, not a current prescription or evidence of ability. Current stated exclusions still apply.");
  if (index === 0) {
    if (recipe?.recovery && recipe.minutes) notes.push(`${recipe.minutes} min total for the whole easy recovery session, including warmup.`);
    else if (recipe?.cooldownMinutes) notes.push(`Finish with ${recipe.cooldownMinutes} min cool-down after the workout.`);
  }
  const text = notes.join(" ");
  if (text.length > 400) throw new Error("The complete source cue and session annotations exceed the bounded import note size. Clarify the cue before drafting; no tempo or distance was truncated.");
  return text || null;
}

export function markdownScopeProblems(contract, scope) {
  return contract?.days.length && contract.days.length !== scope.daysPerWeek
    ? ["The pasted weekly flow and requested day count differ. Clarify which days to preserve before drafting."] : [];
}

export function markdownPrescriptionProblems(week, contract, { outline = false, sourceWeek } = {}) {
  if (!contract) return [];
  const issues = [];
  for (const day of week.days ?? []) {
    const recipe = contract.days.find((item) => item.number === day.number);
    if (contract.days.length && !recipe) { issues.push(`Day ${day.number} is outside the pasted weekly flow.`); continue; }
    const sourceDay = sourceWeek?.days.find((source) => source.number === day.number);
    if (day.warmup !== markdownWarmup(contract, day.number, sourceDay)) issues.push(`Day ${day.number} changed the source warm-up annotation. Preserve explicit coach guidance; do not invent a warm-up or claim none is needed.`);
    if (recipe?.recovery) {
      for (const exercise of day.exercises ?? []) if (!(recipe.recoveryChoices ?? []).some((name) => normalize(name) === normalize(exercise.name))) {
        issues.push(`Day ${day.number} specifies ${recipe.lightBandOnly ? "light band" : "easy walking or mobility"} recovery, not additional push-up, dumbbell or hard strength exercises.`);
      }
      if ((day.exercises ?? []).length !== 1) issues.push(`Day ${day.number}'s bounded recovery recipe uses one compatible easy movement, not a copied strength circuit.`);
      if (outline) continue;
      for (const exercise of day.exercises ?? []) {
        const effort = [...String(exercise.effort ?? "").matchAll(/\bRPE\s*(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?/gi)];
        if (effort.length || !/\b(?:easy|light|comfortable|gentle|recovery)\b/i.test(exercise.effort ?? "")) issues.push(`Day ${day.number} is active recovery and cannot contain hard working sets; use qualitative easy/light effort, not a working-set RPE.`);
      }
      const minutes = String(recipe.minutes).replace(/\./g, "\\.");
      if (recipe.minutes && !new RegExp(`\\b${minutes}\\s*(?:min(?:ute)?s?|minute)\\s*(?:total|whole|entire)|\\b(?:total|whole|entire)\\s*(?:session\\s*)?(?:of\\s*)?${minutes}\\s*min(?:ute)?s?\\b`, "i")
        .test(`${day.title ?? ""} ${day.warmup ?? ""} ${(day.exercises ?? []).map((item) => item.notes ?? "").join(" ")}`)) issues.push(`Day ${day.number} must state ${recipe.minutes} min total for the whole recovery session, not ${recipe.minutes} minutes of warmup plus extra work.`);
      continue;
    }
    for (const choices of recipe?.required ?? []) {
      const found = (day.exercises ?? []).filter((exercise) => choices.some((name) => normalize(name) === normalize(exercise.name)));
      if (!found.length) issues.push(`Day ${day.number} omits its prescribed ${choices.join(" or ")} group; full-body 'all above' includes every non-optional table row.`);
      if (found.length > 1) issues.push(`Day ${day.number} duplicates its prescribed ${choices.join(" or ")} group; preserve the written set count once.`);
    }
    if (recipe) for (const exercise of day.exercises ?? []) {
      if (![...recipe.required, ...(recipe.optional ?? [])].some((choices) => choices.some((name) => normalize(name) === normalize(exercise.name)))) issues.push(`Day ${day.number} adds ${exercise.name} outside its pasted daily focus. Preserve that day's prescribed exercise subset.`);
      if ((day.exercises ?? []).filter((item) => normalize(item.name) === normalize(exercise.name)).length > 1) issues.push(`Day ${day.number} duplicates ${exercise.name} beyond the pasted set count.`);
    }
    if (outline) continue;
    if (recipe?.cooldownMinutes) {
      const minutes = String(recipe.cooldownMinutes).replace(/\./g, "\\.");
      const cooldown = new RegExp(`\\b${minutes}\\s*min(?:ute)?s?\\s*(?:of\\s*)?cool[- ]?down|\\bcool[- ]?down[^.;\\n]{0,30}\\b${minutes}\\s*min(?:ute)?s?\\b`, "i");
      if (!cooldown.test((day.exercises ?? []).map((item) => item.notes ?? "").join(" "))) issues.push(`Day ${day.number} requires ${recipe.cooldownMinutes} min cool-down after the workout in coaching notes; do not move it into the warmup.`);
      if (cooldown.test(day.warmup ?? "")) issues.push(`Day ${day.number}'s cool-down belongs after the workout, not in its warmup.`);
    }
    for (const [index, exercise] of (day.exercises ?? []).entries()) {
      const source = contract.prescriptions.find((item) => item.choices.some((name) => normalize(name) === normalize(exercise.name)));
      if (!source) { issues.push(`Day ${day.number} adds "${exercise.name}" outside the pasted prescription table. Keep the coach's working exercises or ask for a precise addition.`); continue; }
      const cue = markdownNotes(contract, day.number, exercise.name, index, sourceDay);
      if (cue && !(exercise.notes ?? "").includes(cue)) issues.push(`Day ${day.number}, ${exercise.name} dropped or changed its labeled coach source cue or session annotation. Preserve its complete tempo, distance and conditional-future wording.`);
      const actualRange = exercise.dose?.kind === "reps" ? exercise.dose.range : exercise.dose?.seconds;
      const sourceRange = source.dose.kind === "reps" ? source.dose.range : source.dose.seconds;
      const sameDose = exercise.dose?.kind === source.dose.kind && actualRange?.min === sourceRange.min && actualRange?.max === sourceRange.max
        && (source.dose.kind !== "reps" || exercise.dose.perSide === source.dose.perSide);
      if (exercise.sets !== source.sets || !sameDose) issues.push(`Day ${day.number}, ${exercise.name} changed the pasted sets or rep/duration endpoints. Preserve ${source.sets} sets and ${JSON.stringify(source.dose)} exactly.`);
      if (source.oneDumbbell && /\b(?:two|pair|both|combined|each\s+hand)\b/i.test(exercise.loadOrAssistance ?? "")) issues.push(`Day ${day.number}, ${exercise.name} explicitly uses one dumbbell in the pasted prescription, not a pair.`);
      if (source.writtenLoad) {
        const mass = /\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/i.exec(exercise.loadOrAssistance ?? "");
        if (!mass || Number(mass[1]) !== source.writtenLoad.value || (/^k/i.test(mass[2]) ? "kg" : "lb") !== source.writtenLoad.unit) issues.push(`Day ${day.number}, ${exercise.name} must preserve the pasted ${source.writtenLoad.value} ${source.writtenLoad.unit} load.`);
      }
      if (source.writtenEffort || contract.effortBounds) {
        const rpe = /\bRPE\s*(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?/i.exec(exercise.effort ?? "");
        const bounds = source.writtenEffort ?? contract.effortBounds;
        if (!rpe || Number(rpe[1]) < bounds.min || Number(rpe[2] ?? rpe[1]) > bounds.max
          || (source.writtenEffort && (Number(rpe[1]) !== bounds.min || Number(rpe[2] ?? rpe[1]) !== bounds.max))) issues.push(`Day ${day.number}, ${exercise.name} must ${source.writtenEffort ? "preserve" : "stay within"} the pasted working effort RPE ${bounds.min}–${bounds.max}.`);
      }
    }
  }
  return [...new Set(issues)];
}

export function sourcePrescriptionForDay(contract, number, name) {
  if (!contract || contract.days.find((day) => day.number === number)?.recovery) return null;
  return contract.prescriptions.find((source) => source.choices.some((choice) => normalize(choice) === normalize(name))) ?? null;
}
