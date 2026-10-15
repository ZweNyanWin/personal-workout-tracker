import test from "node:test";
import assert from "node:assert/strict";
import { extractWrittenPrescription, writtenPrescriptionProblems } from "./written-prescription.mjs";
import { generateProgram, dayOutputSchema } from "./program-generation.mjs";
import { resolveBriefRestPrescriptions } from "./rest-prescription.mjs";

const catalog = ["Bench Press", "Tempo Squat", "Dumbbell Row", "Plank", "Romanian Deadlift"].map((name,index) => ({ id: `73000000-0000-4000-8000-${String(index).padStart(12,"0")}`, name, equipment: name.includes("Dumbbell") ? "dumbbell" : name === "Plank" ? "bodyweight" : "barbell" }));
const scope = { startWeek: 6, weekCount: 1, daysPerWeek: 2 };
const brief = "Only week 6. Day 1. Bench Press top working group 1 × 3 at 91 kg, RPE 8, exact rest 3.2 min. Bench Press backoff working group 2 × 6 at 74 kg, RPE 7, exact rest 2.4 min. Day 2. Tempo Squat 3 × 4 at 83 kg, RPE 6.5, rest 2.2 min. Coach cue: descend for 3 seconds, pause for 1 second, rise with control; do not bounce. No additional working groups. No automatic progression.";

test("fully specified day/group prescriptions are imported without invoking a model", async () => {
  const draft = await generateProgram({ program: { brief, scope, exerciseCatalog: catalog }, system: "rules", signal: new AbortController().signal,
    chat: async () => { throw new Error("A numeric source import must not invoke a model"); } });
  assert.equal(draft.status,"proposed");
  const [day1, day2] = draft.weeks[0].days;
  assert.equal(day1.exercises.length,2);
  assert.deepEqual(day1.exercises.map(x => [x.sets,x.dose.range.min,x.loadOrAssistance,x.restSeconds]), [[1,3,"91 kg",192],[2,6,"74 kg",144]]);
  assert.equal(day2.exercises[0].dose.kind,"reps");
  assert.match(day2.exercises[0].notes,/descend for 3 seconds, pause for 1 second.*do not bounce/);
  assert.ok(draft.assumptions.every(x => !x.includes("client can")));
  assert.match(draft.progression,/coach approval/);
  assert.match(draft.regression,/control, comfort/);
  assert.ok(draft.weeks[0].days.every(x => !/\b\d+\s*(?:reps|sets|kg|min)\b/.test(x.warmup)));
});

test("minute rest remains tied to repeated identities and independent days across punctuation", () => {
  const contract = extractWrittenPrescription(brief,scope,catalog);
  const week = { number:6,days:contract.days };
  assert.deepEqual(resolveBriefRestPrescriptions(brief,week).map(x => x.restSeconds),[192,144,132]);
  const repeated = {number:1,days:[{number:1,exercises:[{name:"Bench Press",sets:3,dose:{kind:"reps",range:{min:5,max:5}},loadOrAssistance:"70 kg"}]},{number:2,exercises:[{name:"Bench Press",sets:3,dose:{kind:"reps",range:{min:5,max:5}},loadOrAssistance:"70 kg"}]}]};
  for (const source of ["Day 1 Bench Press rest 2 min, and day 2 Bench Press rest 3 min", "Day 1. Bench Press rest 2 min. Day 2. Bench Press rest 3 min."]) assert.deepEqual(resolveBriefRestPrescriptions(source,repeated).map(x=>x.restSeconds),[120,180]);
  assert.throws(() => resolveBriefRestPrescriptions("Day 1 Bench Press rest 2 min; Day 1 Bench Press rest 3 min",repeated),/conflicting/);
});

test("per-arm doses, one dumbbell, unknown barbell loads and true holds retain their distinct units", () => {
  const source="Day 1. Dumbbell Row 2 x 8 per arm using one 11 kg dumbbell, RPE 7, rest 1.6 min. Day 2. Plank 2 x 25 seconds, bodyweight, stop before position loss, rest 1 min.";
  const contract=extractWrittenPrescription(source,scope,catalog);
  assert.equal(contract.complete,true);
  assert.equal(contract.days[0].exercises[0].dose.perSide,true);
  assert.equal(contract.days[0].exercises[0].loadOrAssistance,"One 11 kg dumbbell");
  assert.equal(contract.days[1].exercises[0].dose.kind,"hold");
  assert.match(contract.days[1].exercises[0].effort,/position loss/);
  const unknown=extractWrittenPrescription("Romanian Deadlift 2 x 5 at an unknown working load, RPE 7, rest 2 min.",{...scope,daysPerWeek:1},catalog);
  assert.equal(unknown.complete,true);
  assert.match(unknown.days[0].exercises[0].loadOrAssistance,/not supplied/);
});

test("numerical source drift, extra groups and truncated source cues are rejected", () => {
  const contract=extractWrittenPrescription(brief,scope,catalog), week={number:6,days:structuredClone(contract.days)};
  assert.deepEqual(writtenPrescriptionProblems(week,contract),[]);
  week.days[0].exercises[0].sets++;
  week.days[1].exercises[0].notes="";
  week.days[1].exercises.push(week.days[1].exercises[0]);
  const errors=writtenPrescriptionProblems(week,contract).join(" ");
  assert.match(errors,/written sets/);assert.match(errors,/complete coach source cue/);assert.match(errors,/working-group count/);
});

test("equivalent JSON property order is accepted while changed dose endpoints are rejected", () => {
  const contract=extractWrittenPrescription(brief,scope,catalog),week={number:6,days:structuredClone(contract.days)};
  const item=week.days[0].exercises[0], dose=item.dose;
  item.dose={perSide:dose.perSide,range:{max:dose.range.max,min:dose.range.min},kind:dose.kind};
  assert.deepEqual(writtenPrescriptionProblems(week,contract),[]);
  item.dose.range.max++;
  assert.match(writtenPrescriptionProblems(week,contract).join(" "),/written dose/);
});

test("ambiguous multiweek/general distributions and incomplete loading are not silently imported", () => {
  assert.equal(extractWrittenPrescription("Bench Press on days 1 and 2, 3 x 5, RPE 7, rest 2 min.",scope,catalog),null);
  assert.equal(extractWrittenPrescription(brief,{...scope,weekCount:2},catalog).complete,false);
  assert.equal(extractWrittenPrescription("Bench Press 3 x 5, RPE 7, rest 2 min.",{...scope,daysPerWeek:1},catalog).complete,false);
  assert.equal(extractWrittenPrescription("Last recorded Bench Press 3 x 5 at 70 kg, RPE 7, rest 2 min.",{...scope,daysPerWeek:1},catalog),null);
});

test("pre-cancelled imports and incompatible home equipment do not return a draft", async () => {
  const controller=new AbortController();controller.abort();
  await assert.rejects(generateProgram({program:{brief,scope,exerciseCatalog:catalog},system:"rules",signal:controller.signal,chat:async()=>{throw Error("unexpected");}}),{name:"AbortError"});
  await assert.rejects(generateProgram({program:{brief:"Home workout with no equipment. Bench Press 3 x 5 at 70 kg, RPE 7, rest 2 min.",scope:{...scope,daysPerWeek:1},exerciseCatalog:[catalog[0]]},system:"rules",signal:new AbortController().signal,chat:async()=>{throw Error("unexpected");}}),/no choices compatible/);
});
test("explicit same-variation days and inline day labels retain reductions without progression", () => {
  const source="Only week 6. Bench Press day 1 is 3 x 4 at 76 kg RPE 7 rest exactly 2.6 min. Day 2 deliberately lighter: 1 x 4 at 69 kg RPE 6 rest exactly 2.1 min. No additional working groups.";
  const contract=extractWrittenPrescription(source,scope,catalog);
  assert.equal(contract.complete,true);
  assert.deepEqual(contract.days.map(day=>day.exercises.map(x=>[x.name,x.sets,x.loadOrAssistance,x.restSeconds])),[[["Bench Press",3,"76 kg",156]],[["Bench Press",1,"69 kg",126]]]);
  const ambiguous=extractWrittenPrescription("Day 1. Bench Press 2 x 3 at 71 kg RPE 7 rest 2 min. Add Cable Fly 3 x 12 at 10 kg RPE 7 rest 1 min.",{...scope,daysPerWeek:1},catalog);
  assert.equal(ambiguous.complete,false);assert.match(ambiguous.issues.join(" "),/no unambiguous saved-library identity/);
});

test("one explicitly shared dumbbell and qualitative hold cues retain source facts", () => {
  const source="Equipment: exactly one 11 kg dumbbell and floor. Day 1. Dumbbell Row 2 x 7 per arm using that one dumbbell RPE 8 has no written rest. Day 2. Plank 2 holds of 19 seconds, bodyweight, end before position loss, rest exactly 1.2 min.";
  const contract=extractWrittenPrescription(source,scope,catalog);
  assert.equal(contract.complete,true);
  assert.equal(contract.days[0].exercises[0].loadOrAssistance,"One 11 kg dumbbell");
  assert.deepEqual(contract.days[0].exercises[0].restRangeMinutes,{min:4,max:6});
  assert.equal(contract.days[1].exercises[0].dose.seconds.min,19);
  assert.equal(contract.days[1].exercises[0].restSeconds,72);
});

test("per-hand implements remain explicit and unspecified loads cannot inherit a forbidden kilogram example", () => {
  const source="Dumbbell Row 2 x 6 with 13 kg per hand RPE 8 rest 2 min.";
  const group=extractWrittenPrescription(source,{...scope,daysPerWeek:1},catalog).days[0].exercises[0];
  assert.equal(group.loadOrAssistance,"13 kg dumbbell per hand");
  const unknown=extractWrittenPrescription("Romanian Deadlift 2 x 5 with working weight unknown; do not invent 52 kg. RPE 7 rest 2 min.",{...scope,daysPerWeek:1},catalog);
  assert.equal(unknown.complete,true);
  assert.match(unknown.days[0].exercises[0].loadOrAssistance,/not supplied/);
  assert.doesNotMatch(unknown.days[0].exercises[0].loadOrAssistance,/52/);
  const fractional=extractWrittenPrescription("Bench Press 2 x 4 at 69 kg RPE 7 rest 1.001 min.",{...scope,daysPerWeek:1},catalog);
  assert.equal(fractional.complete,false);
  assert.match(fractional.issues.join(" "),/whole-second precision/);
});

test("written main-lift RPE ranges constrain a scalar proposal and preserve the full cue", () => {
  const contract=extractWrittenPrescription("Day 1. Bench Press 1x1 @ 91 kg (RPE 7–7.5).", {...scope,daysPerWeek:1},catalog);
  assert.equal(contract.complete,false);
  assert.equal(contract.topologyComplete,true);
  const day=contract.days[0],schema=dayOutputSchema(6,day,undefined,undefined,day).properties.day.properties.exercises.properties.group1;
  assert.deepEqual(schema.properties.effort,{enum:["RPE 7","RPE 7.5"]});
  assert.deepEqual(schema.properties.reps,{const:1});
  const week={number:6,days:structuredClone(contract.days)};
  week.days[0].exercises[0].effort="RPE 7.5";
  assert.deepEqual(writtenPrescriptionProblems(week,contract),[]);
  week.days[0].exercises[0].effort="RPE 8";
  assert.match(writtenPrescriptionProblems(week,contract).join(" "),/written effort/);
  assert.match(day.exercises[0].notes,/RPE 7–7.5/);
});

test("numbered skill attempts retain their count and order without inventing a source hold duration", () => {
  const entries=[...catalog,{id:"73000000-0000-4000-8000-999999999999",name:"Handstand Practice",equipment:"bodyweight"}];
  const contract=extractWrittenPrescription("Day 1 — Practice\n1. Handstand Practice: 5–8 attempts\n2. Plank: 2x20 sec, bodyweight, easy, rest 1 min.", {...scope,daysPerWeek:1},entries);
  assert.equal(contract.complete,false);
  assert.equal(contract.topologyComplete,true);
  const day=contract.days[0],skill=day.exercises[0];
  assert.equal(skill.name,"Handstand Practice");
  assert.deepEqual(skill.attempts,{min:5,max:8});
  assert.equal(skill.dose,null);
  const schema=dayOutputSchema(6,day,undefined,undefined,day).properties.day.properties.exercises.properties.group1;
  assert.deepEqual(schema.properties.sets,{type:"integer",minimum:5,maximum:8});
  assert.equal(schema.properties.dose.properties.kind.const,"hold");
  const week={number:6,days:structuredClone(contract.days)};
  Object.assign(week.days[0].exercises[0],{sets:6,dose:{kind:"hold",seconds:{min:5,max:5}},loadOrAssistance:"Bodyweight",effort:"Stop before position loss",restSeconds:60});
  assert.deepEqual(writtenPrescriptionProblems(week,contract),[]);
  week.days[0].exercises[0].sets=3;
  assert.match(writtenPrescriptionProblems(week,contract).join(" "),/attempt count/);
  assert.match(skill.notes,/duration.*proposed.*not supplied/);
});
