import { z } from "zod";

export const businessStatusSchema = z.enum(["trial", "active", "paused"]);
export const coachBusinessMetricSchema = z.object({
  id: z.string().uuid(), name: z.string(), status: businessStatusSchema, plan: z.literal("free_test"),
  created_at: z.string(), owner_user_id: z.string().uuid(), coach_email: z.string(), coach_name: z.string().nullable(),
  coaches: z.number().int().nonnegative(), clients: z.number().int().nonnegative(), active_programs: z.number().int().nonnegative(),
  drafts_30_days: z.number().int().nonnegative(), messages_30_days: z.number().int().nonnegative(), last_workout_at: z.string().nullable(),
}).strict();
export type CoachBusinessMetric = z.infer<typeof coachBusinessMetricSchema>;
export const createCoachBusinessSchema = z.object({
  name: z.string().trim().min(1, "Enter the business name").max(120),
  email: z.string().trim().email("Enter the coach's account email").max(320),
}).strict();
