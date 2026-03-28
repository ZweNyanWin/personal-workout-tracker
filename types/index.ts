import type { Tables } from "./database";

// ─── Core entity aliases ─────────────────────────────────────────────────────
export type Profile = Tables<"profiles">;
export type Exercise = Tables<"exercises">;
export type Program = Tables<"programs">;
export type ProgramBlock = Tables<"program_blocks">;
export type ProgramSession = Tables<"program_sessions">;
export type SessionExercise = Tables<"session_exercises">;
export type UserProgramAssignment = Tables<"user_program_assignments">;
export type UserExerciseOverride = Tables<"user_exercise_overrides">;
export type WorkoutLog = Tables<"workout_logs">;
export type WorkoutLogExercise = Tables<"workout_log_exercises">;
export type WorkoutLogSet = Tables<"workout_log_sets">;
export type BodyMetric = Tables<"body_metrics">;
export type PersonalRecord = Tables<"personal_records">;

// ─── Enriched / joined types ─────────────────────────────────────────────────

export type SessionExerciseWithExercise = SessionExercise & {
  exercise: Exercise;
  user_override?: UserExerciseOverride | null;
};

export type ProgramSessionWithExercises = ProgramSession & {
  exercises: SessionExerciseWithExercise[];
};

export type ProgramBlockWithSessions = ProgramBlock & {
  sessions: ProgramSessionWithExercises[];
};

export type ProgramWithBlocks = Program & {
  blocks: ProgramBlockWithSessions[];
};

export type WorkoutLogSetUI = WorkoutLogSet & {
  // client-side ephemeral fields
  _isDirty?: boolean;
};

export type WorkoutLogExerciseWithSets = WorkoutLogExercise & {
  exercise: Exercise;
  sets: WorkoutLogSetUI[];
  planned?: SessionExerciseWithExercise | null;
};

export type WorkoutLogFull = WorkoutLog & {
  exercises: WorkoutLogExerciseWithSets[];
  session?: ProgramSession | null;
};

export type MemberWithAssignment = Profile & {
  active_assignment?: (UserProgramAssignment & { program: Program }) | null;
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardData = {
  profile: Profile;
  activeAssignment: (UserProgramAssignment & { program: Program }) | null;
  nextSession: ProgramSession | null;
  recentLogs: WorkoutLog[];
  weeklyVolume: number;
  e1rmCards: E1rmCard[];
  recentPRs: (PersonalRecord & { exercise: Exercise })[];
  bodyweight: BodyMetric | null;
};

export type E1rmCard = {
  exercise: Exercise;
  estimated_1rm: number;
  previous_1rm: number | null;
  change: number | null;
};

// ─── Analytics ───────────────────────────────────────────────────────────────

export type VolumeDataPoint = {
  week: string;
  volume: number;
};

export type E1rmDataPoint = {
  date: string;
  value: number;
};

export type BodyweightDataPoint = {
  date: string;
  weight: number;
};

// ─── Form types (Zod-inferred) ───────────────────────────────────────────────

export type LoginFormValues = {
  email: string;
  password: string;
};

export type SignupFormValues = {
  email: string;
  password: string;
  full_name: string;
  username: string;
};

export type ProfileFormValues = {
  full_name: string;
  username: string;
};

export type LogSetFormValues = {
  weight_kg: string;
  reps: string;
  rpe: string;
};

export type ExerciseFormValues = {
  name: string;
  description: string;
  muscle_groups: string[];
  movement_type: string;
  equipment: string;
  is_compound: boolean;
  primary_lift: string;
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

export type SortOrder = "asc" | "desc";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // Lucide icon name
  adminOnly?: boolean;
};

export type SessionLabel = "Upper A" | "Lower A" | "Upper B" | "Lower B";

export type BlockLabel =
  | "Accumulation"
  | "Strength Base"
  | "Intensification"
  | "Deload-Lite"
  | "Peak"
  | "Taper"
  | "Test Week";

export type MovementType =
  | "push"
  | "pull"
  | "squat"
  | "hinge"
  | "carry"
  | "accessory"
  | "other";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "bands"
  | "other";

// ─── Server Action response wrapper ──────────────────────────────────────────

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
