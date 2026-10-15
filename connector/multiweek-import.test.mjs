import assert from "node:assert/strict";
import test from "node:test";
import { generateProgram, dayOutputSchema } from "./program-generation.mjs";
import { PROGRAM_BRIEF_LIMIT, programBriefForWeek, writtenProgramWeeks } from "../lib/coach/program-input.mjs";
import {extractWrittenPrescription} from "./written-prescription.mjs";
import {PROGRAM_PROMPT_BYTES} from "./program-prompt.mjs";

import { syntheticWrittenProgram, syntheticCatalog as catalog } from "./fixtures/written-program.mjs";

test("complete twelve-week written block imports all 48 sessions and 192 groups without regeneration",async()=>{
  const brief=syntheticWrittenProgram();
  assert.ok(brief.length>6000 && brief.length<=PROGRAM_BRIEF_LIMIT);
  let calls=0;const progress=[];
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:12,daysPerWeek:4},exerciseCatalog:catalog},context:"Client facts retained. ".repeat(500),system:"rules",signal:new AbortController().signal,
    chat:async()=>{calls++;throw new Error("Fully written targets must not need a model call");},progress:value=>progress.push(value)});
  assert.equal(calls,0);assert.equal(draft.status,"proposed");assert.equal(draft.weeks.length,12);
  for(const [index,week] of draft.weeks.entries()){
    const n=index+1;assert.equal(week.number,n);assert.deepEqual(week.days.map(day=>day.number),[1,2,3,4]);assert.deepEqual(week.days.map(day=>day.title),["Lower A","Upper A","Lower B","Upper B"]);
    assert.ok(week.days.every(day=>day.exercises.length===4));
    assert.deepEqual(week.days[0].exercises.slice(0,2).map(x=>[x.name,x.sets,x.dose.range.min,x.loadOrAssistance]),[["Low-Bar Squat",1,1,`${101+n} kg`],["Low-Bar Squat",2,3,`${81+n} kg`]]);
    assert.equal(week.days[1].exercises[0].restSeconds,120,"Explicit rest wins even above RPE7.5");
    assert.equal(week.days[1].exercises[2].loadOrAssistance,`${21+n} lb`);
    const paused=week.days[2].exercises[2];assert.equal(paused.dose.kind,"reps");assert.equal(paused.dose.range.min,5);assert.match(paused.notes,/pause for 2 seconds inside each repetition/);
    const last=week.days[3].exercises.at(-1);assert.deepEqual(last.dose,{kind:"hold",seconds:{min:10,max:20}});assert.match(last.notes,new RegExp(`week ${n} final source cue`));
  }
  assert.equal(progress.at(-1).week,12);assert.equal(progress.at(-1).totalWeeks,12);
});

test("selected ordinal week imports only that source week from a long document",async()=>{
  const brief="Import only week 12.\n"+syntheticWrittenProgram();
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:4,daysPerWeek:4},exerciseCatalog:catalog},system:"rules",signal:new AbortController().signal,chat:async()=>{throw Error("unexpected model call");}});
  assert.deepEqual(draft.weeks.map(week=>week.number),[12]);assert.equal(draft.weeks[0].days[0].exercises[0].loadOrAssistance,"113 kg");
});

test("all twelve partially specified weeks use bounded week/day calls and preserve every written target",async()=>{
  const brief=syntheticWrittenProgram().replaceAll(/, RPE \d/g,"");
  const context="Synthetic client records. ".repeat(450)+" END CLIENT RULE";
  const system="Use supplied facts; missing effort may only be proposed for coach review. ".repeat(42);
  const sources=writtenProgramWeeks(brief), expected=new Map();
  for(const section of sources.weeks){
    const contract=extractWrittenPrescription(programBriefForWeek(brief,section.number),{startWeek:section.number,weekCount:1,daysPerWeek:4},catalog);
    assert.deepEqual(contract.issues,[]);assert.equal(contract.complete,false);
    for(const day of contract.days)for(const item of day.exercises)item.effort="RPE 7";
    expected.set(section.number,contract.days);
  }
  let calls=0;
  const draft=await generateProgram({program:{brief,scope:{startWeek:1,weekCount:12,daysPerWeek:4},exerciseCatalog:catalog},context,system,signal:new AbortController().signal,chat:async({messages,format})=>{
    calls++;const prompt=messages[1].content;assert.ok(Buffer.byteLength(system+prompt)<=PROGRAM_PROMPT_BYTES);assert.ok(prompt.includes(context));
    if(format.properties.week){
      const n=format.properties.week.properties.number.const;
      assert.ok(prompt.includes(sources.weeks[n-1].text),"Current raw week is complete");
      const days=structuredClone(expected.get(n));for(const day of days){day.warmup="Confirm a familiar gradual warm-up with your coach";day.exercises=day.exercises.map(({name})=>({name}));}
      return {done:true,done_reason:"stop",message:{content:JSON.stringify({title:"Proposed formatted source",assumptions:["Proposed effort requires review"],progression:"Coach review",regression:"Ask coach",week:{number:n,focus:"Preserve source",days}})}};
    }
    const n=Number(/Write ONLY week (\d+)/.exec(prompt)[1]), day=structuredClone(expected.get(n).find(day=>day.number===format.properties.day.properties.number.const));
    day.warmup="Confirm a familiar gradual warm-up with your coach";
    day.exercises=Object.fromEntries(day.exercises.map((item,index)=>{
      const key=`group${index+1}`;
      if(format.properties.day.properties.exercises.properties[key].properties.reps){item.reps=item.dose.range.min;delete item.dose;}
      return [key,item];
    }));
    return {done:true,done_reason:"stop",message:{content:JSON.stringify({day})}};
  }});
  assert.equal(calls,48);assert.equal(draft.weeks.length,12);
  for(const week of draft.weeks)for(const day of week.days){const source=expected.get(week.number).find(x=>x.number===day.number);assert.deepEqual(day.exercises.map(x=>[x.name,x.sets,x.dose,x.loadOrAssistance,x.notes]),source.exercises.map(x=>[x.name,x.sets,x.dose,x.loadOrAssistance,x.notes]));}
});

test("week localization keeps whole source sections and shared rules, without another week's doses",()=>{
  const brief=syntheticWrittenProgram();const source=writtenProgramWeeks(brief);assert.equal(source.weeks.length,12);
  const current=programBriefForWeek(brief,3);assert.ok(current.includes(source.weeks[2].text));assert.ok(current.includes(source.preamble));assert.ok(!current.includes("WEEK 2 —"));assert.ok(!current.includes("WEEK 4 —"));
  assert.equal(programBriefForWeek(brief,13),brief,"An unwritten week cannot masquerade as a supplied one");
  for(const directive of ["All weeks use exact rest.","Repeat week 1 unchanged.","Throughout the block keep the cue."]){const full=brief+directive;assert.equal(programBriefForWeek(full,2),full,"Unresolved cross-week rules cannot be dropped");}
  assert.throws(()=>writtenProgramWeeks("WEEK 1\nDay 1\nWEEK 1\nDay 1"),/unique heading/);
  assert.throws(()=>writtenProgramWeeks("WEEK 0\nWEEK 2"),/between Week 1 and Week 52/);
  assert.equal(writtenProgramWeeks("Only week 12. Bench Press 2x3."),null);
});

test("formatting grammar locks supplied targets and leaves only absent effort for the model",()=>{
  const source=extractWrittenPrescription("Day 1 — Practice\nWall Push-up 2x8 at Bodyweight rest 2 min. Coach cue: keep body aligned.",{startWeek:12,weekCount:1,daysPerWeek:1},[{name:"Wall Push-up",equipment:"bodyweight"}]);
  assert.equal(source.complete,false);assert.equal(source.topologyComplete,true);
  const schema=dayOutputSchema(12,{number:1,exercises:[{name:"Wall Push-up"}]},undefined,undefined,source.days[0]);
  const fields=schema.properties.day.properties.exercises.properties.group1.properties;
  assert.equal(fields.sets.const,2);assert.equal(fields.loadOrAssistance.const,"Bodyweight");assert.equal(fields.restSeconds.const,120);assert.equal(fields.dose.properties.range.properties.min.const,8);assert.equal(fields.dose.properties.range.properties.max.const,8);assert.match(fields.notes.const,/keep body aligned/);
  assert.equal(fields.effort.const,undefined);
});
