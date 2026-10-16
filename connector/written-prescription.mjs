import { isMainCompound, mainCompoundProblems, exerciseDoseProblems, mainRpeValue } from "../lib/coach/exercise-rules.mjs";
import { isDeepStrictEqual } from "node:util";

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boundaries = /\b(?:This is an? |No additional working|No automatic progression|Keep status proposed|Keep warmups separate|Keep warm-ups separate|Regress only|Day\s*#?\s*\d+\b)/i;
const n = "(\\d+(?:\\.\\d+)?)";

export function hasNegativeWrittenReserve(text) {
  return /(?:^|[\s(:])[-−–]\s*\d+(?:\.\d+)?(?:\s*(?:[-–—]|to)\s*[-−–]?\s*\d+(?:\.\d+)?)?\s*RIR\b|\b\d+(?:\.\d+)?\s*(?:[-–—]|to)\s*[-−–]\s*\d+(?:\.\d+)?\s*RIR\b|\bRIR\s*[:=]?\s*[-−–]\s*\d/i.test(text);
}

/** A deliberately bounded import grammar, not an interpretation of free-form
 * programming. Only catalog identities immediately followed by a numerical
 * dose are source prescriptions. Ambiguous/missing fields keep the model path
 * under validation; no historical or percentage-derived load is calculated. */
export function extractWrittenPrescription(brief, scope, catalog = []) {
  if (!catalog.length || /\|\s*(?:Exercise|Movement)\s*\|/i.test(brief)) return null;
  const hits = catalog.flatMap(entry => {
    const pattern = new RegExp(`\\b${escape(entry.name).replace(/(?:\\-|\s)+/g, "[\\s—–-]+")}\\b`, "gi");
    return [...brief.matchAll(pattern)].map(hit => ({ index: hit.index, end: hit.index + hit[0].length, entry }));
  }).sort((a,b) => a.index - b.index || b.end - a.end);
  const identities = hits.filter((hit, index) => !hits.some((other, j) => j !== index && other.index <= hit.index && other.end >= hit.end && other.end - other.index > hit.end - hit.index));
  // Explicit anaphora can retain the last named variation, never select a new
  // exercise. A deliberately lighter day is resolved only in a one-name brief.
  const namedIdentities = new Set(identities.map(hit => hit.entry.name));
  for (const hit of brief.matchAll(/\b(?:same variation|deliberately lighter)\s*:?/gi)) {
    const previous = identities.filter(identity => identity.end < hit.index).at(-1);
    if (previous && (!/lighter/i.test(hit[0]) || namedIdentities.size === 1)) identities.push({ index: hit.index, end: hit.index + hit[0].length, entry: previous.entry, alias: true });
  }
  identities.sort((a,b) => a.index - b.index);
  const found = [];
  for (const hit of identities) {
    const prior = brief.slice(Math.max(0, hit.index - 100), hit.index).split(/[.;\n]/).at(-1);
    if (/\b(?:previous|last|completed|recorded|historical|reference)\b/i.test(prior)) continue;
    const nextName = identities.find(other => other.index >= hit.end)?.index ?? brief.length;
    let dose = /^(?:(?![.;\n]).){0,75}?\b(\d+)\s*[x×]\s*(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?/i.exec(brief.slice(hit.end, nextName));
    const hold = !dose && /^(?:(?![.;\n]).){0,75}?\b(\d+)\s+holds?\s+of\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?\s*seconds?\b/i.exec(brief.slice(hit.end, nextName));
    dose ||= hold;
    if (dose) found.push({ ...hit, dose, writtenHold: !!hold, doseEnd: hit.end + dose[0].length });
  }
  if (!found.length) return null;
  // A general weekly instruction is not a day-specific import. Leave its
  // distribution to the reviewed model path rather than inventing a day.
  if (scope.daysPerWeek > 1 && !/\bday\s*#?\s*\d+\b/i.test(brief)) return null;
  const days = [], issues = [];
  const numericalGroups = [...brief.matchAll(/\b\d+\s*(?:[x×]\s*\d+(?:\s*(?:[-–]|to)\s*\d+)?|holds?\s+of\s+\d+(?:\s*(?:[-–]|to)\s*\d+)?\s*seconds?)/gi)];
  if (numericalGroups.length !== found.length) issues.push("A numerical working group has no unambiguous saved-library identity. Add the exact exercise or clarify its source before drafting.");
  for (const [index, hit] of found.entries()) {
    const prefix = brief.slice(0, hit.doseEnd);
    const day = Number([...prefix.matchAll(/\bday\s*#?\s*(\d+)\b/gi)].at(-1)?.[1] ?? (scope.daysPerWeek === 1 ? 1 : NaN));
    if (!Number.isInteger(day) && scope.daysPerWeek > 1) return null;
    const week = Number([...prefix.matchAll(/\bweek\s*#?\s*(\d+)\b/gi)].at(-1)?.[1] ?? scope.startWeek);
    let end = found[index + 1]?.index ?? brief.length;
    const nextLine=brief.lastIndexOf("\n",end-1)+1;
    // The next row's number belongs to that row, not this group's source cue.
    if(nextLine>hit.index && /^\s*\d+[.)]\s*$/.test(brief.slice(nextLine,end)))end=nextLine;
    let source = brief.slice(hit.index, end).trim();
    const boundary = boundaries.exec(source.slice(hit.doseEnd - hit.index));
    if (boundary) source = source.slice(0, hit.doseEnd - hit.index + boundary.index).trim();
    const body = source.slice(hit.end - hit.index);
    if(hasNegativeWrittenReserve(body))issues.push("A negative written reserve target needs clarification; no sign was removed.");
    const seconds = (hit.writtenHold || /^\s*(?:sec(?:ond)?s?|s)\b/i.test(brief.slice(hit.doseEnd))) && !isMainCompound(hit.entry.name);
    const sets = Number(hit.dose[1]), min = Number(hit.dose[2]), max = Number(hit.dose[3] ?? hit.dose[2]);
    const rpe = new RegExp(`\\bRPE\\s*[:=]?\\s*${n}(?:\\s*(?:[-–]|to)\\s*${n})?`, "i").exec(body);
    const rest = new RegExp(`\\brest(?:\\s+time)?\\s*[:=]?\\s*(?:exactly\\s+)?${n}(?:\\s*(?:[-–]|to)\\s*${n})?\\s*(min(?:ute)?s?|sec(?:ond)?s?)\\b`, "i").exec(body);
    const restMin = rest ? Number(rest[1]) * (/^m/i.test(rest[3]) ? 60 : 1) : null;
    const restMax = rest ? Number(rest[2] ?? rest[1]) * (/^m/i.test(rest[3]) ? 60 : 1) : null;
    const loadText = body.split(/\b(?:RPE|rest|coach\s+cue)\b/i)[0];
    const mass = new RegExp(`\\b${n}\\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\\b`, "i").exec(loadText);
    const unknown = /\b(?:unknown|not\s+(?:supplied|provided|known)|unspecified)\b/i.test(loadText) || /\bworking\s+(?:weight|load)\b.{0,35}\b(?:unknown|not supplied|unspecified)\b/i.test(body);
    const bodyweight = /\bbody[- ]?weight\b/i.test(loadText);
    const one = /\b(?:one|single)\b/i.test(loadText) && /\bdumbbell\b/i.test(hit.entry.name + loadText);
    const eachHand = /\b(?:per|each)\s+hand\b/i.test(loadText);
    const inventory = /\bequipment\s*:\s*(?:exactly\s+)?one\s+(\d+(?:\.\d+)?)\s*(kg|lb)\s+dumbbell\b/i.exec(brief);
    const inheritedDumbbell = inventory && /\b(?:that|the)\s+one\s+dumbbell\b/i.test(loadText) ? `One ${inventory[1]} ${inventory[2].toLowerCase()} dumbbell` : null;
    const dumbbell = /\bdumbbell\b/i.test(hit.entry.name + loadText) || hit.entry.equipment === "dumbbell";
    const load = unknown ? `${hit.entry.equipment ?? "External load"}; working weight not supplied`
      : mass ? `${one ? "One " : ""}${mass[1]} ${/^k/i.test(mass[2]) ? "kg" : "lb"}${dumbbell ? " dumbbell" : ""}${eachHand ? " per hand" : ""}`
      : bodyweight ? "Bodyweight" : null;
    const accessoryReserve = !isMainCompound(hit.entry.name) ? /\b(?:last\s+set\s+)?\d+(?:\.\d+)?(?:\s*(?:[-–]|to)\s*\d+(?:\.\d+)?)?\s*RIR\b|\b(?:last\s+set\s+)?RIR\s*[:=]?\s*\d+(?:\.\d+)?(?:\s*(?:[-–]|to)\s*\d+(?:\.\d+)?)?/i.exec(body)?.[0]?.replace(/\s+to\s+/i,"–") : null;
    const accessoryFailure = !isMainCompound(hit.entry.name) ? /\blast\s+set\s+(?:to\s+)?failure\b/i.exec(body)?.[0] : null;
    const explicitEffort = [rpe ? `RPE ${rpe[1]}${rpe[2] ? `–${rpe[2]}` : ""}` : null, accessoryReserve, accessoryFailure].filter(Boolean).join("; ");
    const effort = explicitEffort || /\b(?:(?:stop|end)\s+before\s+(?:position|form)\s+loss|easy|comfortable)\b/i.exec(body)?.[0];
    const item = { name: hit.entry.name, sets, dose: seconds ? { kind: "hold", seconds: { min, max } }
      : { kind: "reps", range: { min, max }, perSide: /\b(?:per|each)\s+(?:side|leg|arm)\b/i.test(body) },
      loadOrAssistance: load ?? inheritedDumbbell, effort, restSeconds: restMin !== null ? Math.round((restMin + restMax) / 2) : null,
      restIsExplicit: !!rest, notes: `Coach source: ${source}` };
    if (!rest && rpe && Number(rpe[2] ?? rpe[1]) > 7.5) {
      item.restSeconds = 300;
      item.restRangeMinutes = { min: 4, max: 6 };
    }
    if (restMin !== restMax && restMin !== null) item.notes += ` Timer starts at ${item.restSeconds / 60} min; written range remains in the source cue.`;
    if (restMin !== null && [restMin, restMax].some(value => Math.abs(value - Math.round(value)) > 1e-8)) issues.push("An explicit rest duration needs whole-second precision; clarify it rather than rounding the coach's value.");
    if (!Number.isInteger(day) || day < 1 || day > scope.daysPerWeek || week !== scope.startWeek) issues.push("Each written group needs an unambiguous day in the requested week.");
    if (sets < 1 || sets > 10 || min < 1 || max < min || max > (seconds ? 120 : 100)) issues.push("The written working dose is outside the supported bounds.");
    if (item.notes.length > 400) issues.push("The complete coach source cue exceeds the bounded note size; shorten it without dropping instructions.");
    const rangeChoice = isMainCompound(item.name) && rpe?.[2] && Number(rpe[1]) >= 5 && Number(rpe[2]) <= 10 && Number(rpe[1]) <= Number(rpe[2]) && [Number(rpe[1]),Number(rpe[2])].every(value=>Number.isInteger(value*2));
    if (load && effort) issues.push(...mainCompoundProblems(rangeChoice ? {...item,effort:`RPE ${rpe[1]}`} : item), ...exerciseDoseProblems(item));
    const heading = [...brief.matchAll(new RegExp(`^[\\t ]*Day\\s*#?\\s*${day}\\s*[—–-]\\s*([^\\r\\n]+)`, "gim"))].at(-1)?.[1]?.trim();
    const record = days.find(value => value.number === day) ?? { number: day, title: heading ?? `Day ${day}`, exercises: [] };
    if (!days.includes(record)) days.push(record);
    record.exercises.push(item);
  }
  // A numbered source skill may prescribe attempts without a hold duration.
  // Keep its attempt count distinct; any duration is explicitly a proposal.
  let extraRows=0;
  for(const hit of identities.filter(hit=>!found.some(source=>source.index===hit.index))) {
    const lineStart=brief.lastIndexOf("\n",hit.index-1)+1;
    if(!/^\s*\d+[.)]\s*$/.test(brief.slice(lineStart,hit.index)))continue;
    const source=brief.slice(hit.index,brief.indexOf("\n",hit.index) < 0 ? brief.length : brief.indexOf("\n",hit.index)).trim();
    const attempts=/\b(\d+)(?:\s*[-–]\s*(\d+))?\s+attempts?\b/i.exec(source);
    if(!attempts)continue;
    const day=Number([...brief.slice(0,hit.index).matchAll(/\bday\s*#?\s*(\d+)\b/gi)].at(-1)?.[1] ?? (scope.daysPerWeek===1 ? 1 : NaN));
    const record=days.find(value=>value.number===day);
    if(!record)continue;
    const min=Number(attempts[1]),max=Number(attempts[2]??attempts[1]);
    if(min<1 || max<min || max>10){issues.push("The written skill attempt count needs clarification within 1–10 attempts.");continue;}
    const next=found.find(value=>value.index>hit.index && Number([...brief.slice(0,value.index).matchAll(/\bday\s*#?\s*(\d+)\b/gi)].at(-1)?.[1])===day);
    const position=next ? record.exercises.findIndex(item=>item.notes.startsWith(`Coach source: ${brief.slice(next.index,next.end)}`)) : -1;
    const item={name:hit.entry.name,sets:null,dose:null,loadOrAssistance:null,effort:null,restSeconds:null,restIsExplicit:false,attempts:{min,max},
      notes:`Coach source: ${source} Each set is one attempt. Hold duration, if shown, is proposed for review; it was not supplied.`};
    if(position<0)record.exercises.push(item);else record.exercises.splice(position,0,item);
    extraRows++;
  }
  const complete = scope.weekCount === 1 && found.length === identities.length && !issues.length && days.length === scope.daysPerWeek && days.every(day => day.exercises.length <= 12 && day.exercises.every(item =>
    (!isMainCompound(item.name) || mainRpeValue(item.effort)!==null) &&
    item.loadOrAssistance && item.effort && Number.isInteger(item.restSeconds) && item.restSeconds >= 15 && item.restSeconds <= 600));
  const topologyComplete = scope.weekCount === 1 && found.length+extraRows === identities.length && !issues.length
    && days.length === scope.daysPerWeek && days.every(day => day.exercises.length <= 12 && day.exercises.every(item =>
      !isMainCompound(item.name) || (item.dose?.kind === "reps" && item.dose.range.min === item.dose.range.max)));
  return { days: days.sort((a,b) => a.number - b.number), complete, topologyComplete,
    closed: /\b(?:no|without)\s+(?:additional|extra|other)\s+working\s+(?:groups|sets|exercises)\b/i.test(brief), issues: [...new Set(issues)] };
}

export function writtenPrescriptionProblems(week, contract) {
  if (!contract) return [];
  const issues = [...contract.issues];
  for (const day of contract.days) {
    const actual = week.days?.find(item => item.number === day.number)?.exercises ?? [];
    if ((contract.complete || contract.closed) && actual.length !== day.exercises.length) issues.push(`Day ${day.number} changed the written working-group count.`);
    for (const [index, source] of day.exercises.entries()) {
      const next = actual[index];
      for (const field of ["name", "sets", "dose", "loadOrAssistance", "effort", "restSeconds"]) {
        const bounds=field==="effort" && isMainCompound(source.name) ? /^RPE\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/.exec(source.effort??"") : null;
        if(bounds && mainRpeValue(next?.effort)!==null && mainRpeValue(next.effort)>=Number(bounds[1]) && mainRpeValue(next.effort)<=Number(bounds[2]))continue;
        if (source[field] !== null && source[field] !== undefined && !isDeepStrictEqual(source[field], next?.[field])) issues.push(`Day ${day.number}, group ${index + 1} changed its written ${field}.`);
      }
      if(source.attempts && (next?.sets<source.attempts.min || next?.sets>source.attempts.max))issues.push(`Day ${day.number}, group ${index+1} changed the source skill attempt count.`);
      if(source.setsBounds && (next?.sets<source.setsBounds.min || next?.sets>source.setsBounds.max))issues.push(`Day ${day.number}, group ${index+1} changed the source set-count bounds.`);
      if(source.effortCeiling && (mainRpeValue(next?.effort)===null || mainRpeValue(next.effort)>source.effortCeiling))issues.push(`Day ${day.number}, group ${index+1} exceeded the source effort ceiling.`);
      if (!String(next?.notes ?? "").includes(source.notes)) issues.push(`Day ${day.number}, group ${index + 1} dropped its complete coach source cue.`);
    }
  }
  return [...new Set(issues)];
}

/** User-facing prose is grounded in source instructions rather than an LLM's
 * unsupported readiness claims or extra working-load warmup prescriptions. */
export function groundDraftNarrative(value, program) {
  if (program.markdownPrescription) return value;
  value.assumptions = ["Proposed draft for coach review; it is not assigned or evidence of completed work.",
    "A listed exercise or prescribed load does not establish personal readiness, equipment safety or ability.",
    "Only the supplied coach instructions authorize changes to this prescription."];
  value.progression = "Follow the coach's explicit progression instructions. Obtain coach approval before changing any dose or load; no automatic progression is inferred.";
  value.regression = "If control, comfort or the target is lost, stop the set and ask the coach to review an appropriate change. No rehabilitation or automatic load adjustment is inferred.";
  for (const day of value.week.days) {
    const source = program.sourceWeeks?.find(week => week.number === value.week.number)?.days.find(item => item.number === day.number);
    // Existing coach warmups remain source data; fresh vague briefs cannot
    // authorize an additional numerical warmup or full working-load sets.
    const written = /(?:^|\n)\s*(?:warm[- ]?up)\s*:\s*([^\n]{1,350})/i.exec(program.brief)?.[1];
    day.warmup = written ? `Coach-supplied warm-up: ${written}` : source?.warmup ?? "Confirm a gradual, familiar warm-up with your coach, separate from the working sets. No additional numerical warm-up dose is prescribed here.";
  }
  return value;
}
