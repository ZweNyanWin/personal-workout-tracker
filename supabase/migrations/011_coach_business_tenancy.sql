-- Separate the platform operator from coach businesses. No paid plan or billing
-- integration is created. Memberships are deliberately single-business in v1.
BEGIN;

CREATE TABLE platform_operators (
 user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coach_organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','paused')),
 plan text NOT NULL DEFAULT 'free_test' CHECK (plan = 'free_test'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coach_memberships (
 user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES coach_organizations(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK (role IN ('coach','client')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_memberships_organization ON coach_memberships(organization_id,role);
CREATE TRIGGER coach_organizations_updated_at BEFORE UPDATE ON coach_organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Preserve each existing coach's business. Only an unambiguous existing single
-- administrator becomes the platform operator; multiple admins need an explicit
-- operator grant by the database owner. Signup metadata never grants either role.
INSERT INTO coach_organizations(name,owner_user_id)
 SELECT coalesce(nullif(btrim(full_name),''),'My coaching business'),id
 FROM profiles WHERE role='admin';
INSERT INTO coach_memberships(user_id,organization_id,role)
 SELECT owner_user_id,id,'coach' FROM coach_organizations;
INSERT INTO platform_operators(user_id)
 SELECT id FROM profiles WHERE role='admin' AND (SELECT count(*) FROM profiles WHERE role='admin')=1;
WITH historical_coaches AS (
 SELECT user_id AS member_id,assigned_by AS coach_id FROM user_program_assignments WHERE assigned_by IS NOT NULL
 UNION SELECT member_id,coach_id FROM coaching_drafts
 UNION SELECT member_id,updated_by FROM coaching_profiles
), unique_coaches AS (
 SELECT h.member_id,min(h.coach_id::text)::uuid AS coach_id FROM historical_coaches h
 JOIN coach_organizations o ON o.owner_user_id=h.coach_id
 GROUP BY h.member_id HAVING count(DISTINCT h.coach_id)=1
)
INSERT INTO coach_memberships(user_id,organization_id,role)
 SELECT u.member_id,o.id,'client' FROM unique_coaches u JOIN coach_organizations o ON o.owner_user_id=u.coach_id
 WHERE NOT EXISTS(SELECT 1 FROM coach_memberships m WHERE m.user_id=u.member_id);
INSERT INTO coach_memberships(user_id,organization_id,role)
 SELECT p.id,o.id,'client' FROM profiles p CROSS JOIN coach_organizations o
 WHERE (SELECT count(*) FROM coach_organizations)=1
 AND NOT EXISTS(SELECT 1 FROM coach_memberships m WHERE m.user_id=p.id);

-- Persist the tenant on source roots: ON DELETE SET NULL for created_by must
-- never turn a former coach's private template into a global seed resource.
ALTER TABLE programs ADD COLUMN organization_id uuid REFERENCES coach_organizations(id) ON DELETE RESTRICT;
ALTER TABLE exercises ADD COLUMN organization_id uuid REFERENCES coach_organizations(id) ON DELETE RESTRICT;
UPDATE programs p SET organization_id=coalesce(
 (SELECT organization_id FROM coach_memberships WHERE user_id=p.created_by),
 (SELECT organization_id FROM coach_memberships WHERE user_id=p.client_id));
UPDATE exercises e SET organization_id=coalesce(
 (SELECT organization_id FROM coach_memberships WHERE user_id=e.created_by),
 (SELECT organization_id FROM coach_memberships WHERE user_id=e.coaching_client_id));
CREATE INDEX programs_business ON programs(organization_id);
CREATE INDEX exercises_business ON exercises(organization_id);

ALTER TABLE platform_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_operators,coach_organizations,coach_memberships FROM PUBLIC,anon,authenticated;
GRANT SELECT ON platform_operators,coach_organizations,coach_memberships TO authenticated;
GRANT ALL ON platform_operators,coach_organizations,coach_memberships TO service_role;

CREATE OR REPLACE FUNCTION is_platform_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM platform_operators WHERE user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION current_coach_organization()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT organization_id FROM coach_memberships WHERE user_id=auth.uid() AND status='active';
$$;
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM coach_memberships m JOIN coach_organizations o ON o.id=m.organization_id
  WHERE m.user_id=auth.uid() AND m.role='coach' AND m.status='active' AND o.status IN ('trial','active')
 );
$$;
CREATE OR REPLACE FUNCTION can_coach_member(p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT is_admin() AND EXISTS(SELECT 1 FROM coach_memberships
  WHERE user_id=p_member_id AND organization_id=current_coach_organization() AND status='active');
$$;
CREATE OR REPLACE FUNCTION can_manage_coach_business(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT is_admin() AND EXISTS(SELECT 1 FROM coach_organizations WHERE id=p_organization_id AND owner_user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION coach_ai_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM coach_memberships m JOIN coach_organizations o ON o.id=m.organization_id
  WHERE m.user_id=auth.uid() AND m.status='active' AND o.status IN ('trial','active')
 );
$$;
CREATE FUNCTION browser_business_write_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM coach_memberships m JOIN coach_organizations o ON o.id=m.organization_id
  WHERE m.user_id=auth.uid() AND (m.status='disabled' OR (m.role='coach' AND o.status='paused'))
 );
$$;
REVOKE ALL ON FUNCTION browser_business_write_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION browser_business_write_allowed() TO authenticated,service_role;
CREATE POLICY "operator: own identity" ON platform_operators FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "organization: own business" ON coach_organizations FOR SELECT TO authenticated USING(id=current_coach_organization());
CREATE POLICY "membership: own or business coach" ON coach_memberships FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR can_coach_member(user_id));

CREATE OR REPLACE FUNCTION can_manage_coaching_program(p_program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT is_admin() AND EXISTS(SELECT 1 FROM programs p WHERE p.id=p_program_id
  AND p.organization_id=current_coach_organization()
  AND (p.client_id IS NULL OR can_coach_member(p.client_id)));
$$;
CREATE OR REPLACE FUNCTION can_read_coaching_program(p_program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM programs p WHERE p.id=p_program_id AND (
  (p.client_id IS NULL AND p.created_by IS NULL AND p.organization_id IS NULL)
  OR can_manage_coaching_program(p.id)
  OR p.client_id=auth.uid()
  OR EXISTS(SELECT 1 FROM user_program_assignments a WHERE a.program_id=p.id AND a.user_id=auth.uid())
 ));
$$;
CREATE OR REPLACE FUNCTION can_read_coaching_exercise(p_exercise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM exercises e WHERE e.id=p_exercise_id AND (
  (e.coaching_client_id IS NULL AND ((e.created_by IS NULL AND e.is_public AND e.organization_id IS NULL) OR e.created_by=auth.uid()
    OR (e.is_public AND e.organization_id=current_coach_organization())))
  OR (e.coaching_client_id IS NOT NULL AND (e.coaching_client_id=auth.uid() OR can_coach_member(e.coaching_client_id)))
 ));
$$;
CREATE OR REPLACE FUNCTION can_override_coaching_prescription(p_session_exercise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id
  JOIN programs p ON p.id=s.program_id WHERE se.id=p_session_exercise_id
  AND p.approved_snapshot IS NULL AND can_read_coaching_program(p.id));
$$;

-- Replace, rather than add permissive policies: an old global-admin policy
-- would otherwise OR with tenant policies and silently bypass isolation.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('profiles','exercises','programs','program_blocks','program_sessions','session_exercises',
 'user_program_assignments','user_exercise_overrides','workout_logs','workout_log_exercises','workout_log_sets',
 'body_metrics','personal_records','coaching_drafts','coaching_profiles','coaching_review_requests')
 LOOP EXECUTE format('DROP POLICY %I ON %I',p.policyname,p.tablename); END LOOP;
END $$;
CREATE POLICY "profiles: own or business coach read" ON profiles FOR SELECT TO authenticated USING(id=auth.uid() OR can_coach_member(id));
CREATE POLICY "profiles: own update" ON profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY "exercises: scoped read" ON exercises FOR SELECT TO authenticated USING(can_read_coaching_exercise(id));
CREATE POLICY "exercises: own create" ON exercises FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND (coaching_client_id IS NULL OR can_coach_member(coaching_client_id)) AND (NOT is_public OR is_admin()));
CREATE POLICY "exercises: own update" ON exercises FOR UPDATE TO authenticated
 USING(created_by=auth.uid()) WITH CHECK(created_by=auth.uid() AND (coaching_client_id IS NULL OR can_coach_member(coaching_client_id)) AND (NOT is_public OR is_admin()));
CREATE POLICY "exercises: own delete" ON exercises FOR DELETE TO authenticated USING(created_by=auth.uid());
CREATE POLICY "programs: scoped read" ON programs FOR SELECT TO authenticated USING(can_read_coaching_program(id));
CREATE POLICY "programs: business create" ON programs FOR INSERT TO authenticated
 WITH CHECK(is_admin() AND created_by=auth.uid() AND organization_id=current_coach_organization() AND (client_id IS NULL OR can_coach_member(client_id)));
CREATE POLICY "programs: business update" ON programs FOR UPDATE TO authenticated USING(can_manage_coaching_program(id))
 WITH CHECK(can_manage_coaching_program(id) AND organization_id=current_coach_organization() AND (client_id IS NULL OR can_coach_member(client_id)));
CREATE POLICY "programs: business delete" ON programs FOR DELETE TO authenticated USING(can_manage_coaching_program(id));
CREATE POLICY "blocks: scoped read" ON program_blocks FOR SELECT TO authenticated USING(can_read_coaching_program(program_id));
CREATE POLICY "blocks: business writes" ON program_blocks FOR ALL TO authenticated USING(can_manage_coaching_program(program_id)) WITH CHECK(can_manage_coaching_program(program_id));
CREATE POLICY "sessions: scoped read" ON program_sessions FOR SELECT TO authenticated USING(can_read_coaching_program(program_id));
CREATE POLICY "sessions: business writes" ON program_sessions FOR ALL TO authenticated USING(can_manage_coaching_program(program_id)) WITH CHECK(can_manage_coaching_program(program_id));
CREATE POLICY "prescriptions: scoped read" ON session_exercises FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM program_sessions s WHERE s.id=session_id AND can_read_coaching_program(s.program_id)));
CREATE POLICY "prescriptions: business writes" ON session_exercises FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM program_sessions s WHERE s.id=session_id AND can_manage_coaching_program(s.program_id)))
 WITH CHECK(EXISTS(SELECT 1 FROM program_sessions s WHERE s.id=session_id AND can_manage_coaching_program(s.program_id)) AND can_read_coaching_exercise(exercise_id));
CREATE POLICY "assignments: own or business read" ON user_program_assignments FOR SELECT TO authenticated USING(user_id=auth.uid() OR can_coach_member(user_id));
CREATE POLICY "assignments: business writes" ON user_program_assignments FOR ALL TO authenticated USING(can_coach_member(user_id)) WITH CHECK(can_coach_member(user_id) AND can_read_coaching_program(program_id));
CREATE POLICY "assignments: own progress" ON user_program_assignments FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "overrides: scoped writes" ON user_exercise_overrides FOR ALL TO authenticated
 USING(can_coach_member(user_id) OR (user_id=auth.uid() AND can_override_coaching_prescription(session_exercise_id)))
 WITH CHECK(can_coach_member(user_id) OR (user_id=auth.uid() AND can_override_coaching_prescription(session_exercise_id)));
CREATE POLICY "logs: own or business" ON workout_logs FOR ALL TO authenticated USING(user_id=auth.uid() OR can_coach_member(user_id)) WITH CHECK(user_id=auth.uid() OR can_coach_member(user_id));
CREATE POLICY "log exercises: owned parent" ON workout_log_exercises FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM workout_logs l WHERE l.id=workout_log_id AND (l.user_id=auth.uid() OR can_coach_member(l.user_id))))
 WITH CHECK(EXISTS(SELECT 1 FROM workout_logs l WHERE l.id=workout_log_id AND (l.user_id=auth.uid() OR can_coach_member(l.user_id))));
CREATE POLICY "log sets: owned parent" ON workout_log_sets FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM workout_log_exercises e JOIN workout_logs l ON l.id=e.workout_log_id WHERE e.id=log_exercise_id AND (l.user_id=auth.uid() OR can_coach_member(l.user_id))))
 WITH CHECK(EXISTS(SELECT 1 FROM workout_log_exercises e JOIN workout_logs l ON l.id=e.workout_log_id WHERE e.id=log_exercise_id AND (l.user_id=auth.uid() OR can_coach_member(l.user_id))));
CREATE POLICY "body metrics: own or business" ON body_metrics FOR ALL TO authenticated USING(user_id=auth.uid() OR can_coach_member(user_id)) WITH CHECK(user_id=auth.uid() OR can_coach_member(user_id));
CREATE POLICY "records: own or business" ON personal_records FOR ALL TO authenticated USING(user_id=auth.uid() OR can_coach_member(user_id)) WITH CHECK(user_id=auth.uid() OR can_coach_member(user_id));
CREATE POLICY "drafts: own author and business member" ON coaching_drafts FOR SELECT TO authenticated USING(coach_id=auth.uid() AND can_coach_member(member_id));
CREATE POLICY "context: own or business read" ON coaching_profiles FOR SELECT TO authenticated USING(member_id=auth.uid() OR can_coach_member(member_id));
CREATE POLICY "context: business writes" ON coaching_profiles FOR ALL TO authenticated USING(can_coach_member(member_id)) WITH CHECK(can_coach_member(member_id) AND updated_by=auth.uid());
CREATE POLICY "reviews: own or business read" ON coaching_review_requests FOR SELECT TO authenticated USING(member_id=auth.uid() OR can_coach_member(member_id));
CREATE POLICY "reviews: business resolve" ON coaching_review_requests FOR UPDATE TO authenticated USING(can_coach_member(member_id)) WITH CHECK(can_coach_member(member_id));

-- Restrictive write policies retain historical reads while closing direct
-- PostgREST writes by disabled members and coaches in paused businesses.
-- Active clients in a paused business may still record their assigned workouts.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','exercises','programs','program_blocks','program_sessions','session_exercises','user_program_assignments','user_exercise_overrides','workout_logs','workout_log_exercises','workout_log_sets','body_metrics','personal_records','coaching_drafts','coaching_profiles','coaching_review_requests'] LOOP
  EXECUTE format('CREATE POLICY business_active_insert ON %I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(browser_business_write_allowed())',t);
  EXECUTE format('CREATE POLICY business_active_update ON %I AS RESTRICTIVE FOR UPDATE TO authenticated USING(browser_business_write_allowed()) WITH CHECK(browser_business_write_allowed())',t);
  EXECUTE format('CREATE POLICY business_active_delete ON %I AS RESTRICTIVE FOR DELETE TO authenticated USING(browser_business_write_allowed())',t);
 END LOOP;
END $$;

-- A SECURITY DEFINER function bypasses RLS. These identity checks also run
-- during legacy RPC writes, and reject forged cross-business foreign keys.
CREATE OR REPLACE FUNCTION guard_coach_business_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb:=to_jsonb(NEW); old_data jsonb; bound_member_id uuid; bound_program_id uuid; bound_session_id uuid; exercise_id uuid; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RETURN NEW; END IF; -- trusted SQL maintenance, not browser roles
 IF NOT browser_business_write_allowed() THEN RAISE EXCEPTION 'Your coaching business write access is disabled'; END IF;
 IF TG_OP='UPDATE' THEN
  old_data:=to_jsonb(OLD);
  IF TG_TABLE_NAME='profiles' THEN
   IF NEW.id<>OLD.id OR NEW.email<>OLD.email THEN RAISE EXCEPTION 'Account identity cannot be changed here'; END IF;
   IF NEW.role IS DISTINCT FROM OLD.role AND NOT EXISTS(SELECT 1 FROM coach_memberships m
    WHERE m.user_id=NEW.id AND NEW.role=CASE WHEN m.role='coach' THEN 'admin' ELSE 'member' END
    AND (is_platform_operator() OR can_manage_coach_business(m.organization_id)))
   THEN RAISE EXCEPTION 'Account roles are managed through business membership'; END IF;
   RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['user_id','member_id','coach_id','created_by','client_id','coaching_client_id','organization_id','program_id','block_id','session_id','workout_log_id','log_exercise_id','session_exercise_id','exercise_id']) key
    WHERE old_data ? key AND row_data->key IS DISTINCT FROM old_data->key)
  THEN RAISE EXCEPTION 'Record ownership and parent identities cannot change'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('coaching_drafts','coaching_profiles','coaching_review_requests') THEN
  bound_member_id:=(row_data->>'member_id')::uuid;
  IF TG_TABLE_NAME='coaching_review_requests' AND TG_OP='INSERT' THEN
   IF bound_member_id<>actor THEN RAISE EXCEPTION 'Review member mismatch'; END IF;
  ELSIF NOT can_coach_member(bound_member_id) THEN RAISE EXCEPTION 'Client is outside your active coaching business'; END IF;
  IF TG_TABLE_NAME='coaching_drafts' AND (row_data->>'coach_id')::uuid<>actor THEN RAISE EXCEPTION 'Draft author mismatch'; END IF;
 ELSIF TG_TABLE_NAME='exercises' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM current_coach_organization() THEN RAISE EXCEPTION 'Exercise business mismatch'; END IF;
   NEW.organization_id:=current_coach_organization();
  END IF;
  IF NEW.created_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Exercise owner mismatch'; END IF;
  IF NEW.coaching_client_id IS NOT NULL AND NOT can_coach_member(NEW.coaching_client_id) THEN RAISE EXCEPTION 'Exercise client is outside your business'; END IF;
  IF NEW.is_public AND NOT is_admin() THEN RAISE EXCEPTION 'Only a coach can share exercises within their business'; END IF;
 ELSIF TG_TABLE_NAME='programs' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM current_coach_organization() THEN RAISE EXCEPTION 'Program business mismatch'; END IF;
   NEW.organization_id:=current_coach_organization();
  END IF;
  IF NOT is_admin() OR (TG_OP='INSERT' AND NEW.created_by IS DISTINCT FROM actor)
  OR NEW.organization_id IS DISTINCT FROM current_coach_organization() OR (NEW.client_id IS NOT NULL AND NOT can_coach_member(NEW.client_id))
  THEN RAISE EXCEPTION 'Program is outside your active coaching business'; END IF;
 ELSIF TG_TABLE_NAME IN ('program_blocks','program_sessions') THEN
  bound_program_id:=(row_data->>'program_id')::uuid;
  IF NOT can_manage_coaching_program(bound_program_id) THEN RAISE EXCEPTION 'Program is outside your business'; END IF;
  IF TG_TABLE_NAME='program_sessions' AND NOT EXISTS(SELECT 1 FROM program_blocks b WHERE b.id=(row_data->>'block_id')::uuid AND b.program_id=bound_program_id) THEN RAISE EXCEPTION 'Session block/program mismatch'; END IF;
 ELSIF TG_TABLE_NAME='session_exercises' THEN
  SELECT s.program_id INTO bound_program_id FROM program_sessions s WHERE s.id=NEW.session_id;
  IF NOT can_manage_coaching_program(bound_program_id) OR NOT can_read_coaching_exercise(NEW.exercise_id) THEN RAISE EXCEPTION 'Prescription parent/exercise is outside your business'; END IF;
 ELSIF TG_TABLE_NAME IN ('user_program_assignments','user_exercise_overrides','workout_logs','body_metrics','personal_records') THEN
  bound_member_id:=(row_data->>'user_id')::uuid;
  IF bound_member_id<>actor AND NOT can_coach_member(bound_member_id) THEN RAISE EXCEPTION 'Member is outside your business'; END IF;
  IF TG_TABLE_NAME='user_program_assignments' THEN
   IF TG_OP='INSERT' AND (NOT can_coach_member(bound_member_id) OR NEW.assigned_by IS DISTINCT FROM actor) THEN RAISE EXCEPTION 'Assignment author mismatch'; END IF;
   IF NOT EXISTS(SELECT 1 FROM programs p WHERE p.id=NEW.program_id AND can_read_coaching_program(p.id) AND (p.client_id IS NULL OR p.client_id=bound_member_id)) THEN RAISE EXCEPTION 'Assignment program/client mismatch'; END IF;
  ELSIF TG_TABLE_NAME='user_exercise_overrides' THEN
   SELECT s.program_id INTO bound_program_id FROM session_exercises e JOIN program_sessions s ON s.id=e.session_id WHERE e.id=NEW.session_exercise_id;
   IF NOT EXISTS(SELECT 1 FROM user_program_assignments a WHERE a.user_id=bound_member_id AND a.program_id=bound_program_id) THEN RAISE EXCEPTION 'Override is outside the assigned program'; END IF;
   IF NEW.override_exercise_id IS NOT NULL AND NOT can_read_coaching_exercise(NEW.override_exercise_id) THEN RAISE EXCEPTION 'Override exercise is outside your business'; END IF;
  ELSIF TG_TABLE_NAME='workout_logs' THEN
   IF TG_OP='UPDATE' AND NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN RAISE EXCEPTION 'Workout assignment identity cannot change'; END IF;
   IF NEW.assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_program_assignments a WHERE a.id=NEW.assignment_id AND a.user_id=bound_member_id) THEN RAISE EXCEPTION 'Workout assignment/member mismatch'; END IF;
   IF NEW.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM program_sessions s JOIN user_program_assignments a ON a.program_id=s.program_id WHERE s.id=NEW.session_id AND a.user_id=bound_member_id AND (NEW.assignment_id IS NULL OR a.id=NEW.assignment_id)) THEN RAISE EXCEPTION 'Workout session is outside the assigned program'; END IF;
  ELSIF TG_TABLE_NAME='personal_records' THEN
   IF NOT can_read_coaching_exercise(NEW.exercise_id) THEN RAISE EXCEPTION 'Record exercise is outside your business'; END IF;
   IF NEW.workout_log_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workout_logs l WHERE l.id=NEW.workout_log_id AND l.user_id=bound_member_id) THEN RAISE EXCEPTION 'Record workout/member mismatch'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='workout_log_exercises' THEN
  SELECT l.user_id,l.session_id INTO bound_member_id,bound_session_id FROM workout_logs l WHERE l.id=NEW.workout_log_id;
  IF bound_member_id IS NULL OR (bound_member_id<>actor AND NOT can_coach_member(bound_member_id)) OR NOT can_read_coaching_exercise(NEW.exercise_id) THEN RAISE EXCEPTION 'Workout exercise is outside your business'; END IF;
  IF NEW.session_exercise_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM session_exercises e WHERE e.id=NEW.session_exercise_id AND e.session_id=bound_session_id AND (
   e.exercise_id=NEW.exercise_id OR EXISTS(SELECT 1 FROM user_exercise_overrides ov WHERE ov.user_id=bound_member_id AND ov.session_exercise_id=e.id AND ov.override_exercise_id=NEW.exercise_id AND NOT ov.is_deleted)
  )) THEN RAISE EXCEPTION 'Logged prescription does not belong to this session'; END IF;
 ELSIF TG_TABLE_NAME='workout_log_sets' THEN
  SELECT l.user_id INTO bound_member_id FROM workout_log_exercises e JOIN workout_logs l ON l.id=e.workout_log_id WHERE e.id=NEW.log_exercise_id;
  IF bound_member_id IS NULL OR (bound_member_id<>actor AND NOT can_coach_member(bound_member_id)) THEN RAISE EXCEPTION 'Workout set is outside your business'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','exercises','programs','program_blocks','program_sessions','session_exercises','user_program_assignments','user_exercise_overrides','workout_logs','workout_log_exercises','workout_log_sets','body_metrics','personal_records','coaching_drafts','coaching_profiles','coaching_review_requests']
 LOOP EXECUTE format('CREATE TRIGGER business_identity BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_coach_business_identity()',t); END LOOP;
END $$;

-- Source visibility must be checked BEFORE the old assignment routine reads a
-- template under SECURITY DEFINER; write triggers alone cannot prevent copying.
ALTER FUNCTION assign_program_atomically(uuid,uuid) RENAME TO business_internal_assign_program;
REVOKE ALL ON FUNCTION business_internal_assign_program(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION assign_program_atomically(p_member_id uuid,p_program_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT can_coach_member(p_member_id) OR NOT can_read_coaching_program(p_program_id) THEN RAISE EXCEPTION 'Client or template is outside your active coaching business'; END IF;
 RETURN business_internal_assign_program(p_member_id,p_program_id);
END;
$$;
REVOKE ALL ON FUNCTION assign_program_atomically(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assign_program_atomically(uuid,uuid) TO authenticated;

-- Author-bound RPCs also check the target membership before any early return or
-- SECURITY DEFINER read. The renamed implementations are not remotely callable.
ALTER FUNCTION save_coaching_draft(uuid,text,jsonb,jsonb,uuid,integer,uuid) RENAME TO business_internal_save_draft;
ALTER FUNCTION set_coaching_generation(uuid,integer,uuid) RENAME TO business_internal_set_generation;
ALTER FUNCTION complete_coaching_generation(uuid,uuid,jsonb) RENAME TO business_internal_complete_generation;
ALTER FUNCTION approve_coaching_draft(uuid,integer) RENAME TO business_internal_approve_draft;
REVOKE ALL ON FUNCTION business_internal_save_draft(uuid,text,jsonb,jsonb,uuid,integer,uuid),business_internal_set_generation(uuid,integer,uuid),business_internal_complete_generation(uuid,uuid,jsonb),business_internal_approve_draft(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION require_coach_business_draft(p_draft_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM coaching_drafts d WHERE d.id=p_draft_id AND d.coach_id=auth.uid() AND can_coach_member(d.member_id))
 THEN RAISE EXCEPTION 'Draft is outside your active coaching business'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION require_coach_business_draft(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION save_coaching_draft(p_member_id uuid,p_brief text,p_scope jsonb,p_content jsonb DEFAULT NULL,p_draft_id uuid DEFAULT NULL,p_expected_revision integer DEFAULT NULL,p_generation_job_id uuid DEFAULT NULL)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT can_coach_member(p_member_id) THEN RAISE EXCEPTION 'Client is outside your active coaching business'; END IF;
 IF p_draft_id IS NOT NULL THEN PERFORM require_coach_business_draft(p_draft_id); END IF;
 RETURN business_internal_save_draft(p_member_id,p_brief,p_scope,p_content,p_draft_id,p_expected_revision,p_generation_job_id);
END;
$$;
CREATE FUNCTION set_coaching_generation(p_draft_id uuid,p_expected_revision integer,p_job_id uuid)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM require_coach_business_draft(p_draft_id);
 RETURN business_internal_set_generation(p_draft_id,p_expected_revision,p_job_id);
END;
$$;
CREATE FUNCTION complete_coaching_generation(p_draft_id uuid,p_job_id uuid,p_content jsonb)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM require_coach_business_draft(p_draft_id);
 RETURN business_internal_complete_generation(p_draft_id,p_job_id,p_content);
END;
$$;
CREATE FUNCTION approve_coaching_draft(p_draft_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM require_coach_business_draft(p_draft_id);
 RETURN business_internal_approve_draft(p_draft_id,p_expected_revision);
END;
$$;
REVOKE ALL ON FUNCTION save_coaching_draft(uuid,text,jsonb,jsonb,uuid,integer,uuid),set_coaching_generation(uuid,integer,uuid),complete_coaching_generation(uuid,uuid,jsonb),approve_coaching_draft(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_coaching_draft(uuid,text,jsonb,jsonb,uuid,integer,uuid),set_coaching_generation(uuid,integer,uuid),complete_coaching_generation(uuid,uuid,jsonb),approve_coaching_draft(uuid,integer) TO authenticated;

-- The identity trigger additionally enforces membership on every insert/update,
-- including private snapshot rows written by the approved assignment routines.
-- Operator RPCs are the only membership writers; neither client nor coach can
-- forge a second tenant or escalate via direct table access.
CREATE FUNCTION create_coach_business(p_name text,p_coach_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE coach_id uuid; organization_id uuid;
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the platform owner can onboard coach businesses'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_coach_email IS NULL OR length(p_coach_email)>320 THEN RAISE EXCEPTION 'Enter a business name and verified coach email'; END IF;
 SELECT p.id INTO coach_id FROM profiles p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)=lower(btrim(p_coach_email)) AND u.email_confirmed_at IS NOT NULL;
 IF coach_id IS NULL THEN RAISE EXCEPTION 'Ask this coach to sign up and verify their email first'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(coach_id::text,42));
 IF EXISTS(SELECT 1 FROM coach_memberships WHERE user_id=coach_id) THEN RAISE EXCEPTION 'This account already belongs to a coaching business'; END IF;
 INSERT INTO coach_organizations(name,owner_user_id) VALUES(btrim(p_name),coach_id) RETURNING id INTO organization_id;
 INSERT INTO coach_memberships(user_id,organization_id,role) VALUES(coach_id,organization_id,'coach');
 UPDATE profiles SET role='admin' WHERE id=coach_id;
 RETURN organization_id;
END;
$$;
CREATE FUNCTION set_coach_business_status(p_organization_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the platform owner can change business access'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('trial','active','paused') THEN RAISE EXCEPTION 'Invalid business status'; END IF;
 UPDATE coach_organizations SET status=p_status WHERE id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
END;
$$;
CREATE FUNCTION add_coach_business_client(p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE member_id uuid; business_id uuid:=current_coach_organization();
BEGIN
 IF NOT can_manage_coach_business(business_id) THEN RAISE EXCEPTION 'Only the business owner can add clients'; END IF;
 IF p_email IS NULL OR length(p_email)>320 THEN RAISE EXCEPTION 'Enter the client email'; END IF;
 SELECT p.id INTO member_id FROM profiles p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)=lower(btrim(p_email)) AND u.email_confirmed_at IS NOT NULL;
 IF member_id IS NULL THEN RAISE EXCEPTION 'Ask this client to sign up and verify their email first'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(member_id::text,42));
 IF EXISTS(SELECT 1 FROM coach_memberships WHERE user_id=member_id) THEN RAISE EXCEPTION 'This account already belongs to a coaching business'; END IF;
 INSERT INTO coach_memberships(user_id,organization_id,role) VALUES(member_id,business_id,'client');
 UPDATE profiles SET role='member' WHERE id=member_id;
 RETURN member_id;
END;
$$;
CREATE FUNCTION set_coach_member_role(p_user_id uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE business_id uuid:=current_coach_organization();
BEGIN
 IF NOT can_manage_coach_business(business_id) THEN RAISE EXCEPTION 'Only the business owner can change team roles'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('coach','client') THEN RAISE EXCEPTION 'Invalid business role'; END IF;
 IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'The business owner cannot remove their own coach role'; END IF;
 UPDATE coach_memberships SET role=p_role WHERE user_id=p_user_id AND coach_memberships.organization_id=business_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member is outside your business'; END IF;
 UPDATE profiles SET role=CASE WHEN p_role='coach' THEN 'admin' ELSE 'member' END WHERE id=p_user_id;
END;
$$;

-- Counts and business contact details only. Even the platform operator gets no
-- cross-business client profile, workout, health, brief or chat read policy.
CREATE FUNCTION get_coach_business_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the platform owner can monitor coach businesses'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(summary) ORDER BY summary.created_at DESC),'[]'::jsonb) INTO result FROM (
  SELECT o.id,o.name,o.status,o.plan,o.created_at,o.owner_user_id,p.email AS coach_email,p.full_name AS coach_name,
   (SELECT count(*) FROM coach_memberships m WHERE m.organization_id=o.id AND m.role='coach' AND m.status='active') AS coaches,
   (SELECT count(*) FROM coach_memberships m WHERE m.organization_id=o.id AND m.role='client' AND m.status='active') AS clients,
   (SELECT count(*) FROM user_program_assignments a JOIN coach_memberships m ON m.user_id=a.user_id WHERE m.organization_id=o.id AND a.is_active) AS active_programs,
   (SELECT count(*) FROM coaching_drafts d JOIN coach_memberships m ON m.user_id=d.coach_id WHERE m.organization_id=o.id AND d.created_at>=now()-interval '30 days') AS drafts_30_days,
   (SELECT count(*) FROM coach_chat_turns t JOIN coach_memberships m ON m.user_id=t.user_id WHERE m.organization_id=o.id AND t.created_at>=now()-interval '30 days') AS messages_30_days,
   (SELECT max(l.updated_at) FROM workout_logs l JOIN coach_memberships m ON m.user_id=l.user_id WHERE m.organization_id=o.id) AS last_workout_at
  FROM coach_organizations o JOIN profiles p ON p.id=o.owner_user_id
 ) summary;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION create_coach_business(text,text),set_coach_business_status(uuid,text),add_coach_business_client(text),set_coach_member_role(uuid,text),get_coach_business_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION create_coach_business(text,text),set_coach_business_status(uuid,text),add_coach_business_client(text),set_coach_member_role(uuid,text),get_coach_business_metrics() TO authenticated;
REVOKE ALL ON FUNCTION is_platform_operator(),current_coach_organization(),is_admin(),can_coach_member(uuid),can_manage_coach_business(uuid),coach_ai_access(),can_manage_coaching_program(uuid),can_read_coaching_program(uuid),can_read_coaching_exercise(uuid),can_override_coaching_prescription(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION is_platform_operator(),current_coach_organization(),is_admin(),can_coach_member(uuid),can_manage_coach_business(uuid),coach_ai_access(),can_manage_coaching_program(uuid),can_read_coaching_program(uuid),can_read_coaching_exercise(uuid),can_override_coaching_prescription(uuid) TO authenticated,service_role;

COMMIT;
