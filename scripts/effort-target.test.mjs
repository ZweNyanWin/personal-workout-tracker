import assert from 'node:assert/strict';
import test from 'node:test';
import { effortProblems, programEffortProblems } from '../lib/coach/effort-validation.mjs';
import { generateProgram } from '../connector/program-generation.mjs';

test('a loading-only value cannot stand in for an effort or hold-quality target', () => {
  for (const effort of ['bodyweight', 'BODY WEIGHT ONLY.', 'BW', 'Unloaded', 'Coach-supplied load', 'Dumbbells', '7.5 kg']) {
    assert.match(effortProblems(effort).join(' '), /only load or equipment/, effort);
    assert.ok(programEffortProblems({ weeks: [{ days: [{ exercises: [{ effort }] }] }] }).length, effort);
  }
  for (const effort of ['Stop before position loss', 'Easy, comfortable effort', 'Controlled technique', 'Bodyweight; stop before position loss', 'Bodyweight at RPE 7', '2 RIR']) {
    assert.deepEqual(effortProblems(effort), [], effort);
  }
});

test('a persistent loading-only effort triggers bounded repair and never returns later days', async () => {
  let calls = 0;
  await assert.rejects(generateProgram({
    program: { brief: 'Create one week with three days of wall push-up practice.', scope: { startWeek: 1, weekCount: 1, daysPerWeek: 3 } },
    system: 'Keep coach prescriptions', signal: new AbortController().signal,
    chat: async (body) => {
      calls++;
      if (body.format.properties.week) return { done: true, message: { content: JSON.stringify({ title: 'Wall practice', assumptions: ['Proposed practice requires coach review'], progression: 'Coach review', regression: 'Stop on position loss', week: { number: 1, focus: 'Practice', days: [1, 2, 3].map(number => ({ number, title: 'Wall practice', warmup: 'Gradual practice', exercises: [{ name: 'Wall Push-up' }] })) } }) } };
      return { done: true, message: { content: JSON.stringify({ day: { number: body.format.properties.day.properties.number.const, title: 'Wall practice', warmup: 'Gradual practice', exercises: { group1: { name: 'Wall Push-up', sets: 2, dose: { kind: 'reps', range: { min: 7, max: 7 }, perSide: false }, loadOrAssistance: 'Bodyweight', effort: 'bodyweight', restSeconds: 90, restIsExplicit: true, notes: '' } } } }) } };
    },
  }), /after three attempts for day 1.*only load or equipment/i);
  assert.equal(calls, 4, 'One outline and three failed first-day repairs, without later-day calls');
});
