-- Published templates keep their own exact exercise rows. Editing a reusable
-- library exercise must never mutate a client snapshot or be blocked by it.
BEGIN;

ALTER TABLE exercises ADD COLUMN coaching_client_id uuid REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE exercises ADD CONSTRAINT coaching_exercises_private CHECK (coaching_client_id IS NULL OR NOT is_public);
CREATE UNIQUE INDEX coaching_exercises_client_name ON exercises(coaching_client_id,name) WHERE coaching_client_id IS NOT NULL;

-- Members can create ordinary exercises, but cannot forge another client's
-- private coaching identity through the existing exercise-library API.
CREATE OR REPLACE FUNCTION guard_coaching_exercise_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.coaching_client_id IS DISTINCT FROM OLD.coaching_client_id THEN
   RAISE EXCEPTION 'A coaching exercise cannot change client identity';
 END IF;
 IF TG_OP='INSERT' AND NEW.coaching_client_id IS NOT NULL AND (auth.uid() IS NULL OR NOT is_admin()) THEN
   RAISE EXCEPTION 'Only a coach can create a client exercise identity';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guarded_coaching_exercise_identity BEFORE INSERT OR UPDATE ON exercises FOR EACH ROW EXECUTE FUNCTION guard_coaching_exercise_identity();

-- This helper is internal to the approval/assignment RPCs. Exact names keep
-- variants separate; one private identity per client preserves log comparisons
-- and PR history across weeks and later blocks. Existing metadata stays frozen.
CREATE OR REPLACE FUNCTION coaching_snapshot_exercise(p_member_id uuid,p_source jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result_id uuid; exercise_name text:=p_source->>'name';
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF exercise_name IS NULL OR length(btrim(exercise_name)) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'Invalid exercise name'; END IF;
 SELECT id INTO result_id FROM exercises WHERE coaching_client_id=p_member_id AND name=exercise_name;
 IF result_id IS NOT NULL THEN RETURN result_id; END IF;
 INSERT INTO exercises(name,description,muscle_groups,movement_type,equipment,is_compound,primary_lift,created_by,is_public,coaching_client_id)
 VALUES(exercise_name,p_source->>'description',
   ARRAY(SELECT jsonb_array_elements_text(coalesce(p_source->'muscle_groups','[]'::jsonb))),
   coalesce(p_source->>'movement_type','other'),coalesce(p_source->>'equipment','other'),
   coalesce((p_source->>'is_compound')::boolean,false),p_source->>'primary_lift',auth.uid(),false,p_member_id)
 RETURNING id INTO result_id;
 RETURN result_id;
END;
$$;
REVOKE ALL ON FUNCTION coaching_snapshot_exercise(uuid,jsonb) FROM PUBLIC,anon,authenticated;

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
       -- Exact, private client identities persist across weeks and future blocks.
       e_id:=coaching_snapshot_exercise(draft.member_id,jsonb_build_object('name',e->>'name','movement_type','other','equipment','other'));
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

CREATE OR REPLACE FUNCTION assign_program_atomically(p_member_id uuid,p_program_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 src programs; new_id uuid; b record; s record; item record;
 b_id uuid; s_id uuid; e_id uuid; a_id uuid;
 exercise_map jsonb := '{}';
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO src FROM programs WHERE id=p_program_id;
 IF NOT FOUND OR (src.client_id IS NOT NULL AND src.client_id<>p_member_id) THEN RAISE EXCEPTION 'Template not found or belongs to another client'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text,0));
 INSERT INTO programs(title,description,created_by,is_template,client_id)
 VALUES(src.title,src.description,auth.uid(),false,p_member_id) RETURNING id INTO new_id;
 FOR b IN SELECT * FROM program_blocks WHERE program_id=src.id ORDER BY order_index LOOP
   INSERT INTO program_blocks(program_id,title,description,order_index,duration_weeks)
   VALUES(new_id,b.title,b.description,b.order_index,b.duration_weeks) RETURNING id INTO b_id;
   FOR s IN SELECT * FROM program_sessions WHERE block_id=b.id ORDER BY session_order LOOP
     INSERT INTO program_sessions(program_id,block_id,title,session_order,notes)
     VALUES(new_id,b_id,s.title,s.session_order,s.notes) RETURNING id INTO s_id;
     FOR item IN SELECT * FROM session_exercises WHERE session_id=s.id ORDER BY order_index LOOP
       e_id := (exercise_map->>item.exercise_id::text)::uuid;
       IF e_id IS NULL THEN
         SELECT coaching_snapshot_exercise(p_member_id,to_jsonb(e)) INTO e_id FROM exercises e WHERE id=item.exercise_id;
         IF e_id IS NULL THEN RAISE EXCEPTION 'Template exercise is missing'; END IF;
         exercise_map := exercise_map || jsonb_build_object(item.exercise_id::text,e_id);
       END IF;
       INSERT INTO session_exercises(session_id,exercise_id,order_index,target_sets,target_reps,target_rpe,target_weight_kg,percent_1rm,rest_seconds,notes,is_warmup,prescription)
       VALUES(s_id,e_id,item.order_index,item.target_sets,item.target_reps,item.target_rpe,item.target_weight_kg,item.percent_1rm,item.rest_seconds,item.notes,item.is_warmup,item.prescription);
     END LOOP;
   END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM program_sessions WHERE program_id=new_id) THEN RAISE EXCEPTION 'Program has no sessions'; END IF;
 UPDATE programs SET approved_snapshot=coalesce(src.approved_snapshot,jsonb_build_object('sourceTemplate',src.id,'approvedBy',auth.uid())) WHERE id=new_id;
 UPDATE user_program_assignments SET is_active=false,status='replaced' WHERE user_id=p_member_id AND is_active;
 INSERT INTO user_program_assignments(user_id,program_id,assigned_by,is_active,is_finite,status)
 VALUES(p_member_id,new_id,auth.uid(),true,true,'active') RETURNING id INTO a_id;
 RETURN a_id;
END;
$$;

REVOKE ALL ON FUNCTION assign_program_atomically(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assign_program_atomically(uuid,uuid) TO authenticated;

COMMIT;
