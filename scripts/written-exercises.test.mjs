import test from "node:test";
import assert from "node:assert/strict";
import {catalogWithWrittenExercises} from "../lib/coach/written-exercises.mjs";
import {validateExerciseCatalog} from "../connector/exercise-catalog.mjs";

const existing=[{id:"89300000-0000-4000-8000-000000000001",name:"Bench Press",equipment:"barbell"}];
test("only explicit numbered multiweek coach-source rows authorize additional draft movements",()=>{
 const brief="WEEK 1\nDay 1\n1. Bench Press Single: 1x1 @ 77 kg RPE 7\n2. Paused Low-Bar Squat: 2x4 @ 88 kg RPE 7\n3. Handstand Practice: 5–7 attempts\nWEEK 2\nDay 1\n1. Paused Low-Bar Squat: 2x4 @ 90 kg RPE 7\nOther prose asks for Fake Invention.";
 const result=catalogWithWrittenExercises(existing,brief);validateExerciseCatalog(result);
 assert.deepEqual(result.map(x=>x.name),["Bench Press","Paused Low-Bar Squat","Handstand Practice"]);
 assert.equal(result[0].id,existing[0].id);assert.equal(existing.length,1);assert.ok(result.every(x=>!x.name.includes("Fake")));
 assert.equal(catalogWithWrittenExercises(existing,"Please make a new program with Paused Low-Bar Squat"),existing);
});
test("written names still obey equipment and stated movement bans; source names never imply readiness",()=>{
 const brief="Equipment: none. I cannot do dips.\nWEEK 1\nDay 1\n1. Dips: 2x8\n2. Barbell Row: 2x10\n3. Wall Push-up: 2x8\nWEEK 2\nDay 1";
 const result=catalogWithWrittenExercises([],brief);assert.deepEqual(result.map(x=>x.name),["Wall Push-up"]);
});
test("top-single and backdown labels remain group roles instead of new exercise identities",()=>{
 const brief="WEEK 1\nDay 1\n1. Bench Press top single: 1x1 @ 77 kg\n2. Bench Press backdown: 2x4 @ 65 kg\nWEEK 2\nDay 1\n1. Bench Press top set: 1x3 @ 75 kg";
 const result=catalogWithWrittenExercises(existing,brief);
 assert.deepEqual(result.map(x=>x.name),["Bench Press"]);
 assert.equal(result[0].id,existing[0].id);
});
