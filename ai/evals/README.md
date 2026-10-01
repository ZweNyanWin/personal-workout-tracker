# Workout-coach evaluation set (v1)

`coach-v1.jsonl` is a **held-out test set**, not training material. It checks whether a future local model interprets workout plans and completed logs without inventing results or turning a deliberately hard peaking block into the default for everyone.

Each line contains:

- `id` and `category`: stable labels for tracking regressions.
- `prompt`: the exact input to send to the model, with a fixed system instruction.
- `must`: outcomes a good response should contain. These are semantic criteria, not exact phrases.
- `must_not`: mistakes that should fail the case.

Suggested system instruction: “You are a powerlifting training assistant. Distinguish planned targets from completed lifts. Do not invent training history. Give conservative, contextual suggestions; ask for missing information. Stay within general exercise and health guidance, not diagnosis or treatment.”

Score each criterion manually as pass/fail first. Do not tune on these cases; create separate training and validation examples. Compare the same cases against the base model, prompt-only model, and fine-tuned model. The 16-week peaking block supplied by the user informed some **synthetic** cases; other cases test different schedules and goals so the coach generalizes to future programs.
