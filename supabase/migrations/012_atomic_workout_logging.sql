-- Preserve planned exercise rows without inventing performed results. Save typed
-- results, completion status and assignment progress in one transaction.
BEGIN;

-- Preserve older rows for review, while new or edited completed sets must have
-- an actual dose. A completion checkmark alone is not measured performance.
ALTER TABLE workout_log_sets ADD CONSTRAINT completed_set_requires_measured_dose
 CHECK(NOT is_completed OR (reps IS NOT NULL AND reps>0) OR (hold_seconds IS NOT NULL AND hold_seconds>0)) NOT VALID;
ALTER TABLE workout_log_exercises ADD COLUMN planned_snapshot jsonb;

CREATE FUNCTION capture_workout_plan_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.planned_snapshot IS DISTINCT FROM OLD.planned_snapshot THEN RAISE EXCEPTION 'Recorded workout plan snapshots cannot be changed'; END IF;
  RETURN NEW;
 END IF;
 -- The caller cannot forge a planned dose: capture it from the verified parent
 -- session and this client's existing override, never from submitted JSON.
 NEW.planned_snapshot:=NULL;
 IF NEW.session_exercise_id IS NOT NULL THEN
  SELECT to_jsonb(se)||jsonb_build_object('exercise',to_jsonb(e),
   'target_sets',coalesce(o.target_sets,se.target_sets),
   'target_reps',coalesce(o.target_reps,se.target_reps),
   'target_rpe',coalesce(o.target_rpe,se.target_rpe),
   'target_weight_kg',coalesce(o.target_weight_kg,se.target_weight_kg),
   'rest_seconds',coalesce(o.rest_seconds,se.rest_seconds),
   'notes',coalesce(o.notes,se.notes),
   'prescription',CASE WHEN o.target_sets IS NOT NULL OR o.target_reps IS NOT NULL OR o.target_rpe IS NOT NULL
     OR o.target_weight_kg IS NOT NULL OR o.rest_seconds IS NOT NULL THEN NULL ELSE se.prescription END)
  INTO NEW.planned_snapshot
  FROM workout_logs l JOIN session_exercises se ON se.id=NEW.session_exercise_id AND se.session_id=l.session_id
  JOIN exercises e ON e.id=NEW.exercise_id
  LEFT JOIN user_exercise_overrides o ON o.user_id=l.user_id AND o.session_exercise_id=se.id
  WHERE l.id=NEW.workout_log_id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER capture_workout_plan BEFORE INSERT OR UPDATE ON workout_log_exercises FOR EACH ROW EXECUTE FUNCTION capture_workout_plan_snapshot();

CREATE FUNCTION start_workout_atomically(p_session_id uuid,p_quick_complete boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); a user_program_assignments; s program_sessions;
 sessions uuid[]; log_id uuid; row_item record; exercise_log_id uuid; i integer;
BEGIN
 IF actor IS NULL OR current_coach_organization() IS NULL THEN RAISE EXCEPTION 'An active coaching membership is required'; END IF;
 SELECT * INTO a FROM user_program_assignments WHERE user_id=actor AND is_active ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No active program'; END IF;
 SELECT array_agg(id ORDER BY session_order,id) INTO sessions FROM program_sessions WHERE program_id=a.program_id;
 IF coalesce(array_length(sessions,1),0)=0 THEN RAISE EXCEPTION 'No sessions in this program'; END IF;
 IF p_quick_complete THEN
  SELECT id INTO log_id FROM workout_logs WHERE user_id=actor AND assignment_id=a.id AND session_id=p_session_id
   AND date=CURRENT_DATE AND status='completed' AND duration_minutes=0 ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN log_id; END IF;
 END IF;
 i:=CASE WHEN a.is_finite THEN a.current_session_index ELSE a.current_session_index%array_length(sessions,1) END;
 IF sessions[i+1] IS DISTINCT FROM p_session_id THEN RAISE EXCEPTION 'Open your current session to start logging'; END IF;
 SELECT * INTO s FROM program_sessions WHERE id=p_session_id;
 SELECT id INTO log_id FROM workout_logs WHERE user_id=actor AND assignment_id=a.id AND session_id=p_session_id
  AND date=CURRENT_DATE AND status='in_progress' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF p_quick_complete THEN RAISE EXCEPTION 'This workout is already in progress. Open the session to resume it.'; END IF;
  IF EXISTS(SELECT 1 FROM workout_log_exercises WHERE workout_log_id=log_id) THEN RETURN log_id; END IF;
  -- A pre-atomic start could leave only a log marker after a failed child insert.
  -- Repair only an empty active log; no entered performance rows are replaced.
 END IF;
 IF log_id IS NULL THEN
  INSERT INTO workout_logs(user_id,session_id,assignment_id,title,date,started_at,finished_at,duration_minutes,status)
  VALUES(actor,s.id,a.id,s.title,CURRENT_DATE,now(),CASE WHEN p_quick_complete THEN now() ELSE NULL END,
   CASE WHEN p_quick_complete THEN 0 ELSE NULL END,'in_progress')
  RETURNING id INTO log_id;
 END IF;
 FOR row_item IN
  SELECT se.*,coalesce(o.override_exercise_id,se.exercise_id) AS chosen_exercise,
   coalesce(o.target_sets,se.target_sets,3) AS chosen_sets
  FROM session_exercises se LEFT JOIN user_exercise_overrides o ON o.session_exercise_id=se.id AND o.user_id=actor
  WHERE se.session_id=s.id AND NOT coalesce(o.is_deleted,false) ORDER BY se.order_index,se.id
 LOOP
  INSERT INTO workout_log_exercises(workout_log_id,exercise_id,session_exercise_id,order_index)
  VALUES(log_id,row_item.chosen_exercise,row_item.id,row_item.order_index) RETURNING id INTO exercise_log_id;
  FOR i IN 1..least(20,greatest(1,row_item.chosen_sets)) LOOP
   INSERT INTO workout_log_sets(log_exercise_id,set_number,is_warmup,is_completed)
   VALUES(exercise_log_id,i,row_item.is_warmup,false);
  END LOOP;
 END LOOP;
 IF p_quick_complete THEN
  UPDATE workout_logs SET status='completed' WHERE id=log_id;
  UPDATE user_program_assignments SET current_session_index=current_session_index+1 WHERE id=a.id;
 END IF;
 RETURN log_id;
END;
$$;

CREATE FUNCTION complete_workout_atomically(p_log_id uuid,p_sets jsonb,p_notes text DEFAULT NULL,p_bodyweight numeric DEFAULT NULL,p_energy integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); l workout_logs; a user_program_assignments; sessions uuid[];
 item jsonb; set_id uuid; seen uuid[]:='{}'; weight numeric; entered_reps integer; hold numeric; effort numeric; i integer;
BEGIN
 IF actor IS NULL OR current_coach_organization() IS NULL THEN RAISE EXCEPTION 'An active coaching membership is required'; END IF;
 IF jsonb_typeof(p_sets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sets)>500 THEN RAISE EXCEPTION 'Invalid workout set payload'; END IF;
 IF length(coalesce(p_notes,''))>1000 OR (p_bodyweight IS NOT NULL AND p_bodyweight NOT BETWEEN 30 AND 300)
  OR (p_energy IS NOT NULL AND p_energy NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Invalid workout summary'; END IF;
 SELECT * INTO l FROM workout_logs WHERE id=p_log_id AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found'; END IF;
 -- Same lock order as start/quick-complete, including repeated requests.
 SELECT * INTO a FROM user_program_assignments WHERE id=l.assignment_id AND user_id=actor FOR UPDATE;
 SELECT * INTO l FROM workout_logs WHERE id=p_log_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workout not found'; END IF;
 -- A retry must never overwrite measured results or advance the schedule twice.
 IF l.status='completed' THEN RETURN l.id; END IF;
 IF l.status<>'in_progress' THEN RAISE EXCEPTION 'Only an active workout can be completed'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_sets) LOOP
  IF jsonb_typeof(item)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) key WHERE key NOT IN ('id','weight_kg','reps','hold_seconds','rpe'))
   OR NOT item ? 'id' THEN RAISE EXCEPTION 'Invalid set result'; END IF;
  set_id:=(item->>'id')::uuid;
  IF set_id=ANY(seen) THEN RAISE EXCEPTION 'Duplicate workout set'; END IF;
  seen:=array_append(seen,set_id);
  IF NOT EXISTS(SELECT 1 FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id
   WHERE ws.id=set_id AND e.workout_log_id=l.id) THEN RAISE EXCEPTION 'Set does not belong to this workout'; END IF;
  weight:=(item->>'weight_kg')::numeric; hold:=(item->>'hold_seconds')::numeric; effort:=(item->>'rpe')::numeric;
  IF item->>'reps' IS NOT NULL AND ((item->>'reps')::numeric<>trunc((item->>'reps')::numeric)) THEN RAISE EXCEPTION 'Repetitions must be an integer'; END IF;
  entered_reps:=(item->>'reps')::integer;
  IF (weight IS NOT NULL AND (weight::text IN ('NaN','Infinity','-Infinity') OR weight NOT BETWEEN 0 AND 2000))
   OR (entered_reps IS NOT NULL AND entered_reps NOT BETWEEN 1 AND 1000)
   OR (hold IS NOT NULL AND (hold::text IN ('NaN','Infinity','-Infinity') OR hold NOT BETWEEN 0.01 AND 3600))
   OR (effort IS NOT NULL AND (effort::text IN ('NaN','Infinity','-Infinity') OR effort NOT BETWEEN 5 AND 10))
   OR (entered_reps IS NOT NULL AND hold IS NOT NULL) THEN RAISE EXCEPTION 'Invalid measured set values'; END IF;
  UPDATE workout_log_sets SET weight_kg=weight,reps=entered_reps,hold_seconds=hold,rpe=effort,
   is_completed=(entered_reps IS NOT NULL OR hold IS NOT NULL) WHERE id=set_id;
 END LOOP;
 UPDATE workout_logs SET status='completed',finished_at=now(),
  duration_minutes=greatest(0,round(extract(epoch FROM now()-coalesce(started_at,now()))/60)::integer),
  notes=nullif(btrim(coalesce(p_notes,'')),''),bodyweight_kg=p_bodyweight,energy_rating=p_energy WHERE id=l.id;
 IF p_bodyweight IS NOT NULL THEN
  INSERT INTO body_metrics(user_id,date,bodyweight_kg) VALUES(actor,l.date,p_bodyweight)
   ON CONFLICT(user_id,date) DO UPDATE SET bodyweight_kg=excluded.bodyweight_kg;
 END IF;
 IF a.id IS NOT NULL AND a.is_active AND l.session_id IS NOT NULL THEN
  SELECT array_agg(id ORDER BY session_order,id) INTO sessions FROM program_sessions WHERE program_id=a.program_id;
  IF coalesce(array_length(sessions,1),0)>0 THEN
   i:=CASE WHEN a.is_finite THEN a.current_session_index ELSE a.current_session_index%array_length(sessions,1) END;
   IF sessions[i+1]=l.session_id THEN UPDATE user_program_assignments SET current_session_index=current_session_index+1 WHERE id=a.id; END IF;
  END IF;
 END IF;
 RETURN l.id;
END;
$$;

-- A delayed autosave from an older input render cannot overwrite the atomic
-- finish payload after its transaction commits. Completed results are read-only.
CREATE FUNCTION guard_finished_workout_set()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE log_status text;
BEGIN
 -- NOWAIT avoids a set/log lock inversion with a finish transaction. A busy
 -- autosave may retry; it must never race a committed completion payload.
 SELECT l.status INTO log_status FROM workout_log_exercises e JOIN workout_logs l ON l.id=e.workout_log_id
  WHERE e.id=CASE WHEN TG_OP='INSERT' THEN NEW.log_exercise_id ELSE OLD.log_exercise_id END FOR SHARE OF l NOWAIT;
 IF log_status='completed' AND (TG_OP<>'UPDATE' OR NEW IS DISTINCT FROM OLD) THEN
  RAISE EXCEPTION 'Completed workout results are read-only';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finished_workout_set BEFORE INSERT OR UPDATE OR DELETE ON workout_log_sets FOR EACH ROW EXECUTE FUNCTION guard_finished_workout_set();

CREATE FUNCTION guard_finished_workout_exercise()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE log_status text;
BEGIN
 SELECT status INTO log_status FROM workout_logs
 WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.workout_log_id ELSE OLD.workout_log_id END FOR SHARE NOWAIT;
 IF log_status='completed' AND (TG_OP<>'UPDATE' OR NEW IS DISTINCT FROM OLD) THEN
  RAISE EXCEPTION 'Completed workout exercises are read-only';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finished_workout_exercise BEFORE INSERT OR UPDATE OR DELETE ON workout_log_exercises FOR EACH ROW EXECUTE FUNCTION guard_finished_workout_exercise();

CREATE FUNCTION reopen_quick_workout_atomically(p_session_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); a user_program_assignments; sessions uuid[]; previous_index integer; l workout_logs;
BEGIN
 IF actor IS NULL OR current_coach_organization() IS NULL THEN RAISE EXCEPTION 'An active coaching membership is required'; END IF;
 SELECT * INTO a FROM user_program_assignments WHERE user_id=actor AND is_active ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No active program'; END IF;
 SELECT array_agg(id ORDER BY session_order,id) INTO sessions FROM program_sessions WHERE program_id=a.program_id;
 IF coalesce(array_length(sessions,1),0)=0 OR a.current_session_index<1 THEN RAISE EXCEPTION 'No completed session to reopen'; END IF;
 previous_index:=a.current_session_index-1;
 IF sessions[CASE WHEN a.is_finite THEN previous_index ELSE previous_index%array_length(sessions,1) END+1] IS DISTINCT FROM p_session_id THEN
  RAISE EXCEPTION 'Only the most recent session can be reopened';
 END IF;
 SELECT * INTO l FROM workout_logs WHERE user_id=actor AND assignment_id=a.id AND session_id=p_session_id
  AND status='completed' AND duration_minutes=0 ORDER BY finished_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id
  WHERE e.workout_log_id=l.id AND (ws.is_completed OR ws.weight_kg IS NOT NULL OR ws.reps IS NOT NULL OR ws.hold_seconds IS NOT NULL OR ws.rpe IS NOT NULL)) THEN
  RAISE EXCEPTION 'Only a quick completion without measured results can be reopened. Detailed logs stay in history.';
 END IF;
 DELETE FROM workout_logs WHERE id=l.id;
 UPDATE user_program_assignments SET current_session_index=previous_index WHERE id=a.id;
 RETURN l.id;
END;
$$;

REVOKE ALL ON FUNCTION start_workout_atomically(uuid,boolean),complete_workout_atomically(uuid,jsonb,text,numeric,integer),reopen_quick_workout_atomically(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION start_workout_atomically(uuid,boolean),complete_workout_atomically(uuid,jsonb,text,numeric,integer),reopen_quick_workout_atomically(uuid) TO authenticated;
COMMIT;
