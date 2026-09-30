# Step 3: build useful workout-coach data

Do not fine-tune yet. First establish a baseline with a local model and collect
examples of the *decisions* you want it to make. Your 16-week peak is one program
record among future programs, not the model's default training philosophy.

## This week

1. Keep the 16-week plan as program data in the tracker. Label every target as
   `planned`; only completed workout logs are evidence of performed lifts. Keep
   high-bar, low-bar, Larsen, paused, and competition variants distinct.
2. For 30–50 real coach questions, save a small JSON record with: goal, current
   program/week/session, the last relevant **completed** sets with RPE and dates,
   recovery notes if voluntarily provided, the user's question, and a carefully
   written ideal answer. Remove names and sensitive health details before using
   records for training.
3. Include different situations: a successful progression, missed reps, a
   deload, a changed schedule, no prior logs, and a non-peaking/general-fitness
   program. The answer should explain its evidence, uncertainty, and next action.
4. Put these examples in a **training** file separate from
   [`evals/coach-v1.jsonl`](evals/coach-v1.jsonl). Never train on the evaluation
   prompts or ideal criteria; those 32 held-out cases are your exam.
5. Run the 32 cases against the unmodified local model and score each `must` and
   `must_not` criterion. Save that baseline. Try better prompts and retrieving
   the relevant program/log data first. Fine-tune only if the model still fails
   important repeated patterns.

Suggested training-example shape (illustrative, not an evaluation answer):

```json
{
  "input": {
    "goal": "build bench strength",
    "plan": {"exercise": "bench press", "sets": 3, "reps": 5, "weight_kg": 102.5},
    "completed_logs": [{"date": "2026-09-23", "exercise": "bench press", "sets_completed": "3x5", "weight_kg": 100, "rpe": 8}],
    "question": "Should I try the planned load next session?"
  },
  "ideal_answer": "The 102.5 kg is a planned target, not a completed result. Your latest logged 100 kg 3x5 at RPE 8 supports trying a small increase if recovery and technique are normal. Keep the planned load adjustable if warm-ups or the first work set feel unexpectedly hard."
}
```

For 1RM math, use the deterministic in-tracker calculator, not the language
model. The coach may *explain* an estimate, but must never promote a planned PR
attempt into an achieved result.
