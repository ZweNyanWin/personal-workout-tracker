-- ============================================================
-- PowerBuild Tracker — Initial Schema
-- Run this in Supabase SQL Editor (in order)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Profiles ────────────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  full_name   TEXT,
  username    TEXT UNIQUE,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─── Exercises ───────────────────────────────────────────────
CREATE TABLE exercises (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  muscle_groups  TEXT[] NOT NULL DEFAULT '{}',
  movement_type  TEXT CHECK (movement_type IN ('push','pull','squat','hinge','carry','accessory','other')),
  equipment      TEXT CHECK (equipment IN ('barbell','dumbbell','cable','machine','bodyweight','kettlebell','bands','other')),
  is_compound    BOOLEAN NOT NULL DEFAULT FALSE,
  primary_lift   TEXT CHECK (primary_lift IN ('bench','squat','deadlift')),
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_public      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Programs (master templates) ─────────────────────────────
CREATE TABLE programs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_template BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─── Program Blocks ──────────────────────────────────────────
CREATE TABLE program_blocks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id     UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  order_index    INTEGER NOT NULL,
  duration_weeks INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Program Sessions ────────────────────────────────────────
-- session_order drives Upper A → Lower A → Upper B → Lower B cycle
CREATE TABLE program_sessions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  block_id      UUID NOT NULL REFERENCES program_blocks(id) ON DELETE CASCADE,
  program_id    UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,   -- "Upper A", "Lower A", "Upper B", "Lower B"
  session_order INTEGER NOT NULL, -- 0, 1, 2, 3 — drives the cycle
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Session Exercises ────────────────────────────────────────
CREATE TABLE session_exercises (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       UUID NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
  exercise_id      UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  order_index      INTEGER NOT NULL,
  target_sets      INTEGER,
  target_reps      TEXT,         -- "3-5", "8-10", "5" — flexible string
  target_rpe       NUMERIC(3,1),
  target_weight_kg NUMERIC(6,2),
  percent_1rm      NUMERIC(5,2),
  rest_seconds     INTEGER,
  notes            TEXT,
  is_warmup        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── User Program Assignments ────────────────────────────────
CREATE TABLE user_program_assignments (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id            UUID NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  assigned_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  current_session_index INTEGER NOT NULL DEFAULT 0,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, program_id)
);

-- ─── User Exercise Overrides ─────────────────────────────────
-- Per-user customization layer — never mutates the master session_exercises row
CREATE TABLE user_exercise_overrides (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_exercise_id  UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  override_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL, -- substitution
  target_sets          INTEGER,
  target_reps          TEXT,
  target_rpe           NUMERIC(3,1),
  target_weight_kg     NUMERIC(6,2),
  percent_1rm          NUMERIC(5,2),
  rest_seconds         INTEGER,
  notes                TEXT,
  is_deleted           BOOLEAN NOT NULL DEFAULT FALSE, -- hide exercise for this user
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, session_exercise_id)
);

CREATE TRIGGER user_exercise_overrides_updated_at
  BEFORE UPDATE ON user_exercise_overrides
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─── Workout Logs ─────────────────────────────────────────────
CREATE TABLE workout_logs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES program_sessions(id) ON DELETE SET NULL,
  assignment_id    UUID REFERENCES user_program_assignments(id) ON DELETE SET NULL,
  title            TEXT,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  duration_minutes INTEGER,
  status           TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress','completed','skipped')),
  bodyweight_kg    NUMERIC(5,2),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER workout_logs_updated_at
  BEFORE UPDATE ON workout_logs
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─── Workout Log Exercises ────────────────────────────────────
CREATE TABLE workout_log_exercises (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_log_id      UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_id         UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  session_exercise_id UUID REFERENCES session_exercises(id) ON DELETE SET NULL,
  order_index         INTEGER NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Workout Log Sets ─────────────────────────────────────────
CREATE TABLE workout_log_sets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  log_exercise_id UUID NOT NULL REFERENCES workout_log_exercises(id) ON DELETE CASCADE,
  set_number      INTEGER NOT NULL,
  weight_kg       NUMERIC(6,2),
  reps            INTEGER,
  rpe             NUMERIC(3,1),
  is_warmup       BOOLEAN NOT NULL DEFAULT FALSE,
  is_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Body Metrics ─────────────────────────────────────────────
CREATE TABLE body_metrics (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  bodyweight_kg NUMERIC(5,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- ─── Personal Records ─────────────────────────────────────────
CREATE TABLE personal_records (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id    UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  record_type    TEXT NOT NULL CHECK (record_type IN ('1rm','estimated_1rm','volume')),
  value          NUMERIC(8,2) NOT NULL,
  reps           INTEGER,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  workout_log_id UUID REFERENCES workout_logs(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Useful indexes ───────────────────────────────────────────
CREATE INDEX idx_workout_logs_user_date   ON workout_logs (user_id, date DESC);
CREATE INDEX idx_workout_logs_status      ON workout_logs (status);
CREATE INDEX idx_log_sets_exercise        ON workout_log_sets (log_exercise_id);
CREATE INDEX idx_body_metrics_user_date   ON body_metrics (user_id, date DESC);
CREATE INDEX idx_personal_records_user    ON personal_records (user_id, exercise_id, date DESC);
CREATE INDEX idx_user_overrides_user      ON user_exercise_overrides (user_id);
CREATE INDEX idx_session_exercises_session ON session_exercises (session_id, order_index);
