import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(2, "Name must be at least 2 characters").max(60),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores"),
});

export const profileSchema = z.object({
  full_name: z.string().min(2).max(60),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/),
});

export const logSetSchema = z.object({
  weight_kg: z
    .string()
    .refine((v) => v === "" || !isNaN(parseFloat(v)), "Invalid weight"),
  reps: z
    .string()
    .refine((v) => v === "" || (!isNaN(parseInt(v)) && parseInt(v) > 0), "Invalid reps"),
  rpe: z
    .string()
    .refine(
      (v) =>
        v === "" ||
        (!isNaN(parseFloat(v)) && parseFloat(v) >= 5 && parseFloat(v) <= 10),
      "RPE must be between 5 and 10"
    ),
});

export const exerciseSchema = z.object({
  name: z.string().min(2, "Name required").max(100),
  description: z.string().max(500).optional().default(""),
  muscle_groups: z.array(z.string()).min(1, "Select at least one muscle group"),
  movement_type: z.string().min(1, "Select movement type"),
  equipment: z.string().min(1, "Select equipment"),
  is_compound: z.boolean().default(false),
  primary_lift: z.enum(["bench", "squat", "deadlift", ""]).default(""),
});

export const sessionExerciseSchema = z.object({
  target_sets: z.coerce.number().int().min(1).max(20).nullable(),
  target_reps: z.string().max(20).nullable(),
  target_rpe: z.coerce.number().min(5).max(10).nullable(),
  target_weight_kg: z.coerce.number().min(0).nullable(),
  percent_1rm: z.coerce.number().min(0).max(120).nullable(),
  rest_seconds: z.coerce.number().int().min(0).nullable(),
  notes: z.string().max(500).nullable(),
  is_warmup: z.boolean().default(false),
});

export const bodyweightSchema = z.object({
  bodyweight_kg: z.coerce
    .number()
    .min(30, "Must be at least 30 kg")
    .max(300, "Must be less than 300 kg"),
  date: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type LogSetInput = z.infer<typeof logSetSchema>;
export type ExerciseInput = z.infer<typeof exerciseSchema>;
export type SessionExerciseInput = z.infer<typeof sessionExerciseSchema>;
export type BodyweightInput = z.infer<typeof bodyweightSchema>;
