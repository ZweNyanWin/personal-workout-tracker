-- ============================================================
-- PowerBuild Tracker — Row Level Security Policies
-- Run AFTER 001_schema.sql
-- ============================================================

-- ─── Enable RLS on all tables ────────────────────────────────
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises               ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_blocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_exercises       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exercise_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_log_exercises   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_log_sets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_metrics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records        ENABLE ROW LEVEL SECURITY;

-- ─── Admin helper (SECURITY DEFINER — cannot be bypassed) ────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── profiles ────────────────────────────────────────────────
CREATE POLICY "profiles: users read own"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "profiles: users update own"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (
    -- members cannot escalate their own role
    (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()))
    OR is_admin()
  );

-- ─── exercises ───────────────────────────────────────────────
CREATE POLICY "exercises: authenticated read"
  ON exercises FOR SELECT
  USING (auth.uid() IS NOT NULL AND (is_public = TRUE OR created_by = auth.uid() OR is_admin()));

CREATE POLICY "exercises: authenticated create"
  ON exercises FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "exercises: owner or admin update"
  ON exercises FOR UPDATE
  USING (created_by = auth.uid() OR is_admin());

CREATE POLICY "exercises: admin delete"
  ON exercises FOR DELETE
  USING (is_admin());

-- ─── programs ────────────────────────────────────────────────
CREATE POLICY "programs: authenticated read"
  ON programs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "programs: admin all"
  ON programs FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── program_blocks ──────────────────────────────────────────
CREATE POLICY "program_blocks: authenticated read"
  ON program_blocks FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "program_blocks: admin all"
  ON program_blocks FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── program_sessions ────────────────────────────────────────
CREATE POLICY "program_sessions: authenticated read"
  ON program_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "program_sessions: admin all"
  ON program_sessions FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── session_exercises ───────────────────────────────────────
CREATE POLICY "session_exercises: authenticated read"
  ON session_exercises FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "session_exercises: admin all"
  ON session_exercises FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── user_program_assignments ────────────────────────────────
CREATE POLICY "assignments: users read own"
  ON user_program_assignments FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "assignments: admin all"
  ON user_program_assignments FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Members can update their own current_session_index
CREATE POLICY "assignments: users update own index"
  ON user_program_assignments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── user_exercise_overrides ─────────────────────────────────
CREATE POLICY "overrides: users manage own"
  ON user_exercise_overrides FOR ALL
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- ─── workout_logs ────────────────────────────────────────────
CREATE POLICY "workout_logs: users manage own"
  ON workout_logs FOR ALL
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- ─── workout_log_exercises ───────────────────────────────────
CREATE POLICY "log_exercises: via workout_log ownership"
  ON workout_log_exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workout_logs wl
      WHERE wl.id = workout_log_id
        AND (wl.user_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_logs wl
      WHERE wl.id = workout_log_id
        AND (wl.user_id = auth.uid() OR is_admin())
    )
  );

-- ─── workout_log_sets ────────────────────────────────────────
CREATE POLICY "log_sets: via workout_log ownership"
  ON workout_log_sets FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM workout_log_exercises wle
      JOIN workout_logs wl ON wl.id = wle.workout_log_id
      WHERE wle.id = log_exercise_id
        AND (wl.user_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workout_log_exercises wle
      JOIN workout_logs wl ON wl.id = wle.workout_log_id
      WHERE wle.id = log_exercise_id
        AND (wl.user_id = auth.uid() OR is_admin())
    )
  );

-- ─── body_metrics ────────────────────────────────────────────
CREATE POLICY "body_metrics: users manage own"
  ON body_metrics FOR ALL
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- ─── personal_records ────────────────────────────────────────
CREATE POLICY "personal_records: users manage own"
  ON personal_records FOR ALL
  USING (user_id = auth.uid() OR is_admin())
  WITH CHECK (user_id = auth.uid() OR is_admin());
