import { buildReferenceContext } from "./references.mjs";

export const PROGRAM_PROMPT_BYTES = 36000;
/** Longer blocks need more sequential calls on the Mac, while abandoned
 * generations still have a hard deadline and retain the single-job slot. */
export function programGenerationTimeout(scope) {
  const calls = scope.weekCount * (scope.daysPerWeek > 2 ? scope.daysPerWeek + 1 : 1);
  return Math.min(90 * 60 * 1000, Math.max(30 * 60 * 1000, calls * 90000));
}
const omitted = "\nOptional draft continuity/reference excerpts that do not fit are unavailable. Do not invent their targets or source-specific rules. The full coach brief, current source prescriptions and supplied client records take priority.\n";
const bytes = value => Buffer.byteLength(value, "utf8");

/** An outline needs identities/order, not another copy of all working doses.
 * Day calls receive the complete current source day separately. */
export function outlineContinuity(week) {
  return week ? { number: week.number, focus: week.focus, days: week.days.map(day => ({
    number: day.number, title: day.title, warmup: day.warmup,
    exercises: day.exercises.map(({ name }) => ({ name })),
  })) } : null;
}

export function dayContinuity(week, number) {
  const day = week?.days.find(day => day.number === number);
  return day ? { number: week.number, days: [{ number: day.number, title: day.title,
    exercises: day.exercises.map(({ name, sets, dose, loadOrAssistance, effort, restSeconds, restRangeMinutes }) =>
      ({ name, sets, dose, loadOrAssistance, effort, restSeconds, restRangeMinutes })),
  }] } : null;
}

/** Budget the actual UTF-8 wire prompt after mandatory instructions, source
 * facts and repair directives. Optional retrieval never displaces a coach rule.
 * Invalid model output is diagnostic data, so a labelled prefix may be used. */
export function buildProgramPrompt({ system, instruction, evidence, number, continuity = null,
  repair = "", invalidOutput = "", references = [], query = "" }) {
  let prompt = `${instruction}\n${evidence}${repair}${omitted}`;
  if (bytes(system + prompt) > PROGRAM_PROMPT_BYTES) {
    throw new Error(`Tommy could not produce a complete week ${number}. The coach brief, current source prescriptions and client rules exceed the Mac model's bounded input size. Your saved draft and current program are kept; shorten the request context before retrying.`);
  }
  const remaining = () => PROGRAM_PROMPT_BYTES - bytes(system + prompt);
  if (invalidOutput) {
    const label = "\nPREVIOUS INVALID WEEK / DAY MODEL OUTPUT (diagnostic data, may be truncated):\n";
    let low = 0, high = Math.min(4000, invalidOutput.length);
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (bytes(label + invalidOutput.slice(0, mid)) <= remaining()) low = mid;
      else high = mid - 1;
    }
    if (low) prompt += label + invalidOutput.slice(0, low);
  }
  if (continuity) {
    const chunk = `\nPREVIOUS DRAFT WEEK / DAY CONTINUITY (not approved/completed history):\n${JSON.stringify(continuity)}\n`;
    if (bytes(chunk) <= remaining()) prompt += chunk;
  }
  if (references.length && remaining() > 1000) {
    let reference = buildReferenceContext(references, { query, weekNumber: number,
      maxCharacters: Math.min(12000, remaining()) });
    if (bytes(reference.text) > remaining()) reference = buildReferenceContext(references, { query, weekNumber: number,
      maxCharacters: Math.floor(remaining() / 4) });
    // Retrieval must include whole excerpts; an oversized catalog prefix alone
    // is not evidence and cannot be cut into an apparent source prescription.
    if (reference.citations.length && bytes("\n" + reference.text) <= remaining()) prompt += `\n${reference.text}`;
  }
  if (bytes(system + prompt) > PROGRAM_PROMPT_BYTES) throw new Error("Program prompt budget was exceeded");
  return prompt;
}
