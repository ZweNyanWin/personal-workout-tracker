-- Reviewed drafts, immutable client programs, private context and chat history.
BEGIN;

ALTER TABLE programs ADD COLUMN client_id uuid REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE programs ADD COLUMN approved_snapshot jsonb;
ALTER TABLE session_exercises ADD COLUMN prescription jsonb;
ALTER TABLE workout_log_sets ADD COLUMN hold_seconds numeric(6,2) CHECK (hold_seconds BETWEEN 0 AND 3600);
ALTER TABLE workout_log_sets ADD CONSTRAINT workout_log_sets_one_dose CHECK (hold_seconds IS NULL OR reps IS NULL);
CREATE INDEX session_exercises_exercise_id ON session_exercises(exercise_id);
ALTER TABLE user_program_assignments ADD COLUMN is_finite boolean NOT NULL DEFAULT false;
ALTER TABLE user_program_assignments ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','replaced'));
ALTER TABLE user_program_assignments ADD COLUMN completed_at timestamptz;

CREATE TABLE coaching_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  brief text NOT NULL CHECK (length(brief) BETWEEN 1 AND 16000),
  scope jsonb NOT NULL,
  content jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  generation_job_id uuid,
  generation_revision integer,
  assignment_id uuid REFERENCES user_program_assignments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coaching_drafts_member ON coaching_drafts(member_id,updated_at DESC);
CREATE TABLE coaching_profiles (
  member_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  training_context text NOT NULL DEFAULT '' CHECK (length(training_context) <= 8000),
  coach_rules text NOT NULL DEFAULT '' CHECK (length(coach_rules) <= 8000),
  nutrition_targets text NOT NULL DEFAULT '' CHECK (length(nutrition_targets) <= 8000),
  updated_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coach_chat_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 2000),
  answer text CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 24000),
  assignment_id uuid REFERENCES user_program_assignments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,job_id)
);
CREATE INDEX coach_chat_turns_user ON coach_chat_turns(user_id,created_at DESC);
CREATE TABLE coaching_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES user_program_assignments(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX coaching_requests_member ON coaching_review_requests(member_id,status,created_at DESC);

ALTER TABLE coaching_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drafts: author reads" ON coaching_drafts FOR SELECT TO authenticated USING (is_admin() AND coach_id = auth.uid());
CREATE POLICY "coaching profiles: own or admin read" ON coaching_profiles FOR SELECT TO authenticated USING (member_id = auth.uid() OR is_admin());
CREATE POLICY "coaching profiles: admin writes" ON coaching_profiles FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin() AND updated_by = auth.uid());
CREATE POLICY "chat: own read" ON coach_chat_turns FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "chat: own insert" ON coach_chat_turns FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (assignment_id IS NULL OR EXISTS(SELECT 1 FROM user_program_assignments a WHERE a.id=assignment_id AND a.user_id=auth.uid())));
CREATE POLICY "chat: own update" ON coach_chat_turns FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id = auth.uid() AND (assignment_id IS NULL OR EXISTS(SELECT 1 FROM user_program_assignments a WHERE a.id=assignment_id AND a.user_id=auth.uid())));
CREATE POLICY "review requests: own or admin read" ON coaching_review_requests FOR SELECT TO authenticated USING (member_id = auth.uid() OR is_admin());
CREATE POLICY "review requests: admin resolves" ON coaching_review_requests FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Preserve template visibility, but isolate every client-specific published program.
CREATE OR REPLACE FUNCTION can_read_coaching_program(p_program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM programs p WHERE p.id = p_program_id
   AND (p.client_id IS NULL OR p.client_id = auth.uid() OR is_admin())
 );
$$;
DROP POLICY "programs: authenticated read" ON programs;
CREATE POLICY "programs: scoped read" ON programs FOR SELECT TO authenticated USING (can_read_coaching_program(id));
DROP POLICY "program_blocks: authenticated read" ON program_blocks;
CREATE POLICY "program_blocks: scoped read" ON program_blocks FOR SELECT TO authenticated USING (can_read_coaching_program(program_id));
DROP POLICY "program_sessions: authenticated read" ON program_sessions;
CREATE POLICY "program_sessions: scoped read" ON program_sessions FOR SELECT TO authenticated USING (can_read_coaching_program(program_id));
DROP POLICY "session_exercises: authenticated read" ON session_exercises;
CREATE POLICY "session_exercises: scoped read" ON session_exercises FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM program_sessions s WHERE s.id = session_id AND can_read_coaching_program(s.program_id)));
CREATE POLICY "exercises: client snapshot read" ON exercises FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id
 JOIN programs p ON p.id=s.program_id WHERE se.exercise_id=exercises.id AND p.client_id=auth.uid()
));
CREATE OR REPLACE FUNCTION can_override_coaching_prescription(p_session_exercise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id
   JOIN programs p ON p.id=s.program_id WHERE se.id=p_session_exercise_id AND p.approved_snapshot IS NULL
 );
$$;
DROP POLICY "overrides: users manage own" ON user_exercise_overrides;
CREATE POLICY "overrides: legacy own or admin" ON user_exercise_overrides FOR ALL TO authenticated
 USING (is_admin() OR (user_id=auth.uid() AND can_override_coaching_prescription(session_exercise_id)))
 WITH CHECK (is_admin() OR (user_id=auth.uid() AND can_override_coaching_prescription(session_exercise_id)));

CREATE OR REPLACE FUNCTION guard_approved_coaching_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p_id uuid; locked_snapshot boolean;
BEGIN
 IF TG_TABLE_NAME = 'coaching_drafts' THEN
   IF OLD.status='approved' THEN RAISE EXCEPTION 'Approved drafts cannot be edited or deleted'; END IF;
 ELSIF TG_TABLE_NAME = 'programs' THEN
   IF OLD.approved_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Approved client programs are immutable; create a new draft'; END IF;
 ELSE
   IF TG_TABLE_NAME = 'program_blocks' OR TG_TABLE_NAME = 'program_sessions' THEN
     IF TG_OP <> 'INSERT' THEN p_id:=OLD.program_id; END IF;
     IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM programs WHERE id=NEW.program_id AND approved_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Approved client programs are immutable'; END IF;
   ELSIF TG_TABLE_NAME = 'session_exercises' THEN
     IF TG_OP <> 'INSERT' THEN SELECT program_id INTO p_id FROM program_sessions WHERE id=OLD.session_id; END IF;
     IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM program_sessions s JOIN programs p ON p.id=s.program_id WHERE s.id=NEW.session_id AND p.approved_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Approved client programs are immutable'; END IF;
   ELSIF TG_TABLE_NAME = 'exercises' THEN
     SELECT EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id JOIN programs p ON p.id=s.program_id WHERE se.exercise_id=OLD.id AND p.approved_snapshot IS NOT NULL) INTO locked_snapshot;
     IF locked_snapshot THEN RAISE EXCEPTION 'Exercises in approved client programs are immutable'; END IF;
   END IF;
   IF p_id IS NOT NULL AND EXISTS(SELECT 1 FROM programs WHERE id=p_id AND approved_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Approved client programs are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_coaching_draft BEFORE UPDATE OR DELETE ON coaching_drafts FOR EACH ROW EXECUTE FUNCTION guard_approved_coaching_record();
CREATE TRIGGER immutable_coaching_program BEFORE UPDATE OR DELETE ON programs FOR EACH ROW EXECUTE FUNCTION guard_approved_coaching_record();
CREATE TRIGGER immutable_coaching_block BEFORE INSERT OR UPDATE OR DELETE ON program_blocks FOR EACH ROW EXECUTE FUNCTION guard_approved_coaching_record();
CREATE TRIGGER immutable_coaching_session BEFORE INSERT OR UPDATE OR DELETE ON program_sessions FOR EACH ROW EXECUTE FUNCTION guard_approved_coaching_record();
CREATE TRIGGER immutable_coaching_prescription BEFORE INSERT OR UPDATE OR DELETE ON session_exercises FOR EACH ROW EXECUTE FUNCTION guard_approved_coaching_record();
CREATE TRIGGER immutable_coaching_exercise BEFORE UPDATE OR DELETE ON exercises FOR EACH ROW EXECUTE FUNCTION guard_approved_coaching_record();

CREATE OR REPLACE FUNCTION validate_coaching_scope(p_scope jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF jsonb_typeof(p_scope) <> 'object' OR p_scope IS NULL
 OR NOT (p_scope ?& ARRAY['startWeek','weekCount','daysPerWeek'])
 OR (p_scope->>'startWeek') !~ '^[0-9]+$' OR (p_scope->>'weekCount') !~ '^[0-9]+$' OR (p_scope->>'daysPerWeek') !~ '^[0-9]+$'
 OR (p_scope->>'startWeek')::integer NOT BETWEEN 1 AND 52
 OR (p_scope->>'weekCount')::integer NOT BETWEEN 1 AND 16
 OR (p_scope->>'daysPerWeek')::integer NOT BETWEEN 1 AND 7
 OR (p_scope->>'startWeek')::integer+(p_scope->>'weekCount')::integer-1 > 52 THEN RAISE EXCEPTION 'Invalid requested week/day scope'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_coaching_content(p_content jsonb,p_scope jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE w jsonb; d jsonb; e jsonb; lo integer; hi integer; n integer; wn integer; dn integer; seen_weeks integer[]:='{}'; seen_days integer[]; field text;
BEGIN
 PERFORM validate_coaching_scope(p_scope);
 IF p_content IS NULL OR jsonb_typeof(p_content)<>'object' OR p_content->>'status' IS DISTINCT FROM 'proposed' THEN RAISE EXCEPTION 'A complete proposed draft is required'; END IF;
 FOREACH field IN ARRAY ARRAY['title','progression','regression'] LOOP
   IF jsonb_typeof(p_content->field) IS DISTINCT FROM 'string' OR length(btrim(p_content->>field)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'Missing or invalid %',field; END IF;
 END LOOP;
 IF jsonb_typeof(p_content->'assumptions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Assumptions are required'; END IF;
 IF jsonb_array_length(p_content->'assumptions') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid assumptions'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_content->'assumptions') LOOP
   IF jsonb_typeof(e) IS DISTINCT FROM 'string' OR length(btrim(e#>>'{}')) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'Invalid assumption'; END IF;
 END LOOP;
 IF jsonb_typeof(p_content->'weeks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Weeks are required'; END IF;
 IF jsonb_array_length(p_content->'weeks') <> (p_scope->>'weekCount')::integer THEN RAISE EXCEPTION 'Every requested week must be present'; END IF;
 FOR w IN SELECT value FROM jsonb_array_elements(p_content->'weeks') LOOP
   IF (w->>'number') IS NULL OR (w->>'number') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid week number'; END IF;
   wn:=(w->>'number')::integer;
   IF wn=ANY(seen_weeks) OR wn<(p_scope->>'startWeek')::integer OR wn>=(p_scope->>'startWeek')::integer+(p_scope->>'weekCount')::integer THEN RAISE EXCEPTION 'Missing, duplicate or extra week'; END IF;
   seen_weeks:=array_append(seen_weeks,wn);
   IF jsonb_typeof(w->'focus') IS DISTINCT FROM 'string' OR length(btrim(w->>'focus')) NOT BETWEEN 1 AND 1200 OR jsonb_typeof(w->'days') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Week focus and days are required'; END IF;
   IF jsonb_array_length(w->'days')<>(p_scope->>'daysPerWeek')::integer THEN RAISE EXCEPTION 'Every requested training day must be present'; END IF;
   seen_days:='{}';
   FOR d IN SELECT value FROM jsonb_array_elements(w->'days') LOOP
     IF (d->>'number') IS NULL OR (d->>'number') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid day number'; END IF;
     dn:=(d->>'number')::integer;
     IF dn=ANY(seen_days) OR dn NOT BETWEEN 1 AND (p_scope->>'daysPerWeek')::integer THEN RAISE EXCEPTION 'Duplicate or extra training day'; END IF;
     seen_days:=array_append(seen_days,dn);
     FOREACH field IN ARRAY ARRAY['title','warmup'] LOOP
       IF jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR length(btrim(d->>field)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'Missing day %',field; END IF;
     END LOOP;
     IF jsonb_typeof(d->'exercises') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exercises are required'; END IF;
     IF jsonb_array_length(d->'exercises') NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid exercise count'; END IF;
     FOR e IN SELECT value FROM jsonb_array_elements(d->'exercises') LOOP
       FOREACH field IN ARRAY ARRAY['name','loadOrAssistance','effort'] LOOP
         IF jsonb_typeof(e->field) IS DISTINCT FROM 'string' OR length(btrim(e->>field)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'Missing exercise %',field; END IF;
       END LOOP;
       IF (e->>'sets') IS NULL OR (e->>'sets') !~ '^[0-9]+$' OR (e->>'sets')::integer NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid sets'; END IF;
       IF (e->>'restSeconds') IS NULL OR (e->>'restSeconds') !~ '^[0-9]+$' OR (e->>'restSeconds')::integer NOT BETWEEN 15 AND 600 THEN RAISE EXCEPTION 'Invalid rest seconds'; END IF;
       IF e->'dose'->>'kind'='reps' THEN
         IF jsonb_typeof(e->'dose'->'perSide') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Repetitions require perSide'; END IF;
         lo:=(e->'dose'->'range'->>'min')::integer; hi:=(e->'dose'->'range'->>'max')::integer; n:=100;
       ELSIF e->'dose'->>'kind'='hold' THEN
         lo:=(e->'dose'->'seconds'->>'min')::integer; hi:=(e->'dose'->'seconds'->>'max')::integer; n:=120;
       ELSE RAISE EXCEPTION 'Explicit repetitions or hold seconds are required'; END IF;
       IF lo IS NULL OR hi IS NULL OR lo<1 OR hi<lo OR hi>n THEN RAISE EXCEPTION 'Invalid dose range'; END IF;
       IF e ? 'notes' AND (jsonb_typeof(e->'notes') IS DISTINCT FROM 'string' OR length(e->>'notes')>1200) THEN RAISE EXCEPTION 'Invalid exercise notes'; END IF;
     END LOOP;
   END LOOP;
 END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION save_coaching_draft(p_member_id uuid,p_brief text,p_scope jsonb,p_content jsonb DEFAULT NULL,p_draft_id uuid DEFAULT NULL,p_expected_revision integer DEFAULT NULL,p_generation_job_id uuid DEFAULT NULL)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_draft coaching_drafts;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM validate_coaching_scope(p_scope);
 IF p_content IS NOT NULL AND (jsonb_typeof(p_content)<>'object' OR octet_length(p_content::text)>1000000) THEN RAISE EXCEPTION 'Invalid draft content'; END IF;
 IF p_draft_id IS NULL THEN
   INSERT INTO coaching_drafts(member_id,coach_id,brief,scope,content,generation_job_id) VALUES(p_member_id,auth.uid(),btrim(p_brief),p_scope,p_content,NULL) RETURNING * INTO v_draft;
 ELSE
   SELECT * INTO v_draft FROM coaching_drafts WHERE id=p_draft_id AND coach_id=auth.uid() FOR UPDATE;
   IF NOT FOUND OR v_draft.member_id<>p_member_id THEN RAISE EXCEPTION 'Draft not found'; END IF;
   IF v_draft.status<>'draft' THEN RAISE EXCEPTION 'Approved drafts cannot be edited'; END IF;
   IF p_expected_revision IS NULL OR v_draft.revision<>p_expected_revision THEN RAISE EXCEPTION 'Draft changed; reload before saving'; END IF;
   UPDATE coaching_drafts SET brief=btrim(p_brief),scope=p_scope,content=p_content,generation_job_id=NULL,generation_revision=NULL,revision=revision+1,updated_at=now() WHERE id=p_draft_id RETURNING * INTO v_draft;
 END IF;
 RETURN v_draft;
END;
$$;

CREATE OR REPLACE FUNCTION set_coaching_generation(p_draft_id uuid,p_expected_revision integer,p_job_id uuid)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE draft coaching_drafts;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO draft FROM coaching_drafts WHERE id=p_draft_id AND coach_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR draft.status<>'draft' THEN RAISE EXCEPTION 'Editable draft not found'; END IF;
 IF p_expected_revision IS NULL OR draft.revision<>p_expected_revision THEN RAISE EXCEPTION 'Draft changed; reload before generating'; END IF;
 IF p_job_id IS NOT NULL AND draft.generation_job_id IS NOT NULL THEN RAISE EXCEPTION 'Generation already started'; END IF;
 UPDATE coaching_drafts SET generation_job_id=p_job_id,generation_revision=CASE WHEN p_job_id IS NULL THEN NULL ELSE revision END,updated_at=now() WHERE id=draft.id RETURNING * INTO draft;
 RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION complete_coaching_generation(p_draft_id uuid,p_job_id uuid,p_content jsonb)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE draft coaching_drafts;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO draft FROM coaching_drafts WHERE id=p_draft_id AND coach_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR draft.generation_job_id IS DISTINCT FROM p_job_id THEN RAISE EXCEPTION 'Generation is no longer current'; END IF;
 IF draft.generation_revision IS NOT NULL AND draft.revision>draft.generation_revision AND draft.content IS NOT NULL THEN RETURN draft; END IF;
 IF draft.status<>'draft' OR draft.generation_revision IS DISTINCT FROM draft.revision THEN RAISE EXCEPTION 'Draft changed; model output was not applied'; END IF;
 PERFORM validate_coaching_content(p_content,draft.scope);
 UPDATE coaching_drafts SET content=p_content,revision=revision+1,updated_at=now() WHERE id=draft.id RETURNING * INTO draft;
 RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION approve_coaching_draft(p_draft_id uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE draft coaching_drafts; w jsonb; d jsonb; e jsonb; p_id uuid; b_id uuid; s_id uuid; e_id uuid; a_id uuid; session_idx integer:=0; exercise_idx integer; reps_text text; lo text; hi text;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO draft FROM coaching_drafts WHERE id=p_draft_id AND coach_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft not found'; END IF;
 IF p_expected_revision IS NULL OR draft.revision<>p_expected_revision THEN RAISE EXCEPTION 'Draft changed; review its latest revision'; END IF;
 IF draft.status='approved' THEN
   SELECT program_id INTO p_id FROM user_program_assignments WHERE id=draft.assignment_id;
   RETURN jsonb_build_object('assignmentId',draft.assignment_id,'programId',p_id);
 END IF;
 IF draft.generation_job_id IS NOT NULL AND draft.generation_revision=draft.revision THEN RAISE EXCEPTION 'Wait for Tommy to finish or cancel generation before approval'; END IF;
 PERFORM validate_coaching_content(draft.content,draft.scope);
 -- Serialize all assignment changes for this client. Any later failure rolls back all rows.
 PERFORM pg_advisory_xact_lock(hashtextextended(draft.member_id::text,0));
 INSERT INTO programs(title,description,created_by,is_template,client_id)
 VALUES(draft.content->>'title','Assumptions: '||(draft.content->'assumptions')::text||E'\nProgression: '||(draft.content->>'progression')||E'\nRegression: '||(draft.content->>'regression'),auth.uid(),false,draft.member_id) RETURNING id INTO p_id;
 FOR w IN SELECT value FROM jsonb_array_elements(draft.content->'weeks') ORDER BY (value->>'number')::integer LOOP
   INSERT INTO program_blocks(program_id,title,description,order_index,duration_weeks) VALUES(p_id,'Week '||(w->>'number'),w->>'focus',(w->>'number')::integer-1,1) RETURNING id INTO b_id;
   FOR d IN SELECT value FROM jsonb_array_elements(w->'days') ORDER BY (value->>'number')::integer LOOP
     INSERT INTO program_sessions(program_id,block_id,title,session_order,notes) VALUES(p_id,b_id,'W'||(w->>'number')||' · D'||(d->>'number')||' · '||(d->>'title'),session_idx,d->>'warmup') RETURNING id INTO s_id;
     session_idx:=session_idx+1; exercise_idx:=0;
     FOR e IN SELECT value FROM jsonb_array_elements(d->'exercises') LOOP
       -- Dedicated exact-name exercise rows avoid parser aliases and later template edits.
       INSERT INTO exercises(name,movement_type,equipment,created_by,is_public) VALUES(e->>'name','other','other',auth.uid(),false) RETURNING id INTO e_id;
       IF e->'dose'->>'kind'='hold' THEN
         lo:=e->'dose'->'seconds'->>'min'; hi:=e->'dose'->'seconds'->>'max'; reps_text:=lo||CASE WHEN lo<>hi THEN '–'||hi ELSE '' END||' seconds';
       ELSE
         lo:=e->'dose'->'range'->>'min'; hi:=e->'dose'->'range'->>'max'; reps_text:=lo||CASE WHEN lo<>hi THEN '–'||hi ELSE '' END||CASE WHEN (e->'dose'->>'perSide')::boolean THEN ' / side' ELSE '' END;
       END IF;
       INSERT INTO session_exercises(session_id,exercise_id,order_index,target_sets,target_reps,rest_seconds,notes,prescription)
       VALUES(s_id,e_id,exercise_idx,(e->>'sets')::integer,reps_text,(e->>'restSeconds')::integer,'Load / assistance: '||(e->>'loadOrAssistance')||E'\nEffort: '||(e->>'effort')||CASE WHEN coalesce(e->>'notes','')<>'' THEN E'\n'||(e->>'notes') ELSE '' END,e);
       exercise_idx:=exercise_idx+1;
     END LOOP;
   END LOOP;
 END LOOP;
 UPDATE programs SET approved_snapshot=draft.content WHERE id=p_id;
 UPDATE user_program_assignments SET is_active=false,status='replaced' WHERE user_id=draft.member_id AND is_active;
 INSERT INTO user_program_assignments(user_id,program_id,assigned_by,is_active,is_finite,status,current_session_index) VALUES(draft.member_id,p_id,auth.uid(),true,true,'active',0) RETURNING id INTO a_id;
 UPDATE coaching_drafts SET status='approved',assignment_id=a_id,updated_at=now() WHERE id=draft.id;
 RETURN jsonb_build_object('assignmentId',a_id,'programId',p_id);
END;
$$;

-- Existing template assignment also clones in one transaction, preserving its exact rows.
CREATE OR REPLACE FUNCTION assign_program_atomically(p_member_id uuid,p_program_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE src programs; new_id uuid; b record; s record; b_id uuid; s_id uuid; a_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO src FROM programs WHERE id=p_program_id;
 IF NOT FOUND OR (src.client_id IS NOT NULL AND src.client_id<>p_member_id) THEN RAISE EXCEPTION 'Template not found or belongs to another client'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text,0));
 INSERT INTO programs(title,description,created_by,is_template,client_id) VALUES(src.title,src.description,auth.uid(),false,p_member_id) RETURNING id INTO new_id;
 FOR b IN SELECT * FROM program_blocks WHERE program_id=src.id ORDER BY order_index LOOP
   INSERT INTO program_blocks(program_id,title,description,order_index,duration_weeks) VALUES(new_id,b.title,b.description,b.order_index,b.duration_weeks) RETURNING id INTO b_id;
   FOR s IN SELECT * FROM program_sessions WHERE block_id=b.id ORDER BY session_order LOOP
     INSERT INTO program_sessions(program_id,block_id,title,session_order,notes) VALUES(new_id,b_id,s.title,s.session_order,s.notes) RETURNING id INTO s_id;
     INSERT INTO session_exercises(session_id,exercise_id,order_index,target_sets,target_reps,target_rpe,target_weight_kg,percent_1rm,rest_seconds,notes,is_warmup,prescription)
     SELECT s_id,exercise_id,order_index,target_sets,target_reps,target_rpe,target_weight_kg,percent_1rm,rest_seconds,notes,is_warmup,prescription FROM session_exercises WHERE session_id=s.id;
   END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM program_sessions WHERE program_id=new_id) THEN RAISE EXCEPTION 'Program has no sessions'; END IF;
 UPDATE programs SET approved_snapshot=coalesce(src.approved_snapshot,jsonb_build_object('sourceTemplate',src.id,'approvedBy',auth.uid())) WHERE id=new_id;
 UPDATE user_program_assignments SET is_active=false,status='replaced' WHERE user_id=p_member_id AND is_active;
 INSERT INTO user_program_assignments(user_id,program_id,assigned_by,is_active,is_finite,status) VALUES(p_member_id,new_id,auth.uid(),true,src.approved_snapshot IS NOT NULL,'active') RETURNING id INTO a_id;
 RETURN a_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_coach_chat_turn(p_job_id uuid,p_question text,p_answer text,p_assignment_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF p_assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_program_assignments WHERE id=p_assignment_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Assignment does not belong to you'; END IF;
 INSERT INTO coach_chat_turns(user_id,job_id,question,answer,assignment_id) VALUES(auth.uid(),p_job_id,btrim(p_question),btrim(p_answer),p_assignment_id)
 ON CONFLICT(user_id,job_id) DO NOTHING RETURNING id INTO result_id;
 IF result_id IS NULL THEN SELECT id INTO result_id FROM coach_chat_turns WHERE user_id=auth.uid() AND job_id=p_job_id; END IF;
 RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_coaching_review_request(p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result_id uuid; a_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT id INTO a_id FROM user_program_assignments WHERE user_id=auth.uid() AND is_active ORDER BY created_at DESC LIMIT 1;
 INSERT INTO coaching_review_requests(member_id,assignment_id,message) VALUES(auth.uid(),a_id,btrim(p_message)) RETURNING id INTO result_id;
 RETURN result_id;
END;
$$;

-- The UI's compare-and-set index remains supported, but members cannot swap users,
-- programs or approved prescriptions by updating assignment/override rows directly.
CREATE OR REPLACE FUNCTION guard_coaching_assignment_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session_count integer;
BEGIN
 IF auth.uid()=OLD.user_id AND NOT is_admin() THEN
   IF (to_jsonb(NEW)-ARRAY['current_session_index','status','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_session_index','status','completed_at']) THEN RAISE EXCEPTION 'Only session progress can be updated'; END IF;
   IF NEW.current_session_index<0 OR abs(NEW.current_session_index-OLD.current_session_index)>1 THEN RAISE EXCEPTION 'Invalid session progress'; END IF;
   IF NOT OLD.is_active THEN RAISE EXCEPTION 'Inactive assignments cannot advance'; END IF;
 END IF;
 IF NEW.is_finite THEN
   SELECT count(*) INTO session_count FROM program_sessions WHERE program_id=NEW.program_id;
   IF NEW.current_session_index>session_count THEN RAISE EXCEPTION 'Block is already complete'; END IF;
   NEW.status:=CASE WHEN NEW.current_session_index>=session_count THEN 'completed' WHEN NEW.is_active THEN 'active' ELSE 'replaced' END;
   NEW.completed_at:=CASE WHEN NEW.status='completed' THEN coalesce(OLD.completed_at,now()) ELSE NULL END;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guarded_coaching_assignment BEFORE UPDATE ON user_program_assignments FOR EACH ROW EXECUTE FUNCTION guard_coaching_assignment_update();
CREATE OR REPLACE FUNCTION guard_coaching_override()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE se_id uuid;
BEGIN
 IF is_admin() THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN se_id:=OLD.session_exercise_id; ELSE se_id:=NEW.session_exercise_id; END IF;
 IF EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id JOIN programs p ON p.id=s.program_id WHERE se.id=se_id AND p.approved_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Request a coach review to change an approved prescription'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER guarded_coaching_override BEFORE INSERT OR UPDATE OR DELETE ON user_exercise_overrides FOR EACH ROW EXECUTE FUNCTION guard_coaching_override();

REVOKE ALL ON FUNCTION set_coaching_generation(uuid,integer,uuid),complete_coaching_generation(uuid,uuid,jsonb),save_coaching_draft(uuid,text,jsonb,jsonb,uuid,integer,uuid),approve_coaching_draft(uuid,integer),assign_program_atomically(uuid,uuid),save_coach_chat_turn(uuid,text,text,uuid),create_coaching_review_request(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION set_coaching_generation(uuid,integer,uuid),complete_coaching_generation(uuid,uuid,jsonb),save_coaching_draft(uuid,text,jsonb,jsonb,uuid,integer,uuid),approve_coaching_draft(uuid,integer),assign_program_atomically(uuid,uuid),save_coach_chat_turn(uuid,text,text,uuid),create_coaching_review_request(text) TO authenticated;
GRANT SELECT ON coaching_drafts,coaching_profiles,coach_chat_turns,coaching_review_requests TO authenticated;
GRANT INSERT,UPDATE,DELETE ON coaching_profiles TO authenticated;
GRANT INSERT,UPDATE ON coach_chat_turns TO authenticated;
GRANT UPDATE ON coaching_review_requests TO authenticated;

COMMIT;
