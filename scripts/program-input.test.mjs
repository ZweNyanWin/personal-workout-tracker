import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PROGRAM_BRIEF_LIMIT, PROGRAM_REQUEST_BYTES} from "../lib/coach/program-input.mjs";
import {resolveRequestedScope} from "../lib/coach/requested-scope.mjs";

test("complete this to week twelve extends the written source instead of retaining a four-week default",()=>{
  const selected={startWeek:1,weekCount:4,daysPerWeek:4};
  assert.deepEqual(resolveRequestedScope("WEEK 1 — Written source\nDay 1\nWEEK 9 — Written source\nDay 1\ncomplete this to the week 12 and show me the draft",selected).scope,{...selected,weekCount:12});
  assert.equal(resolveRequestedScope("Do not extend this to week 12",selected).scope.weekCount,4);
  assert.throws(()=>resolveRequestedScope("WEEK 1\nComplete this to week 18",selected),/at most 16 weeks/);
});

test("program transport accommodates the database character limit including escaped Unicode",()=>{
  assert.equal(PROGRAM_BRIEF_LIMIT,16000);
  const escaped='{"brief":"'+"\\u754c".repeat(PROGRAM_BRIEF_LIMIT)+'","scope":{"startWeek":1,"weekCount":12,"daysPerWeek":4}}';
  assert.ok(Buffer.byteLength(escaped)<PROGRAM_REQUEST_BYTES);
  assert.equal(JSON.parse(escaped).brief.length,PROGRAM_BRIEF_LIMIT);
});

test("program editor, dispatch, saving, connector and both source parsers use the shared program limit",async()=>{
  for(const file of ["components/coaching/coaching-workspace.tsx","app/api/coach/program/route.ts","lib/actions/coaching.ts","connector/gateway.mjs","connector/markdown-prescription.mjs","connector/rest-prescription.mjs"]){
    const text=await readFile(new URL("../"+file,import.meta.url),"utf8");assert.match(text,/PROGRAM_BRIEF_LIMIT/,file);
  }
  const editor=await readFile(new URL("../components/coaching/coaching-workspace.tsx",import.meta.url),"utf8");
  assert.match(editor,/onPaste=[\s\S]*?event\.preventDefault\(\)[\s\S]*?No weeks were cut off/);
});
