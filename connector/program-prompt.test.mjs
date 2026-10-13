import assert from "node:assert/strict";
import test from "node:test";
import { buildProgramPrompt, PROGRAM_PROMPT_BYTES, programGenerationTimeout } from "./program-prompt.mjs";
import { generateProgram } from "./program-generation.mjs";

const response = value => ({ done: true, done_reason: "stop", message: { content: JSON.stringify(value) } });
const context = "CLIENT RULE: retain assistance and no completed work is recorded. " + "Recorded data; ".repeat(790) + "END CLIENT RULE: no guessed readiness.";
const brief = "Write a proposed twelve-week four-day block. " + "Coach notes; ".repeat(440) + "END COACH RULE: retain the distinct groups.";
const system = "Use supplied facts and exact units. ".repeat(80);
const references = [{ id: "synthetic-reference", title: "Synthetic programming template", kind: "coach-example", summary: "Proposed programming, not client history.", aliases: ["block"], sections: [
  { id: "rules", title: "Whole reference", locator: "Synthetic section", tags: ["rules"], text: "WHOLE EXCERPT START " + "Generic source rules; ".repeat(450) + " WHOLE EXCERPT END" },
] }];
function week(number) {
  return { title: "Synthetic proposed block", assumptions: ["Coach review needed"], progression: "Coach approval", regression: "Ask the coach",
    week: { number, focus: "Practice", days: Array.from({ length: 4 }, (_, n) => ({ number: n + 1, title: `Session ${n + 1}`,
      warmup: "Familiar coach warm-up", exercises: Array.from({ length: 8 }, (_, index) => ({ name: `Wall Push-up variation ${index + 1}`,
        sets: 2, dose: { kind: "reps", range: { min: 8, max: 10 }, perSide: false },
        loadOrAssistance: `Bodyweight; ${"support detail ".repeat(25)}`, effort: "RPE 7", restSeconds: 120,
        restIsExplicit: false, notes: `day-${n + 1}-complete-cue: ${"control cue ".repeat(26)}`,
      })) })) } };
}
const catalog = week(1).week.days[0].exercises.map((item, n) => ({ name: item.name, equipment: "bodyweight", id: `84000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}` }));

test("multiweek jobs receive enough sequential-call time with a fixed ninety-minute ceiling", () => {
  assert.equal(programGenerationTimeout({ weekCount: 1, daysPerWeek: 4 }), 30 * 60 * 1000);
  assert.equal(programGenerationTimeout({ weekCount: 4, daysPerWeek: 4 }), 30 * 60 * 1000);
  assert.equal(programGenerationTimeout({ weekCount: 8, daysPerWeek: 4 }), 60 * 60 * 1000);
  assert.equal(programGenerationTimeout({ weekCount: 12, daysPerWeek: 4 }), 90 * 60 * 1000);
  assert.equal(programGenerationTimeout({ weekCount: 16, daysPerWeek: 7 }), 90 * 60 * 1000);
});

test("a twelve-week four-day block stays bounded as previous prescriptions grow and repairs occur", async () => {
  let calls = 0, retried = false;
  const draft = await generateProgram({ program: { brief, scope: { startWeek: 1, weekCount: 12, daysPerWeek: 4 }, exerciseCatalog: catalog },
    system, context, references, signal: new AbortController().signal, chat: async ({ messages, format }) => {
      calls++;
      const prompt = messages[1].content;
      assert.ok(Buffer.byteLength(messages[0].content + prompt) <= PROGRAM_PROMPT_BYTES);
      assert.ok(prompt.includes(brief), "Every coach rule remains intact");
      assert.ok(prompt.includes(context), "Every supplied client rule remains intact");
      assert.equal(prompt.includes("WHOLE EXCERPT START"), prompt.includes("WHOLE EXCERPT END"), "Optional retrieval cannot include half an excerpt");
      if (format.properties.week) {
        const source = week(format.properties.week.properties.number.const);
        for (const day of source.week.days) day.exercises = day.exercises.map(({ name }) => ({ name }));
        return response(source);
      }
      const number = Number(/Write ONLY week (\d+)/.exec(prompt)[1]);
      const dayNumber = format.properties.day.properties.number.const;
      const day = week(number).week.days[dayNumber - 1];
      if (number > 1) assert.ok(!prompt.includes(`day-${dayNumber === 1 ? 2 : 1}-complete-cue`), "Another day's verbose cues are not continuity for this day");
      const wire = { day: { ...day, exercises: Object.fromEntries(day.exercises.map((item, index) => [`group${index + 1}`, item])) } };
      if (number === 3 && dayNumber === 2 && !retried) { retried = true; wire.day.exercises.group1.effort = "RPE"; }
      return response(wire);
    } });
  assert.equal(calls, 61); assert.equal(retried, true);
  assert.deepEqual(draft.weeks.map(week => week.number), Array.from({ length: 12 }, (_, n) => n + 1));
  assert.ok(draft.weeks.every(week => week.days.length === 4 && week.days.every(day => day.exercises.length === 8)));
});

test("saved multiweek source passes each complete day cue without repeating other days' prescriptions", async () => {
  const sourceWeeks = [1, 2, 3].map(number => week(number).week);
  const draft = await generateProgram({ program: { brief: "Keep all source prescriptions unchanged.", sourceWeeks,
    scope: { startWeek: 1, weekCount: 3, daysPerWeek: 4 }, exerciseCatalog: catalog }, system, context, references,
    signal: new AbortController().signal, chat: async ({ messages, format }) => {
      const prompt = messages[1].content;
      assert.ok(Buffer.byteLength(system + prompt) <= PROGRAM_PROMPT_BYTES);
      if (format.properties.week) {
        assert.ok(!prompt.includes("complete-cue:"));
        const source = week(format.properties.week.properties.number.const);
        for (const day of source.week.days) day.exercises = day.exercises.map(({ name }) => ({ name }));
        return response(source);
      }
      const number = Number(/Write ONLY week (\d+)/.exec(prompt)[1]);
      const dayNumber = format.properties.day.properties.number.const;
      const day = week(number).week.days[dayNumber - 1];
      for (const item of day.exercises) assert.ok(prompt.includes(item.notes), "Current source cue is complete");
      for (let other = 1; other <= 4; other++) if (other !== dayNumber) assert.ok(!prompt.includes(`day-${other}-complete-cue:`));
      return response({ day: { ...day, exercises: Object.fromEntries(day.exercises.map((item, index) => [`group${index + 1}`, item])) } });
    } });
  for (const [index, result] of draft.weeks.entries()) for (const day of result.days) {
    const source = sourceWeeks[index].days.find(item => item.number === day.number);
    const prescriptions = items => items.map(item => {
      const value = structuredClone(item); delete value.restIsExplicit; return value;
    });
    assert.deepEqual(prescriptions(day.exercises), prescriptions(source.exercises));
  }
});

test("UTF-8 input and retry data obey the bound without truncating mandatory rules", () => {
  const evidence = "界".repeat(11000) + " KEEP EXACT RULE END";
  const prompt = buildProgramPrompt({ system: "Rules", instruction: "Repair the whole day", evidence, number: 4,
    repair: "\nREPAIR: Missing exercise dose", invalidOutput: "😀".repeat(6000), continuity: { notes: "past ".repeat(3000) }, references });
  assert.ok(prompt.includes(evidence)); assert.ok(prompt.includes("Missing exercise dose"));
  assert.ok(Buffer.byteLength("Rules" + prompt) <= PROGRAM_PROMPT_BYTES);
  assert.throws(() => buildProgramPrompt({ system: "Rules", instruction: "Write", evidence: "界".repeat(13000), number: 4 }), /coach brief.*current source.*client rules/i);
});
