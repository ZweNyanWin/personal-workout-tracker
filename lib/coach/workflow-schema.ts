import { z } from "zod";
import { exercisePrescriptionSchema, programDraftSchema } from "./program.ts";
import { programEffortProblems } from "./effort-validation.mjs";

export const coachingScopeSchema = z.object({
  startWeek: z.number().int().min(1).max(52),
  weekCount: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
}).strict().refine((scope) => scope.startWeek + scope.weekCount - 1 <= 52, "Week range exceeds 52");

export const coachingPrescriptionSchema = exercisePrescriptionSchema.extend({ notes: z.string().trim().max(1200).optional() }).superRefine((exercise, context) => {
  if (exercise.restRangeMinutes && exercise.restSeconds !== 300) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["restSeconds"], message: "The suggested 4–6 min range uses a 5 min timer default." });
  }
  if (exercise.restRangeMinutes) {
    const rpe = /\bRPE\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/i.exec(exercise.effort);
    if (!rpe || Math.max(Number(rpe[1]), Number(rpe[2] ?? rpe[1])) <= 7.5) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["effort"], message: "The suggested rest range applies above RPE 7.5." });
    }
  }
});
export const workflowProgramDraftSchema = programDraftSchema.extend({
  weeks: z.array(z.object({
    number: z.number().int().min(1).max(52),
    focus: z.string().trim().min(1).max(1200),
    days: z.array(z.object({
      number: z.number().int().min(1).max(7),
      title: z.string().trim().min(1).max(1200),
      warmup: z.string().trim().min(1).max(1200),
      exercises: z.array(coachingPrescriptionSchema).min(1).max(12),
    }).strict()).min(1).max(7),
  }).strict()).min(1).max(16),
});

export type CoachingScope = z.infer<typeof coachingScopeSchema>;
export type WorkflowProgramDraft = z.infer<typeof workflowProgramDraftSchema>;
export type CoachingDraftRecord = {
  id: string; member_id: string; coach_id: string; brief: string;
  scope: CoachingScope; content: WorkflowProgramDraft | null;
  revision: number; status: "draft" | "approved";
  generation_job_id: string | null; generation_revision: number | null; assignment_id: string | null;
  created_at: string; updated_at: string;
};
export type CoachingProfile = {
  member_id: string; training_context: string; coach_rules: string; nutrition_targets: string;
};
export type CoachingReviewRequest = {
  id: string; member_id: string; assignment_id: string | null;
  message: string; status: "open" | "resolved"; created_at: string;
};

/** Reject incomplete or duplicated calendar coverage before a draft can be assigned. */
export function validateWorkflowProgramDraft(value: unknown, requested: CoachingScope): WorkflowProgramDraft {
  const scope = coachingScopeSchema.parse(requested);
  const draft = workflowProgramDraftSchema.parse(value);
  const effortIssues = programEffortProblems(draft);
  if (effortIssues.length) throw new Error(effortIssues.join(" "));
  if (draft.weeks.length !== scope.weekCount) throw new Error("Every requested week must be present exactly once");
  const weeks = new Set(draft.weeks.map((week) => week.number));
  if (weeks.size !== scope.weekCount) throw new Error("Duplicate week numbers");
  for (let number = scope.startWeek; number < scope.startWeek + scope.weekCount; number++) {
    if (!weeks.has(number)) throw new Error(`Week ${number} is missing`);
  }
  for (const week of draft.weeks) {
    const days = new Set(week.days.map((day) => day.number));
    if (week.days.length !== scope.daysPerWeek || days.size !== scope.daysPerWeek) throw new Error(`Week ${week.number} must contain each training day exactly once`);
    for (let day = 1; day <= scope.daysPerWeek; day++) {
      if (!days.has(day)) throw new Error(`Week ${week.number}, day ${day} is missing`);
    }
  }
  return draft;
}
