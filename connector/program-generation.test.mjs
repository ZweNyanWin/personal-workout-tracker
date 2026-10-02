import assert from "node:assert/strict";
import test from "node:test";
import { dayOutputSchema, generateProgram, weekOutputSchema } from "./program-generation.mjs";
import { effortProblems, programEffortProblems } from "../lib/coach/effort-validation.mjs";
import { isMainCompound } from "../lib/coach/exercise-rules.mjs";

function week(number, days = 2) {
  return { title: "Reviewed strength block", assumptions: ["Working weights were not provided"], progression: "Follow the coach's targets", regression: "Ask the coach if targets cannot be met",
    week: { number, focus: "Technique", days: Array.from({ length: days }, (_, index) => ({ number: index + 1,
      title: "Training", warmup: "Gradual familiar warmup", exercises: [
        { name: "Paused bench press — top single", sets: 1, dose: { kind: "reps", range: { min: 1, max: 1 }, perSide: false }, loadOrAssistance: "Coach-supplied load", effort: "RPE 8", restSeconds: 180, restIsExplicit: false, notes: "Pause every rep" },
        { name: "Paused bench press — backdowns", sets: 3, dose: { kind: "reps", range: { min: 5, max: 5 }, perSide: false }, loadOrAssistance: "Coach-supplied load", effort: "RPE 7", restSeconds: 120, restIsExplicit: false, notes: "" },
        { name: "Supported L-sit", sets: 3, dose: { kind: "hold", seconds: { min: 10, max: 20 } }, loadOrAssistance: "Feet supported", effort: "Stop before position loss", restSeconds: 90, restIsExplicit: false, notes: "" },
      ] })) } };
}
const request = { scope: { startWeek: 1, weekCount: 4, daysPerWeek: 2 }, brief: "Preserve my top single and backdown prescription" };
const response = (value, extra = {}) => ({ done: true, done_reason: "stop", message: { content: JSON.stringify(value) }, ...extra });
const wireDay = (day) => ({ ...day, exercises: Object.fromEntries(day.exercises.map((item, index) => {
  const group = structuredClone(item);
  if (isMainCompound(group.name)) { group.reps = group.dose.range.min; delete group.dose; }
  return [`group${index + 1}`, group];
})) });

test("effort guard catches observed contradictions without confusing independent prescriptions", () => {
  for (const target of ["RPE 8 (2 RIR)", "RPE 6–7; 3–4 RIR", "RPE 6–7 (3–4 RIR)", "2 RIR", "RIR 3", "Stop before position loss"]) assert.deepEqual(effortProblems(target), [], target);
  for (const target of ["RPE 8 (3 RIR)", "RPE 7 = 2 reps in reserve", "RPE", "RIR", "RPE 0"]) assert.ok(effortProblems(target).length, target);
  assert.deepEqual(programEffortProblems({ exercises: [{ effort: "RPE 8" }, { effort: "3 RIR" }] }), []);
  assert.deepEqual(programEffortProblems({ assumptions: ["RPE 8 is not 1 RIR"], warmup: "Easy warmup at RPE 3", exercises: [{ effort: "RPE 8 (2 RIR)" }] }), []);
  assert.ok(programEffortProblems({ warmup: "Easy warmup at RPE 3", exercises: [{ effort: "RPE 8 (3 RIR)" }] }).length);
});

test("generates all requested weeks separately and preserves distinct doses, variants and holds", async () => {
  const calls = [], progress = [];
  const draft = await generateProgram({ program: request, context: "Actual completed sets: none", system: "System rules", signal: new AbortController().signal,
    progress: (p) => progress.push(p), chat: async (body) => { calls.push(body); return response(week(calls.length)); } });
  assert.deepEqual(draft.weeks.map((w) => w.number), [1, 2, 3, 4]);
  assert.equal(calls.length, 4);
  assert.equal(progress.at(-1).totalWeeks, 4);
  assert.equal(draft.weeks[3].days[1].exercises.length, 3);
  assert.equal(draft.weeks[0].days[0].exercises[2].dose.kind, "hold");
  assert.match(calls[0].messages[1].content, /Actual completed sets: none/);
  assert.match(calls[0].messages[1].content, /2 min = 120/);
  assert.match(calls[1].messages[1].content, /PREVIOUS DRAFT WEEK/);
  assert.equal(calls[3].format.properties.week.properties.number.const, 4);
});

test("bounded repair fixes an omitted day without fabricating it in code", async () => {
  let count = 0; const prompts = [];
  const draft = await generateProgram({ program: { ...request, scope: { ...request.scope, weekCount: 1 } }, system: "rules", signal: new AbortController().signal,
    chat: async (body) => { prompts.push(body.messages[1].content); return response(week(1, ++count === 1 ? 1 : 2)); } });
  assert.equal(count, 2); assert.equal(draft.weeks[0].days.length, 2);
  assert.match(prompts[1], /PREVIOUS INVALID WEEK/);
  assert.match(prompts[1], /Missing training day/);
});

test("bounded repair explains a bare effort target and keeps the coach's other groups", async () => {
  const prompts = []; let count = 0;
  const draft = await generateProgram({ program: { ...request, scope: { ...request.scope, weekCount: 1 } }, system: "rules", signal: new AbortController().signal,
    chat: async (body) => {
      prompts.push(body.messages[1].content);
      const value = week(1); if (++count === 1) value.week.days[0].exercises[1].effort = "RPE ";
      return response(value);
    } });
  assert.equal(count, 2);
  assert.equal(draft.weeks[0].days[0].exercises[1].effort, "RPE 7");
  assert.match(prompts[1], /The effort target is missing its value/);
  assert.match(prompts[1], /"effort":"RPE "/);
});

test("unspecified rest above RPE 7.5 gets a 4–6 minute suggestion with a 5 minute timer", async () => {
  for (const [effort, suggested, name] of [["RPE 7.5", false], ["RPE 8", true], ["RPE 7.6", true, "Cable Row"], ["RPE 7–8", true, "Cable Row"]]) {
    const value = week(1, 1); value.week.days[0].exercises[0].effort = effort;
    if (name) value.week.days[0].exercises[0].name = name;
    const draft = await generateProgram({ program: { brief: "Create a strength day", scope: { startWeek: 1, weekCount: 1, daysPerWeek: 1 } },
      system: "rules", signal: new AbortController().signal, chat: async () => response(value) });
    const item = draft.weeks[0].days[0].exercises[0];
    assert.equal(item.restSeconds, suggested ? 300 : 180, effort);
    assert.deepEqual(item.restRangeMinutes, suggested ? { min: 4, max: 6 } : undefined, effort);
    assert.equal(draft.weeks[0].days[0].exercises[1].restSeconds, 120);
  }
});

test("explicit coach rest and existing source prescriptions remain exact", async () => {
  for (const brief of ["Top single at RPE 8, rest 3 min", "3 minutes rest after each set", "Rest: 3", "Rest between sets:\n180 seconds"]) {
    const draft = await generateProgram({ program: { brief, scope: { startWeek: 1, weekCount: 1, daysPerWeek: 1 } },
      system: "rules", signal: new AbortController().signal, chat: async () => response(week(1, 1)) });
    const item = draft.weeks[0].days[0].exercises[0];
    assert.equal(item.restSeconds, 180, brief); assert.equal(item.restRangeMinutes, undefined, brief);
  }
  const source = week(1, 1).week;
  const draft = await generateProgram({ program: { brief: "Keep this day's prescriptions", sourceWeeks: [source], scope: { startWeek: 1, weekCount: 1, daysPerWeek: 1 } },
    system: "rules", signal: new AbortController().signal, chat: async () => response(week(1, 1)) });
  assert.equal(draft.weeks[0].days[0].exercises[0].restSeconds, 180);
  assert.equal(draft.weeks[0].days[0].exercises[0].restRangeMinutes, undefined);
  source.days[0].exercises[0].restSeconds = 300;
  source.days[0].exercises[0].restRangeMinutes = { min: 4, max: 6 };
  const revised = week(1, 1); revised.week.days[0].exercises[0].restSeconds = 300;
  const result = await generateProgram({ program: { brief: "Keep this day's prescriptions", sourceWeeks: [source], scope: { startWeek: 1, weekCount: 1, daysPerWeek: 1 } },
    system: "rules", signal: new AbortController().signal, chat: async () => response(revised) });
  assert.deepEqual(result.weeks[0].days[0].exercises[0].restRangeMinutes, { min: 4, max: 6 });
});

test("mixed briefs keep exact rest while suggesting a range for an unspecified group", async () => {
  const value = week(1, 1); value.week.days[0].exercises[1].effort = "RPE 8";
  const draft = await generateProgram({ program: { brief: "Top single at RPE 8 with rest 3 min. Backdowns at RPE 8; choose their rest.", scope: { startWeek: 1, weekCount: 1, daysPerWeek: 1 } },
    system: "rules", signal: new AbortController().signal, chat: async () => response(value) });
  const [top, backdowns] = draft.weeks[0].days[0].exercises;
  assert.equal(top.restSeconds, 180); assert.equal(top.restRangeMinutes, undefined);
  assert.equal(backdowns.restSeconds, 300); assert.deepEqual(backdowns.restRangeMinutes, { min: 4, max: 6 });
  assert.equal("restIsExplicit" in backdowns, false);
});

test("model rest provenance cannot suppress high-effort defaults or assign another group's rest", async () => {
  const value = week(1, 1);
  value.week.days[0].exercises[0].restSeconds = 45;
  value.week.days[0].exercises[0].restIsExplicit = true;
  value.week.days[0].exercises[1].effort = "RPE 8";
  value.week.days[0].exercises[1].restSeconds = 180;
  value.week.days[0].exercises[1].restIsExplicit = true;
  for (const [brief, topRest] of [["Create a strength day", 300], ["Top single rest 3 min. Choose backdown rest.", 180]]) {
    const draft = await generateProgram({ program: { brief, scope: { startWeek: 1, weekCount: 1, daysPerWeek: 1 } },
      system: "rules", signal: new AbortController().signal, chat: async () => response(value) });
    const [top, backdowns] = draft.weeks[0].days[0].exercises;
    assert.equal(top.restSeconds, topRest);
    assert.equal(backdowns.restSeconds, 300);
    assert.deepEqual(backdowns.restRangeMinutes, { min: 4, max: 6 });
    assert.equal("restIsExplicit" in top, false);
  }
});

test("duplicate days, missing exercise dose and truncation fail rather than returning a partial plan", async () => {
  for (const mutation of [
    (w) => { w.week.days[1].number = 1; },
    (w) => { delete w.week.days[0].exercises[0].effort; },
    (w) => { w.week.days[0].exercises[0].dose.range.max = 0; },
  ]) {
    let calls = 0;
    await assert.rejects(generateProgram({ program: request, signal: new AbortController().signal, system: "rules",
      chat: async () => { calls++; const w = week(1); mutation(w); return response(w); } }), /complete week 1/);
    assert.equal(calls, 3);
  }
  await assert.rejects(generateProgram({ program: request, signal: new AbortController().signal, system: "rules",
    chat: async () => response(week(1), { done_reason: "length" }) }), /complete week 1/);
});

test("cancellation prevents starting further weeks", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(generateProgram({ program: request, signal: controller.signal, system: "rules",
    chat: async () => { calls++; controller.abort(); return response(week(1)); } }), { name: "AbortError" });
  assert.equal(calls, 1);
  const schema = weekOutputSchema(7, 3);
  assert.equal(schema.properties.week.properties.days.maxItems, 3);
});

test("rejects a structurally valid draft that substitutes push-ups for explicit bench days", async () => {
  let calls = 0;
  await assert.rejects(generateProgram({ program: { scope: { startWeek: 1, weekCount: 1, daysPerWeek: 2 }, brief: "2 bench days per week" },
    signal: new AbortController().signal, system: "rules", chat: async () => {
      calls++; const value = week(1); for (const day of value.week.days) for (const item of day.exercises) if (isMainCompound(item.name)) item.name = "Push-ups";
      return response(value);
    } }), /requested bench training on 2 distinct days/);
  assert.equal(calls, 3);
});

test("supplies reviewed excerpts and repairs a prescription-level failure", async () => {
  const prompts = []; let calls = 0;
  const references = [{ id: "synthetic-template", title: "Named template", kind: "pdf", aliases: ["Named template"], summary: "Example only", sections: [
    { id: "rules", title: "Source rules", locator: "p. 1", text: "Source bench prescription", tags: ["rules"] },
  ] }];
  const draft = await generateProgram({ references, program: { scope: { startWeek: 1, weekCount: 1, daysPerWeek: 2 }, brief: "Named template, 2 bench days per week" },
    signal: new AbortController().signal, system: "rules", chat: async (body) => {
      prompts.push(body.messages[1].content); const value = week(1);
      if (++calls === 1) for (const item of value.week.days[0].exercises) if (isMainCompound(item.name)) item.name = "Push-up";
      return response(value);
    } });
  assert.equal(draft.weeks.length, 1); assert.equal(calls, 2);
  assert.match(prompts[0], /Source bench prescription/);
  assert.match(prompts[0], /EXPLICIT COACH CONSTRAINTS/);
  assert.match(prompts[1], /found 1/);
});

test("larger weeks fix the exercise order before writing each complete day", async () => {
  const calls = [];
  const scope = { startWeek: 1, weekCount: 2, daysPerWeek: 3 };
  const draft = await generateProgram({ program: { scope, brief: "Preserve separate paused bench top single/backdown groups and supported holds" },
    signal: new AbortController().signal, system: "rules", chat: async (body) => {
      calls.push(body);
      if (body.format.properties.week) {
        const value = week(body.format.properties.week.properties.number.const, 3);
        for (const day of value.week.days) day.exercises = day.exercises.map(({ name }) => ({ name, purpose: "other" }));
        return response(value);
      }
      const number = body.format.properties.day.properties.number.const;
      return response({ day: wireDay(week(1, 3).week.days[number - 1]) });
    } });
  assert.equal(calls.length, 8);
  assert.deepEqual(draft.weeks.map((value) => value.number), [1, 2]);
  assert.equal(draft.weeks[1].days[2].exercises.length, 3);
  assert.equal("purpose" in draft.weeks[0].days[0].exercises[0], false);
  const schema = dayOutputSchema(2, { number: 3, exercises: [{ name: "Squat" }, { name: "Bench press - technique" }] });
  assert.equal(schema.properties.day.properties.number.const, 3);
  assert.equal(schema.properties.day.properties.exercises.properties.group1.properties.name.const, "Squat");
  assert.deepEqual(schema.properties.day.properties.exercises.required, ["group1", "group2"]);
});

test("day generation rejects a fixed-name substitution and leaves the incomplete block unavailable", async () => {
  let days = 0;
  await assert.rejects(generateProgram({ program: { scope: { startWeek: 1, weekCount: 1, daysPerWeek: 3 }, brief: "Keep my paused bench groups" },
    signal: new AbortController().signal, system: "rules", chat: async (body) => {
      if (body.format.properties.week) {
        const value = week(1, 3); for (const day of value.week.days) day.exercises = day.exercises.map(({ name }) => ({ name, purpose: "other" }));
        return response(value);
      }
      days++; const day = week(1, 3).week.days[0]; day.exercises[0].name = "Push-up"; return response({ day: wireDay(day) });
    } }), /changed its planned exercise names or order/);
  assert.equal(days, 3);
});


test("explicit one-week daily brief replaces a stale four-week scope at the generation boundary", async () => {
  const calls = [];
  const draft = await generateProgram({ program: { brief: "Give me just one week for everyday workout. Do not give me four weeks.", scope: { startWeek: 1, weekCount: 4, daysPerWeek: 4 } }, signal: new AbortController().signal, system: "rules", chat: async (body) => {
    calls.push(body);
    if (body.format.properties.week) {
      const value = week(1, 7);
      for (const day of value.week.days) day.exercises = day.exercises.map(({ name }) => ({ name }));
      return response(value);
    }
    const number = body.format.properties.day.properties.number.const;
    const day = week(1, 7).week.days[number - 1];
    return response({ day: wireDay(day) });
  } });
  assert.equal(draft.weeks.length, 1);
  assert.deepEqual(draft.weeks[0].days.map((day) => day.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(calls.length, 8);
  assert.equal(calls[0].format.properties.week.properties.days.maxItems, 7);
});
