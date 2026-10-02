import { z } from "zod";

const text = z.string().trim().min(1).max(1200);
const range = (maximum: number) => z.object({
  min: z.number().int().min(1).max(maximum),
  max: z.number().int().min(1).max(maximum),
}).strict().refine(({ min, max }) => min <= max, "Range is reversed");

export const exercisePrescriptionSchema = z.object({
  name: text,
  sets: z.number().int().min(1).max(10),
  dose: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("reps"), range: range(100), perSide: z.boolean() }).strict(),
    z.object({ kind: z.literal("hold"), seconds: range(120) }).strict(),
  ]),
  loadOrAssistance: text,
  effort: text,
  restSeconds: z.number().int().min(15).max(600),
  restRangeMinutes: z.object({ min: z.literal(4), max: z.literal(6) }).strict().optional(),
}).strict();

export const programDraftSchema = z.object({
  title: text,
  status: z.literal("proposed"),
  assumptions: z.array(text).min(1).max(12),
  progression: text,
  regression: text,
  weeks: z.array(z.object({
    number: z.number().int().min(1).max(52),
    focus: text,
    days: z.array(z.object({
      number: z.number().int().min(1).max(7),
      title: text,
      warmup: text,
      exercises: z.array(exercisePrescriptionSchema).min(1).max(12),
    }).strict()).min(1).max(7),
  }).strict()).min(1).max(52),
}).strict();

const requestSchema = z.object({
  startWeek: z.number().int().min(1).max(52),
  weekCount: z.number().int().min(1).max(52),
  daysPerWeek: z.number().int().min(1).max(7),
}).strict().refine(({ startWeek, weekCount }) => startWeek + weekCount - 1 <= 52);

export type ProgramDraft = z.infer<typeof programDraftSchema>;
export type ExercisePrescription = z.infer<typeof exercisePrescriptionSchema>;
export type BlockRequest = z.infer<typeof requestSchema>;

/** Structural acceptance gate, not a substitute for checking coaching quality. */
export function validateProgramDraft(value: unknown, request: BlockRequest): ProgramDraft {
  const scope = requestSchema.parse(request);
  const draft = programDraftSchema.parse(value);
  if (draft.weeks.length !== scope.weekCount) throw new Error("Requested weeks are missing or extra");
  const numbers = new Set(draft.weeks.map((week) => week.number));
  for (let number = scope.startWeek; number < scope.startWeek + scope.weekCount; number++) {
    if (!numbers.has(number)) throw new Error(`Week ${number} is missing or duplicated`);
  }
  for (const week of draft.weeks) {
    const days = new Set(week.days.map((day) => day.number));
    if (week.days.length !== scope.daysPerWeek || days.size !== scope.daysPerWeek) {
      throw new Error(`Week ${week.number} has missing, extra, or duplicate training days`);
    }
    for (let day = 1; day <= scope.daysPerWeek; day++) {
      if (!days.has(day)) throw new Error(`Week ${week.number}, day ${day} is missing`);
    }
  }
  return draft;
}

type Movement = { name: string; load: string; reps?: [number, number]; hold?: [number, number]; perSide?: boolean };
const GYM: Record<string, Movement[]> = {
  "Full body A": [
    { name: "Squat variation", load: "Choose a familiar, controlled squat and load", reps: [5, 8] },
    { name: "Bench press", load: "Choose a load that leaves the stated reps in reserve", reps: [5, 8] },
    { name: "Chest-supported row", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Romanian deadlift", load: "Choose a familiar, controlled load", reps: [6, 10] },
    { name: "Plank", load: "Bodyweight; end before position loss", hold: [15, 25] },
  ],
  "Full body B": [
    { name: "Deadlift variation", load: "Choose a familiar variation and submaximal load", reps: [3, 5] },
    { name: "Dumbbell overhead press", load: "Adjust load to the effort target", reps: [6, 10] },
    { name: "Lat pulldown", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Supported split squat", load: "Bodyweight or a manageable load; stable support", reps: [6, 10], perSide: true },
    { name: "Dead bug", load: "Bodyweight; keep trunk control", reps: [6, 10], perSide: true },
  ],
  "Full body C": [
    { name: "Goblet squat", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Dumbbell bench press", load: "Adjust load to the effort target", reps: [6, 10] },
    { name: "Cable row", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Hamstring curl", load: "Adjust load to the effort target", reps: [10, 15] },
    { name: "Side plank", load: "Bodyweight; use knee support if needed, each side", hold: [10, 20] },
  ],
  "Upper A": [
    { name: "Bench press", load: "Select a load from completed logs and the effort target", reps: [5, 8] },
    { name: "Assisted or strict pull-up", load: "Secure bar; select enough assistance to retain reserve", reps: [5, 8] },
    { name: "Incline dumbbell press", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Chest-supported row", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Triceps pushdown", load: "Adjust load to the effort target", reps: [10, 15] },
  ],
  "Lower A": [
    { name: "Squat variation", load: "Choose a familiar variation and submaximal load", reps: [5, 8] },
    { name: "Romanian deadlift", load: "Choose a familiar, controlled load", reps: [6, 10] },
    { name: "Leg press", load: "Adjust load to the effort target", reps: [10, 15] },
    { name: "Calf raise", load: "Bodyweight or manageable load, stable support", reps: [10, 15] },
    { name: "Plank", load: "Bodyweight; end before position loss", hold: [15, 25] },
  ],
  "Upper B": [
    { name: "Dumbbell overhead press", load: "Adjust load to the effort target", reps: [6, 10] },
    { name: "Lat pulldown", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Paused bench press", load: "Choose a familiar submaximal load; keep variant separate", reps: [5, 8] },
    { name: "Cable row", load: "Adjust load to the effort target", reps: [8, 12] },
    { name: "Dumbbell curl", load: "Adjust load to the effort target", reps: [10, 15] },
  ],
  "Lower B": [
    { name: "Deadlift variation", load: "Choose a familiar variation and submaximal load", reps: [3, 5] },
    { name: "Supported split squat", load: "Bodyweight or manageable load; stable support", reps: [6, 10], perSide: true },
    { name: "Hamstring curl", load: "Adjust load to the effort target", reps: [10, 15] },
    { name: "Calf raise", load: "Bodyweight or manageable load, stable support", reps: [10, 15] },
    { name: "Dead bug", load: "Bodyweight; keep trunk control", reps: [6, 10], perSide: true },
  ],
};
const BODYWEIGHT: Record<string, Movement[]> = {
  "Upper A": [
    { name: "Incline push-up", load: "Stable support high enough for controlled sets", reps: [6, 10] },
    { name: "Feet-assisted pull-up", load: "Secure low bar and stable foot support; assistance as needed", reps: [5, 8] },
    { name: "Feet-assisted ring row", load: "Rated secure rings/anchor; more upright to reduce difficulty", reps: [6, 10] },
    { name: "Dead bug", load: "Bodyweight; maintain trunk control", reps: [6, 10], perSide: true },
  ],
  "Upper B": [
    { name: "Incline push-up", load: "Stable support; select height for the effort target", reps: [6, 10] },
    { name: "Feet-assisted ring row", load: "Rated secure rings/anchor; more upright to reduce difficulty", reps: [6, 10] },
    { name: "Feet-assisted pull-up", load: "Secure low bar and stable foot support; assistance as needed", reps: [5, 8] },
    { name: "Plank", load: "Bodyweight; regress to knees if needed", hold: [10, 20] },
  ],
  "Lower A": [
    { name: "Bodyweight squat", load: "Stable support if needed", reps: [8, 12] },
    { name: "Glute bridge", load: "Bodyweight", reps: [10, 15] },
    { name: "Supported split squat", load: "Bodyweight; stable support", reps: [6, 10], perSide: true },
    { name: "Standing calf raise", load: "Bodyweight; stable support", reps: [10, 15] },
    { name: "Side plank", load: "Knee-supported if needed, each side", hold: [10, 20] },
  ],
  "Lower B": [
    { name: "Supported reverse lunge", load: "Bodyweight; stable support", reps: [6, 10], perSide: true },
    { name: "Glute bridge", load: "Bodyweight", reps: [10, 15] },
    { name: "Bodyweight squat", load: "Stable support if needed", reps: [8, 12] },
    { name: "Standing calf raise", load: "Bodyweight; stable support", reps: [10, 15] },
    { name: "Dead bug", load: "Bodyweight; maintain trunk control", reps: [6, 10], perSide: true },
  ],
  "Full body A": [
    { name: "Incline push-up", load: "Stable support high enough for controlled sets", reps: [6, 10] },
    { name: "Feet-assisted pull-up", load: "Secure low bar and stable foot support; assistance as needed", reps: [5, 8] },
    { name: "Supported split squat", load: "Bodyweight; stable support", reps: [6, 10], perSide: true },
    { name: "Glute bridge", load: "Bodyweight", reps: [10, 15] },
    { name: "Plank", load: "Bodyweight; regress to knees if needed", hold: [10, 20] },
  ],
  "Full body B": [
    { name: "Bodyweight squat", load: "Stable support if needed", reps: [8, 12] },
    { name: "Incline push-up", load: "Stable support; select height for the effort target", reps: [6, 10] },
    { name: "Feet-assisted ring row", load: "Rated secure rings/anchor; more upright to reduce difficulty", reps: [6, 10] },
    { name: "Glute bridge", load: "Bodyweight", reps: [10, 15] },
    { name: "Dead bug", load: "Bodyweight; maintain trunk control", reps: [6, 10], perSide: true },
  ],
  "Full body C": [
    { name: "Supported reverse lunge", load: "Bodyweight; stable support", reps: [6, 10], perSide: true },
    { name: "Incline push-up", load: "Stable support; select height for the effort target", reps: [6, 10] },
    { name: "Feet-assisted pull-up", load: "Secure low bar and stable foot support", reps: [5, 8] },
    { name: "Standing calf raise", load: "Bodyweight; stable support", reps: [10, 15] },
    { name: "Side plank", load: "Knee-supported if needed, each side", hold: [10, 20] },
  ],
};

/** Authored UI example. No model inference, log access, or personal load selection. */
export function createExampleBlock(weekCount: number, daysPerWeek: number, equipment: "gym" | "bodyweight"): ProgramDraft {
  if (![4, 8, 16].includes(weekCount) || ![2, 3, 4].includes(daysPerWeek)) throw new Error("Unsupported example schedule");
  if (equipment !== "gym" && equipment !== "bodyweight") throw new Error("Unsupported example equipment");
  const titles = daysPerWeek === 4
    ? ["Upper A", "Lower A", "Upper B", "Lower B"]
    : ["Full body A", "Full body B", "Full body C", "Full body A"].slice(0, daysPerWeek);
  const library = equipment === "gym" ? GYM : BODYWEIGHT;
  return validateProgramDraft({
    title: equipment === "gym" ? "Strength foundations · example" : "Calisthenics foundations · example",
    status: "proposed",
    assumptions: [
      "Illustrative template for an adult who can perform these movements comfortably. It has not been personalized to your goal or history.",
      equipment === "gym" ? "Familiar gym equipment, safe setup, and no active injury symptoms." : "Floor, stable incline support, rated low pull-up bar and securely anchored rings. Without these, the pulling exercises need replacement.",
      daysPerWeek === 4 ? "Suggested spacing: Mon upper, Tue lower, Thu upper, Fri lower. Start with fewer days if current training and recovery do not support four." : "Use nonconsecutive training days and adjust the schedule to recovery.",
      "Loads and assistance remain to be selected from completed performance. Warm-ups are additional to working sets.",
    ],
    progression: "Start at the low end of each range. Add repetitions only when every set retains the stated reserve and control. After repeated sessions at the top of the range, use one small load increment or reduce assistance; return to the low end. Calendar weeks alone do not authorize harder work.",
    regression: "After missed reps or unexpected fatigue, repeat or reduce the load/difficulty and optional sets. Stop painful movements and obtain appropriate assessment. Every fourth week illustrates reduced sets; adjust its timing to actual fatigue.",
    weeks: Array.from({ length: weekCount }, (_, index) => {
      const reduced = (index + 1) % 4 === 0;
      return {
        number: index + 1,
        focus: reduced ? "Reduced workload · review recovery" : index === 0 ? "Find a manageable starting point" : "Repeat or progress only when ready",
        days: titles.map((title, day) => ({
          number: day + 1, title,
          warmup: "5–8 minutes of easy movement, then controlled rehearsal and lighter ramp-up sets for the session's main exercises. These do not count as working sets.",
          exercises: library[title].map((movement, exercise) => ({
            name: movement.name,
            sets: reduced || exercise >= 2 ? 2 : 3,
            dose: movement.hold ? { kind: "hold", seconds: { min: movement.hold[0], max: movement.hold[1] } } : { kind: "reps", range: { min: movement.reps![0], max: movement.reps![1] }, perSide: movement.perSide === true },
            loadOrAssistance: movement.load,
            effort: movement.hold ? "End while position remains controlled; do not hold to collapse" : reduced ? "3–4 reps in reserve" : "2–3 reps in reserve",
            restSeconds: movement.hold || exercise >= 2 ? 90 : 180,
          })),
        })),
      };
    }),
  }, { startWeek: 1, weekCount, daysPerWeek });
}
