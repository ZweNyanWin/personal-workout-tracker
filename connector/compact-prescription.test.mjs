import test from "node:test";
import assert from "node:assert/strict";
import { extractCompactPrescription } from "./compact-prescription.mjs";
import { extractWrittenPrescription, writtenPrescriptionProblems } from "./written-prescription.mjs";
import { generateProgram } from "./program-generation.mjs";
import { PROGRAM_PROMPT_BYTES } from "./program-prompt.mjs";
import { explicitlyNamedReferences } from "./references.mjs";

// Fictional development source, independent of private coach programs.
const names = ["Low-Bar Squat", "Bulgarian Split Squat", "Bench Press", "Weighted Pull-up", "Pull-up", "Chest-Supported Row", "Cable Fly", "Tricep Pushdown", "Conventional Deadlift", "Romanian Deadlift", "Hamstring Curl", "Hanging Leg Raise", "Larsen Press", "Lateral Raise", "Biceps Curl", "Handstand Practice", "L-Sit"];
const catalog = names.map((name,index)=>({ id:`89000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`, name, equipment:/Handstand|L-Sit|Hanging|^Pull-up/.test(name)?"bodyweight":"other" }));
const scope = {startWeek:2,weekCount:1,daysPerWeek:4};
const first = `Day 1 — Lower A
1. Low-Bar Squat Single: 1x1 @ 93 kg RPE 7 rest 2 min
2. Low-Bar Squat Backdown: 2x3 @ 76 kg RPE 7 rest 2 min
3. Bulgarian Split Squat: 2x9 @ bodyweight RPE 7 rest 2 min
Day 2 — Upper A
1. Bench Press Single: 1x1 @ 63 kg RPE 7 rest 2 min
2. Weighted Pull-up: 2x6 @ 13 lb RPE 7 rest 2 min
3. Chest-Supported Row: 2x9 @ 16 kg RPE 7 rest 2 min
4. Cable Fly: 2x12 @ 7 kg RPE 7 rest 2 min
5. Tricep Pushdown: 2x12 @ 9 kg RPE 7 rest 2 min
Day 3 — Lower B
1. Conventional Deadlift Single: 1x1 @ 123 kg RPE 7 rest 2 min
2. Conventional Deadlift Backdown: 2x3 @ 103 kg RPE 7 rest 2 min
3. Romanian Deadlift: 2x8 @ 66 kg RPE 7 rest 2 min
4. Hamstring Curl: 2x10 @ 18 kg RPE 7 rest 2 min
5. Hanging Leg Raise: 2x10 @ bodyweight RPE 7 rest 2 min
Day 4 — Upper B
1. Larsen Press: 2x6 @ 49 kg RPE 7 rest 2 min
2. Lateral Raise: 2x12 @ 4 kg RPE 7 rest 2 min
3. Biceps Curl: 2x10 @ 6 kg RPE 7 rest 2 min
4. Handstand Practice: 3 holds of 8 seconds bodyweight RPE 7 rest 2 min
5. L-Sit: 3 holds of 12 seconds bodyweight RPE 7 rest 2 min`;
const reference = extractWrittenPrescription(first,{...scope,startWeek:1},catalog);
const compact = `WEEK 2 — Written shorthand
* Lower A: Squat Single: 95.5 kg | Backdown: 2x3 @ 78 kg | Bulgarian: 2x8–10
* Upper A: Bench Single: 65 kg | Pull-up: 2x8 bodyweight | Row/Fly/Pushdown: 2 sets each
* Lower B: Deadlift: 125 x1 | 105 2x3 | RDL: 67.5 2x8 | Ham Curl/Abs: 2 easy sets
* Upper B: Larsen: 2x6 @ 50 kg | Lateral/Curl: 2 sets each | Handstand + L-Sit
No failure this week.`;

function filled(schema) {
  if(Object.hasOwn(schema,"const"))return schema.const;
  if(schema.enum)return schema.enum[0];
  if(schema.oneOf)return filled(schema.oneOf[0]);
  if(schema.type==="object")return Object.fromEntries(Object.entries(schema.properties).map(([key,child])=>[key,filled(child)]));
  if(schema.type==="integer")return schema.minimum??1;
  if(schema.type==="boolean")return false;
  return "External load; working weight not supplied";
}
const response = value => ({done:true,done_reason:"stop",message:{content:JSON.stringify(value)}});

test("compact weeks ground aliases, roles, composite accessories, units and bodyweight without rewriting source",()=>{
  assert.equal(reference.topologyComplete,true);
  const source=extractCompactPrescription(compact,scope,catalog,reference);
  assert.deepEqual(source.issues,[]);assert.equal(source.topologyComplete,true);
  assert.deepEqual(source.days.map(day=>day.exercises.length),[3,5,5,5]);
  assert.deepEqual(source.days[0].exercises.slice(0,2).map(item=>[item.name,item.sets,item.dose.range.min,item.loadOrAssistance]),[["Low-Bar Squat",1,1,"95.5 kg"],["Low-Bar Squat",2,3,"78 kg"]]);
  assert.equal(source.days[1].exercises[1].name,"Pull-up");assert.equal(source.days[1].exercises[1].loadOrAssistance,"Bodyweight");
  assert.deepEqual(source.days[2].exercises.slice(0,3).map(item=>[item.name,item.sets,item.dose.range.min,item.loadOrAssistance]),[["Conventional Deadlift",1,1,"125 kg"],["Conventional Deadlift",2,3,"105 kg"],["Romanian Deadlift",2,8,"67.5 kg"]]);
  assert.match(source.days[2].exercises[0].notes,/unit is proposed/);
  assert.deepEqual(source.days[2].exercises.slice(3).map(item=>item.effort),["Easy, comfortable effort","Easy, comfortable effort"]);
  assert.deepEqual(source.days[3].exercises.map(item=>item.name),["Larsen Press","Lateral Raise","Biceps Curl","Handstand Practice","L-Sit"]);
  assert.equal(source.days[3].exercises[0].effortCeiling,9.5);
});

test("source-set ranges and single effort caps remain enforced against model proposals",()=>{
  const brief=compact.replace("Lateral/Curl: 2 sets each","Lateral/Curl: 2–3 sets each").replace("No failure this week.","Do not exceed about RPE 8–8.5 on the singles.");
  const source=extractCompactPrescription(brief,scope,catalog,reference);
  assert.deepEqual(source.issues,[]);
  const week={number:2,days:structuredClone(source.days)};
  for(const day of week.days)for(const item of day.exercises){if(item.effortCeiling)item.effort="RPE 8";if(item.setsBounds)item.sets=2;}
  assert.deepEqual(writtenPrescriptionProblems(week,source),[]);
  week.days[0].exercises[0].effort="RPE 9";week.days[3].exercises[1].sets=4;
  assert.match(writtenPrescriptionProblems(week,source).join(" "),/effort ceiling/);
  assert.match(writtenPrescriptionProblems(week,source).join(" "),/set-count bounds/);
});

test("ambiguous aliases, absent source reference, missing days and conflicting failure targets fail closed",()=>{
  assert.equal(extractCompactPrescription(compact,scope,catalog,null),null);
  assert.ok(extractCompactPrescription(compact.replace("Larsen:","L:"),scope,catalog,reference).issues.length);
  assert.ok(extractCompactPrescription(compact.replace(/^\* Upper B:.*$/m,""),scope,catalog,reference).issues.length);
  assert.match(extractCompactPrescription(compact.replace("Bulgarian: 2x8–10","Bulgarian: 2x8–10, 0 RIR"),scope,catalog,reference).issues.join(" "),/no-failure/);
});

test("twelve mixed written weeks need eleven omission calls and preserve every numeric single and backdown",async()=>{
  const brief=`WEEK 1 — Full source\n${first}\n`+Array.from({length:11},(_,index)=>compact.replace("WEEK 2",`WEEK ${index+2}`).replace("95.5 kg",`${96+index} kg`)).join("\n");
  let calls=0;
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:12,daysPerWeek:4},exerciseCatalog:catalog},system:"Use only supplied facts.",signal:new AbortController().signal,chat:async({format,messages})=>{
    calls++;assert.ok(format.properties.days,"Known source topology skips outline and full-day generation");
    assert.ok(Buffer.byteLength(messages[0].content+messages[1].content)<=PROGRAM_PROMPT_BYTES);
    assert.ok(!JSON.stringify(format).includes("95.5 kg"),"The model emits omissions, not source loads");
    return response(filled(format));
  }});
  assert.equal(calls,11);assert.equal(draft.weeks.length,12);assert.equal(draft.status,"proposed");
  for(let n=1;n<12;n++){
    const day=draft.weeks[n].days[0];assert.equal(day.exercises[0].loadOrAssistance,`${95+n} kg`);assert.equal(day.exercises[0].dose.range.min,1);
    assert.equal(day.exercises[1].loadOrAssistance,"78 kg");assert.equal(day.exercises[1].dose.range.min,3);
    assert.deepEqual(draft.weeks[n].days.map(day=>day.exercises.length),[3,5,5,5]);
  }
});

test("a malformed omission batch uses bounded day repair; source edits cannot enter the returned draft",async()=>{
  const brief=`WEEK 1\n${first}\n${compact}`;let calls=0;
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:2,daysPerWeek:4},exerciseCatalog:catalog},system:"rules",signal:new AbortController().signal,chat:async({format})=>{
    calls++;if(format.properties.days)return response({days:{},injectedLoad:"999 kg"});return response(filled(format));
  }});
  assert.equal(calls,5,"One rejected batch plus four bounded day calls");
  assert.equal(draft.weeks[1].days[0].exercises[0].loadOrAssistance,"95.5 kg");
  assert.ok(!JSON.stringify(draft).includes("999 kg"));
});

test("explicit rest stays with its shorthand group even above RPE 7.5",async()=>{
  const brief=`WEEK 1\n${first}\n${compact.replace("Larsen: 2x6 @ 50 kg","Larsen: 2x6 @ 50 kg RPE 8 rest 2.4 min")}`;
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:2,daysPerWeek:4},exerciseCatalog:catalog},system:"rules",signal:new AbortController().signal,chat:async({format})=>response(filled(format))});
  const group=draft.weeks[1].days[3].exercises[0];assert.equal(group.restSeconds,144);assert.equal(group.restRangeMinutes,undefined);
});

test("formatting keeps named reference templates and excludes unrelated exercise-word retrieval",()=>{
  const library=[{title:"Bullmastiff",aliases:["Bullmastiff","block"]},{title:"A different template",aliases:["bench press"]}];
  assert.deepEqual(explicitlyNamedReferences(library,"Import my supplied source unchanged."),[]);
  assert.deepEqual(explicitlyNamedReferences(library,"Use Bullmastiff style for the missing weeks."),[library[0]]);
});

test("only the invalid day of a bounded batch is repaired and cancellation cannot return a partial block",async()=>{
  const brief=`WEEK 1\n${first}\n${compact}`;let calls=0;
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:2,daysPerWeek:4},exerciseCatalog:catalog},system:"rules",signal:new AbortController().signal,chat:async({format})=>{
    calls++;const value=filled(format);
    if(format.properties.days)value.days.day1.groups.group1.effort="RPE 10";
    return response(value);
  }});
  assert.equal(calls,2);assert.equal(draft.weeks[1].days[0].exercises[0].effort,"RPE 5");
  const controller=new AbortController();
  await assert.rejects(generateProgram({program:{brief,scope:{startWeek:1,weekCount:2,daysPerWeek:4},exerciseCatalog:catalog},system:"rules",signal:controller.signal,chat:async({format})=>{
    controller.abort();return response(filled(format));
  }}),{name:"AbortError"});
});

test("an accessory clause ending in each before the next WEEK heading never becomes a global directive",async()=>{
  const second=compact.replace("\nNo failure this week.","").replace("Handstand + L-Sit","Handstand + L-Sit | Lateral/Curl: 2 sets each");
  // Keep one occurrence per prescribed accessory for this source variant.
  const source=second.replace(" | Lateral/Curl: 2 sets each | Handstand", " | Handstand");
  let calls=0;
  const draft=await generateProgram({program:{brief:`WEEK 1\n${first}\n${source}\n${source.replace("WEEK 2","WEEK 3")}`,scope:{startWeek:1,weekCount:3,daysPerWeek:4},exerciseCatalog:catalog},system:"rules",signal:new AbortController().signal,chat:async({format})=>{calls++;assert.ok(format.properties.days);return response(filled(format));}});
  assert.equal(calls,2);assert.equal(draft.weeks.length,3);
});

test("sets-only and attempts-only clauses retain independent written load, effort and rest",()=>{
  const source=extractCompactPrescription(compact.replace("Lateral/Curl: 2 sets each","Lateral Raise: 2 sets @ 8 kg RPE 8 rest 2 min | Curl: 2 sets each").replace("Handstand + L-Sit","Handstand: 5–7 attempts bodyweight RPE 7 rest 1.5 min | L-Sit"),scope,catalog,reference);
  assert.deepEqual(source.issues,[]);
  const lateral=source.days[3].exercises[1], skill=source.days[3].exercises[3];
  assert.deepEqual([lateral.sets,lateral.dose,lateral.loadOrAssistance,lateral.effort,lateral.restSeconds,lateral.restIsExplicit],[2,null,"8 kg","RPE 8",120,true]);
  assert.deepEqual([skill.attempts,skill.dose,skill.loadOrAssistance,skill.effort,skill.restSeconds],[{min:5,max:7},null,"Bodyweight","RPE 7",90]);
});

test("last-set RIR scope and ranges stay literal and a conflicting accessory-wide rule never overwrites them",()=>{
  const source=extractCompactPrescription(compact.replace("Bulgarian: 2x8–10","Bulgarian: 2x8–10 (last set 1–2 RIR)"),scope,catalog,reference);
  assert.deepEqual(source.issues,[]);assert.equal(source.days[0].exercises[2].effort,"last set 1–2 RIR");
  const conflict=extractCompactPrescription(compact.replace("Bulgarian: 2x8–10","Bulgarian: 2x8–10 RPE 8 | all accessories 3 RIR"),scope,catalog,reference);
  assert.match(conflict.issues.join(" "),/conflicts with the day-wide/);
  assert.equal(conflict.days[0].exercises[2].effort,"RPE 8");
});

test("written bodyweight alternatives and sets-of-reps wording are fixed source values",()=>{
  const source=extractCompactPrescription(compact.replace("Pull-up: 2x8 bodyweight","Pull-up: 2x8 BW/+5 kg").replace("Lateral/Curl: 2 sets each","Lateral Raise: 3 sets of 8 reps @ 4 kg RPE 7 rest 2 min | Curl: 2 sets each"),scope,catalog,reference);
  assert.deepEqual(source.issues,[]);
  assert.equal(source.days[1].exercises[1].loadOrAssistance,"Bodyweight or +5 kg (written alternatives)");
  const lateral=source.days[3].exercises[1];assert.equal(lateral.sets,3);assert.deepEqual(lateral.dose.range,{min:8,max:8});assert.equal(lateral.loadOrAssistance,"4 kg");
});

test("bare Backdown after a different movement needs clarification instead of jumping to an earlier main lift",()=>{
  const source=extractCompactPrescription(compact.replace("Squat Single: 95.5 kg | Backdown: 2x3 @ 78 kg","Squat Single: 95.5 kg | Bulgarian: 2x8 @ bodyweight | Backdown: 2x3 @ 78 kg"),scope,catalog,reference);
  assert.match(source.issues.join(" "),/Backdown.*grounded/);
});

test("no-failure weeks reject zero reserve anywhere in a scoped range and never remove a negative sign",()=>{
  for(const reserve of ["last set 0–1 RIR","last set 0 to 1 RIR","RIR 1–0"]){
    const source=extractCompactPrescription(compact.replace("Bulgarian: 2x8–10",`Bulgarian: 2x8–10 (${reserve})`),scope,catalog,reference);
    assert.match(source.issues.join(" "),/no-failure/);
  }
  const source=extractCompactPrescription(compact.replace("Bulgarian: 2x8–10","Bulgarian: 2x8–10 (last set 1 to 2 RIR)"),scope,catalog,reference);
  assert.deepEqual(source.issues,[]);assert.equal(source.days[0].exercises[2].effort,"last set 1–2 RIR");
  assert.match(source.days[0].exercises[2].notes,/last set 1 to 2 RIR/);
  const negative=extractCompactPrescription(compact.replace("Bulgarian: 2x8–10","Bulgarian: 2x8–10 (-1 RIR)"),scope,catalog,reference);
  assert.match(negative.issues.join(" "),/negative written reserve/);
  for(const target of ["Bulgarian: 2x8 (last set -1–2 RIR)","Bulgarian: 2x8 (last set -1 to 2 RIR)","Bulgarian: 2x8 | all accessories -1 RIR"]){
    assert.match(extractCompactPrescription(compact.replace("Bulgarian: 2x8–10",target),scope,catalog,reference).issues.join(" "),/negative written reserve/);
  }
});

test("sets-of-seconds holds retain their exact duration while unsupported numeric dose wording needs clarification",()=>{
  for(const unit of ["seconds","sec"]){
    const source=extractCompactPrescription(compact.replace("Handstand + L-Sit",`Handstand | L-Sit: 3 sets of 15 ${unit} bodyweight`),scope,catalog,reference);
    assert.deepEqual(source.issues,[]);const skill=source.days[3].exercises.at(-1);assert.equal(skill.sets,3);assert.deepEqual(skill.dose,{kind:"hold",seconds:{min:15,max:15}});
  }
  const source=extractCompactPrescription(compact.replace("Lateral/Curl: 2 sets each","Lateral Raise: 2 sets, 8 reps @ 4 kg | Curl: 2 sets each"),scope,catalog,reference);
  assert.match(source.issues.join(" "),/unsupported wording/);
});

test("decimal load-first notation preserves the following sets, reps and units",()=>{
  const source=extractCompactPrescription(compact.replace("Pull-up: 2x8 bodyweight","Weighted Pull-up: +17.5 lb 2x5–7"),scope,catalog,reference);
  assert.deepEqual(source.issues,[]);const item=source.days[1].exercises[1];
  assert.equal(item.sets,2);assert.deepEqual(item.dose.range,{min:5,max:7});assert.equal(item.loadOrAssistance,"17.5 lb");
});
