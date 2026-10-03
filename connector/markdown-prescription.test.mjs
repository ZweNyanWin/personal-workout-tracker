import assert from "node:assert/strict";
import test from "node:test";
import { extractMarkdownPrescription, markdownPrescriptionProblems, markdownScopeProblems, sourcePrescriptionForDay, groundedMarkdownHeader, markdownHeaderProblems, markdownNotes, markdownWarmup } from "./markdown-prescription.mjs";
import { dayOutputSchema, generateProgram, outlineSchema } from "./program-generation.mjs";
import { extractTrainingConstraints, trainingNarrativeProblems } from "../lib/coach/training-constraints.mjs";

// Fictional, bounded importer fixture. It contains no account or client data.
const catalog = [
  ["Parallette Push-up", "bodyweight"], ["Dumbbell Goblet Squat", "dumbbell"],
  ["Dumbbell Overhead Press", "dumbbell"], ["Resistance Band Row", "bands"],
  ["Reverse Lunge", "bodyweight"], ["Dumbbell Farmer's Carry", "dumbbell"],
  ["Plank", "bodyweight"], ["Band-Assisted Push-up", "bands"],
].map(([name, equipment], index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, equipment }));
const brief = `Home workout, one week, every day.
Equipment: two 5kg dumbbells, resistance band, parallettes.
Effort: RPE 7–9.
Rest between sets: 60–90 seconds.
| Exercise | Sets | Reps / Hold | Notes |
|---|---|---|---|
| 1. Push-ups (on parallettes) | 3 | 15–20 reps | Progress to dips or incline push-ups if possible. |
| 2. Dumbbell Goblet Squats | 3 | 15–20 reps | Hold one 5kg dumbbell at chest. |
| 3. Dumbbell Overhead Press | 3 | 10–12 reps | Use one dumbbell. |
| 4. Resistance Band Rows | 3 | 12–15 reps | Use the resistance band. |
| 5. Bodyweight Squat to Wall (or Lunges) | 3 | 10–15 reps per leg | |
| 6. Dumbbell Farmer's Carry | 3 | 30–45 seconds | Hold one 5kg dumbbell. |
| 7. Plank (on floor or parallettes) | 3 | 30–60 seconds | |
| 8. Band-Assisted Push-up (optional) | 2 | 10–15 reps | |

| Day | Focus |
|---|---|
| Day 1 | Push-ups, Squats, Rows |
| Day 2 | Overhead Press, Farmer’s Carry, Plank |
| Day 3 | Full Body (all above) |
| Day 4 | Active Recovery (light band work, 10 min) |
| Day 5 | Push-ups + Squats + Farmer’s Carry |
| Day 6 | Overhead Press + Rows + Plank |
| Day 7 | Full Body + 10 min cool-down |
I cannot do dips. No competition-style lifts. Give me only one week, every day.`;

function sourceExercise(contract, source) {
  const name = source.choices[0];
  const equipment = catalog.find((entry) => entry.name === name).equipment;
  return { name, sets: source.sets, dose: structuredClone(source.dose),
    loadOrAssistance: equipment === "dumbbell" ? "One 5 kg dumbbell" : equipment === "bands" ? "Resistance band" : "Bodyweight",
    effort: "RPE 8", restSeconds: 75, restIsExplicit: true, notes: "" };
}
function sourceWeek(contract) {
  return { number: 1, focus: "Home strength", days: contract.days.map((recipe) => ({
    number: recipe.number, title: recipe.focus, warmup: markdownWarmup(contract, recipe.number),
    exercises: recipe.recovery ? [{ name: "Resistance Band Row", sets: 1,
      dose: { kind: "reps", range: { min: 10, max: 10 }, perSide: false }, loadOrAssistance: "Light resistance band",
      effort: "Easy, comfortable effort", restSeconds: 75, restIsExplicit: true,
      notes: "10 min total for the whole recovery session, including familiar warmup." }]
      : recipe.required.map((choices, index) => ({
        ...sourceExercise(contract, contract.prescriptions.find((source) => source.choices.includes(choices[0]))),
        notes: markdownNotes(contract, recipe.number, choices[0], index) ?? "",
      })),
  })) };
}
const response = (value) => ({ done: true, done_reason: "stop", message: { content: JSON.stringify(value) } });

test("pasted home table preserves exact targets and resolves the seven daily recipes", () => {
  const contract = extractMarkdownPrescription(brief, catalog);
  assert.deepEqual(contract.issues, []);
  assert.equal(contract.prescriptions.length, 8);
  assert.equal(contract.days.length, 7);
  assert.deepEqual(contract.days[0].required.map((choices) => choices[0]), ["Parallette Push-up", "Dumbbell Goblet Squat", "Resistance Band Row"]);
  assert.equal(contract.days[2].required.length, 7);
  assert.ok(contract.days[2].required.some((choices) => choices.includes("Dumbbell Overhead Press")));
  assert.deepEqual(contract.days[1].optional, []);
  assert.deepEqual(contract.days[0].optional, [["Band-Assisted Push-up"]]);
  assert.equal(contract.days[3].minutes, 10);
  assert.equal(contract.days[6].cooldownMinutes, 10);
  assert.deepEqual(markdownPrescriptionProblems(sourceWeek(contract), contract), []);
  assert.deepEqual(sourcePrescriptionForDay(contract, 1, "Resistance Band Row").dose.range, { min: 12, max: 15 });
  assert.equal(sourcePrescriptionForDay(contract, 4, "Resistance Band Row"), null);
});

test("wrong doses, full-body omissions, duplicate groups and wrong daily subsets fail", () => {
  const contract = extractMarkdownPrescription(brief, catalog);
  for (const [mutate, expected] of [
    [(week) => { week.days[2].exercises.find((item) => item.name === "Resistance Band Row").dose.range = { min: 10, max: 12 }; }, /changed the pasted sets or rep/],
    [(week) => { week.days[2].exercises = week.days[2].exercises.filter((item) => item.name !== "Dumbbell Overhead Press"); }, /omits its prescribed Dumbbell Overhead Press/],
    [(week) => { week.days[0].exercises.push(sourceExercise(contract, contract.prescriptions[2])); }, /outside its pasted daily focus/],
    [(week) => { week.days[0].exercises.push(structuredClone(week.days[0].exercises[0])); }, /duplicates/],
    [(week) => { week.days[1].exercises.push(sourceExercise(contract, contract.prescriptions[7])); }, /outside its pasted daily focus/],
    [(week) => { week.days[0].exercises[1].loadOrAssistance = "Two 5 kg dumbbells"; }, /explicitly uses one dumbbell/],
    [(week) => { week.days[0].exercises[0].effort = "RPE 6"; }, /pasted working effort/],
  ]) {
    const week = sourceWeek(contract); mutate(week);
    assert.match(markdownPrescriptionProblems(week, contract).join(" "), expected);
  }
});

test("active recovery stays easy for its whole session and cooldown cannot become warmup", () => {
  const contract = extractMarkdownPrescription(brief, catalog);
  for (const [mutate, expected] of [
    [(week) => { week.days[3].exercises[0].effort = "RPE 7"; }, /active recovery.*qualitative easy/],
    [(week) => { week.days[3].exercises[0].effort = "RPE 3"; }, /active recovery.*qualitative easy/],
    [(week) => { week.days[3].exercises[0].name = "Dumbbell Goblet Squat"; }, /light band recovery/],
    [(week) => { week.days[3].exercises[0].name = "Band-Assisted Push-up"; }, /light band recovery/],
    [(week) => { week.days[3].exercises[0].notes = ""; week.days[3].warmup = "10 minute warmup before three hard exercises"; }, /10 min total for the whole recovery session/],
    [(week) => { week.days[6].exercises[0].notes = ""; week.days[6].warmup = "10 min cool-down"; }, /after the workout.*warmup/],
  ]) {
    const week = sourceWeek(contract); mutate(week);
    assert.match(markdownPrescriptionProblems(week, contract).join(" "), expected);
  }
  const recovery = sourceWeek(contract).days[3];
  const recoverySchema = dayOutputSchema(1, recovery, undefined, contract).properties.day.properties.exercises.properties.group1;
  assert.equal(recoverySchema.properties.effort.const, "Easy, comfortable effort");
  assert.match(recoverySchema.properties.notes.const, /10 min total for the whole easy recovery session/);
  const cooldown = sourceWeek(contract).days[6];
  assert.match(dayOutputSchema(1, cooldown, undefined, contract).properties.day.properties.exercises.properties.group1.properties.notes.const, /10 min cool-down after the workout/);
});

test("pasted outline grammar fixes each daily group quantity and picks one family choice", () => {
  const contract = extractMarkdownPrescription(brief, catalog);
  const schema = outlineSchema(1, 7, catalog, undefined, contract).properties.week.properties.days;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["day1", "day2", "day3", "day4", "day5", "day6", "day7"]);
  const firstDay = schema.properties.day1.properties;
  assert.deepEqual(firstDay.exercises.required, ["group1", "group2", "group3"]);
  assert.deepEqual(firstDay.exercises.properties.group2.properties.name.enum, ["Dumbbell Goblet Squat", "Reverse Lunge"]);
  assert.equal(firstDay.number.const, 1);
  assert.equal(schema.properties.day3.properties.exercises.required.length, 7);
  assert.deepEqual(schema.properties.day4.properties.exercises.properties.group1.properties.name.enum, ["Resistance Band Row"]);
  assert.equal(schema.properties.day4.properties.exercises.required.length, 1);
  const onlyAssisted = catalog.filter((entry) => entry.name !== "Resistance Band Row");
  assert.match(extractMarkdownPrescription(brief, onlyAssisted).issues.join(" "), /recovery focus has no compatible light movement/);
});

test("unsupported targets, unresolved identities, duplicate source groups and incomplete flows require clarification", async () => {
  for (const changed of [
    brief.replace("| Exercise | Sets | Reps / Hold | Notes |", "| Movement | Sets | Reps / Hold | Notes |"),
    brief.replace("| Exercise | Sets | Reps / Hold | Notes |", "| Exercise | Sets | RPE | Notes |"),
    brief.replace("| 3. Dumbbell Overhead Press | 3 | 10–12 reps | Use one dumbbell. |", "| 3. Unsupported Custom Lift | 3 | 10–12 reps | Use one dumbbell. |"),
    brief.replace("| 3. Dumbbell Overhead Press | 3 | 10–12 reps | Use one dumbbell. |", "| 3. Dumbbell Goblet Squats | 3 | 10–12 reps | Use one dumbbell. |"),
    brief.replace("| Day 2 | Overhead Press, Farmer’s Carry, Plank |\n", ""),
    brief.replace("| Day 2 | Overhead Press, Farmer’s Carry, Plank |", "| Day 2 | Unspecified Movement |"),
    brief.replace("| 3. Dumbbell Overhead Press | 3 | 10–12 reps | Use one dumbbell. |", "| 3. Dumbbell Overhead Press | several | some reps | Use one dumbbell. |"),
  ]) {
    let calls = 0;
    assert.ok(extractMarkdownPrescription(changed, catalog).issues.length);
    await assert.rejects(generateProgram({ program: { brief: changed, scope: { startWeek: 1, weekCount: 1, daysPerWeek: 7 }, exerciseCatalog: catalog },
      system: "rules", signal: new AbortController().signal, chat: async () => { calls++; } }), /needs clarification/);
    assert.equal(calls, 0);
  }
  const contract = extractMarkdownPrescription(brief, catalog);
  assert.ok(markdownScopeProblems(contract, { daysPerWeek: 4 }).length);
  assert.deepEqual(markdownScopeProblems(contract, { daysPerWeek: 7 }), []);
});

test("main-lift table ranges are unresolved, rather than silently picking an arbitrary rep target", () => {
  const main = `| Exercise | Sets | Reps |\n|---|---|---|\n| Bench Press | 3 | 3–6 |`;
  assert.match(extractMarkdownPrescription(main, [{ name: "Bench Press", equipment: "barbell" }]).issues.join(" "), /one exact repetition target/);
});

test("conditional progression cannot be turned into an invented current inability", () => {
  const constraints = extractTrainingConstraints(brief);
  assert.ok(!constraints.excludedExercises.includes("incline push ups"));
  assert.match(trainingNarrativeProblems({ assumptions: ["The client cannot do dips or incline push-ups."] }, constraints).join(" "), /falsely describes/);
  assert.deepEqual(trainingNarrativeProblems({ assumptions: ["Dips are excluded; incline push-ups are conditional future progression, with readiness not supplied."] }, constraints), []);
});

test("pasted import headers state known provenance and unknown readiness without erasing coached guidance", () => {
  const scope = { startWeek: 1, weekCount: 1, daysPerWeek: 7 };
  const source = `${brief}\n- **Progression**:\n  - After 3 weeks, add 2 reps only if all targets are met.\n  - After 4 weeks, review the next block with the coach.\n- **Regression**: Use the band-assisted push-up if ordinary push-ups are not achievable.\n- **Safety**: Stop if there is pain.`;
  const contract = extractMarkdownPrescription(source, catalog);
  assert.deepEqual(contract.issues, []);
  const header = groundedMarkdownHeader(contract, scope);
  assert.match(header.assumptions.join(" "), /may contain public defaults; ownership by the coach is not inferred/);
  assert.match(header.assumptions.join(" "), /personal readiness is not inferred/);
  assert.match(header.progression, /After 3 weeks, add 2 reps only if all targets are met/);
  assert.match(header.progression, /After 4 weeks, review the next block/);
  assert.match(header.progression, /week 1 requested; later-week rules remain future advice/);
  assert.match(header.regression, /Use the band-assisted push-up if ordinary push-ups are not achievable/);
  assert.ok(!header.regression.includes("Safety"));
  const value = { ...header, week: { focus: header.focus } };
  assert.deepEqual(markdownHeaderProblems(value, header), []);
  for (const mutation of [
    (value) => { value.assumptions = ["Every named exercise is in the coach's own saved library."]; },
    (value) => { value.regression = "None — all prescribed movements are within the client's ability."; },
    (value) => { value.progression = "Increase load automatically; readiness has been verified."; },
  ]) {
    const wrong = structuredClone(value); mutation(wrong);
    assert.match(markdownHeaderProblems(wrong, header).join(" "), /Do not invent library ownership, personal ability/);
  }
  const unclear = `${brief}\nProgression: ${"Do something unclear. ".repeat(20)}`;
  assert.match(extractMarkdownPrescription(unclear, catalog).issues.join(" "), /too long to preserve without truncation/);
  assert.equal(extractMarkdownPrescription("Progression:\nPlease propose a progression for my next block.", []), null);
});

test("working-effort grammar keeps half-step RPE inside source bounds and preserves explicit row ranges", () => {
  const contract = extractMarkdownPrescription(brief, catalog), day = sourceWeek(contract).days[0];
  const schema = dayOutputSchema(1, day, undefined, contract).properties.day.properties.exercises.properties.group1.properties.effort;
  for (const valid of ["RPE 7", "RPE 7.5", "RPE 8", "RPE 8.5", "RPE 9", "RPE 7–9", "RPE 7.5–8.5"]) assert.ok(schema.enum.includes(valid), valid);
  for (const invalid of ["{RPE: 8}", "{RPE}", "Easy", "RPE 6", "RPE 10", "RPE 7.6"]) assert.ok(!schema.enum.includes(invalid), invalid);
  const explicit = extractMarkdownPrescription(brief.replace("Progress to dips or incline push-ups if possible.", "RPE 7–8. Progress to dips or incline push-ups if possible."), catalog);
  assert.deepEqual(explicit.issues, []);
  assert.equal(dayOutputSchema(1, sourceWeek(explicit).days[0], undefined, explicit).properties.day.properties.exercises.properties.group1.properties.effort.const, "RPE 7–8");
  const column = extractMarkdownPrescription("| Exercise | Sets | Reps | RPE |\n|---|---|---|---|\n| Bench Press | 3 | 5 | 8 |", [{ name: "Bench Press", equipment: "barbell" }]);
  assert.deepEqual(column.issues, []);
  assert.deepEqual(dayOutputSchema(1, { number: 1, exercises: [{ name: "Bench Press" }] }, undefined, column).properties.day.properties.exercises.properties.group1.properties.effort.enum, ["RPE 8"]);
  const rangedMain = extractMarkdownPrescription("| Exercise | Sets | Reps | RPE |\n|---|---|---|---|\n| Bench Press | 3 | 5 | 7–9 |", [{ name: "Bench Press", equipment: "barbell" }]);
  assert.match(rangedMain.issues.join(" "), /one exact RPE target/);
});

test("complete distance, tempo and conditional-future cues survive alongside session timing and exact rest", () => {
  const withCues = brief.replace("Hold one 5kg dumbbell.", "Hold one 5kg dumbbell, walk 3–5 meters; use a 2-second controlled turnaround.")
    .replace("Hold one 5kg dumbbell at chest.", "Hold one 5kg dumbbell at chest; use 3 seconds lowering and a 1-second pause.");
  const contract = extractMarkdownPrescription(withCues, catalog);
  assert.deepEqual(contract.issues, []);
  const carry = contract.prescriptions.find((source) => source.choices.includes("Dumbbell Farmer's Carry"));
  assert.match(carry.sourceNotes, /walk 3–5 meters; use a 2-second controlled turnaround/);
  const day = sourceWeek(contract).days[6], schema = dayOutputSchema(1, day, undefined, contract);
  for (const [index, exercise] of day.exercises.entries()) {
    const constant = schema.properties.day.properties.exercises.properties[`group${index + 1}`].properties.notes.const;
    assert.equal(constant ?? null, markdownNotes(contract, 7, exercise.name, index));
    exercise.notes = `${constant ?? ""} Coach rest: 1–1.5 min; timer starts at 1.25 min (editable).`;
  }
  assert.match(day.exercises.find((item) => item.name === "Dumbbell Farmer's Carry").notes, /Coach source cue: Hold one 5kg dumbbell, walk 3–5 meters/);
  assert.match(day.exercises.find((item) => item.name === "Dumbbell Goblet Squat").notes, /3 seconds lowering and a 1-second pause/);
  assert.match(day.exercises[0].notes, /Conditional progression in this cue is future advice, not a current prescription or evidence of ability/);
  assert.match(day.exercises[0].notes, /10 min cool-down after the workout/);
  assert.deepEqual(markdownPrescriptionProblems({ number: 1, days: [day] }, contract), []);
  for (const change of [
    (day) => { day.exercises.find((item) => item.name === "Dumbbell Farmer's Carry").notes = "Coach rest: 1–1.5 min"; },
    (day) => { day.exercises.find((item) => item.name === "Dumbbell Goblet Squat").notes = "Tempo: 2 seconds lowering"; },
    (day) => { day.exercises[0].notes = day.exercises[0].notes.replace("Conditional progression in this cue is future advice, not a current prescription or evidence of ability.", "Do dips today."); },
  ]) {
    const changed = structuredClone(day); change(changed);
    assert.match(markdownPrescriptionProblems({ number: 1, days: [changed] }, contract).join(" "), /dropped or changed its labeled coach source cue/);
  }
  const recovery = sourceWeek(contract).days[3];
  assert.ok(!markdownNotes(contract, 4, "Resistance Band Row", 0).includes("Coach source cue"));
  assert.deepEqual(markdownPrescriptionProblems({ number: 1, days: [recovery] }, contract), []);
  const tooLong = brief.replace("Hold one 5kg dumbbell.", `${"Walk 3–5 meters at a controlled tempo. ".repeat(8)}`);
  assert.match(extractMarkdownPrescription(tooLong, catalog).issues.join(" "), /too long to preserve without truncation/);
});

test("warm-up facts come only from explicit source instructions or existing coach data", () => {
  const contract = extractMarkdownPrescription(brief, catalog), day = sourceWeek(contract).days[6];
  assert.match(dayOutputSchema(1, day, undefined, contract).properties.day.properties.warmup.const, /Confirm the warm-up with your coach/);
  const source = extractMarkdownPrescription(`${brief}\nWarm-up: 4 min familiar movement, then 2 light practice sets.`, catalog);
  assert.equal(markdownWarmup(source, 7), "Coach-supplied warm-up: 4 min familiar movement, then 2 light practice sets.");
  const changed = structuredClone(day); changed.warmup = "None — cool-down follows the workout.";
  assert.match(markdownPrescriptionProblems({ number: 1, days: [changed] }, contract).join(" "), /do not invent a warm-up or claim none is needed/);
  assert.equal(markdownWarmup(contract, 7, { warmup: "Coach's saved 3 min warm-up." }), "Coach's saved 3 min warm-up.");
});

test("focused drafting fixes pasted numbers in the schema and repairs whole-day source drift", async () => {
  const contract = extractMarkdownPrescription(brief, catalog), goodWeek = sourceWeek(contract);
  let outlines = 0, days = 0;
  const attempts = new Map();
  const result = await generateProgram({ program: { brief, scope: { startWeek: 1, weekCount: 4, daysPerWeek: 4 }, exerciseCatalog: catalog },
    system: "rules", signal: new AbortController().signal, chat: async (body) => {
      if (body.format.properties.week) {
        const header = Object.fromEntries(["title", "assumptions", "progression", "regression"].map((key) => [key, body.format.properties[key].const]));
        const outline = { ...header, week: { ...structuredClone(goodWeek), focus: body.format.properties.week.properties.focus.const } };
        for (const day of outline.week.days) day.exercises = day.exercises.map(({ name }) => ({ name }));
        for (const day of outline.week.days) day.exercises = Object.fromEntries(day.exercises.map((item, index) => [`group${index + 1}`, item]));
        outline.week.days = Object.fromEntries(outline.week.days.map((day) => [`day${day.number}`, day]));
        if (++outlines === 1) delete outline.week.days.day3.exercises.group3;
        return response(outline);
      }
      days++;
      const number = body.format.properties.day.properties.number.const;
      const count = (attempts.get(number) ?? 0) + 1; attempts.set(number, count);
      const day = structuredClone(goodWeek.days[number - 1]);
      for (const [index, item] of day.exercises.entries()) {
        const schema = body.format.properties.day.properties.exercises.properties[`group${index + 1}`];
        if (number !== 4) {
          assert.equal(schema.properties.sets.const, item.sets);
          assert.deepEqual(schema.properties.dose.properties[item.dose.kind === "reps" ? "range" : "seconds"].properties.min, { const: item.dose.kind === "reps" ? item.dose.range.min : item.dose.seconds.min });
        }
        if (schema.properties.notes.const) item.notes = schema.properties.notes.const;
      }
      if (number === 3 && count === 1) day.exercises.find((item) => item.name === "Resistance Band Row").dose.range = { min: 10, max: 12 };
      day.exercises = Object.fromEntries(day.exercises.map((item, index) => [`group${index + 1}`, item]));
      return response({ day });
    } });
  assert.equal(outlines, 2);
  assert.equal(days, 8);
  assert.equal(result.weeks.length, 1);
  assert.equal(result.weeks[0].days.length, 7);
  assert.deepEqual(markdownPrescriptionProblems(result.weeks[0], contract), []);
  for (const day of result.weeks[0].days) for (const item of day.exercises) assert.equal(item.restSeconds, 75);
});
