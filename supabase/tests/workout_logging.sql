-- Synthetic fixtures only. Run in a fresh disposable database after 001..012.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('20000000-0000-4000-8000-000000000001','coach-a@example.invalid','{}'),
 ('20000000-0000-4000-8000-000000000002','client-a@example.invalid','{}'),
 ('20000000-0000-4000-8000-000000000003','client-b@example.invalid','{}'),
 ('20000000-0000-4000-8000-000000000004','coach-b@example.invalid','{}');
UPDATE profiles SET role='admin' WHERE id IN ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004');
INSERT INTO coach_organizations(id,name,owner_user_id) VALUES
 ('20000000-0000-4000-8000-000000000101','Synthetic A','20000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000102','Synthetic B','20000000-0000-4000-8000-000000000004');
INSERT INTO coach_memberships(user_id,organization_id,role) VALUES
 ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000101','coach'),
 ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000101','client'),
 ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000102','client'),
 ('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000102','coach');
INSERT INTO exercises(id,name,is_public,equipment) VALUES('20000000-0000-4000-8000-000000000201','Bench Press',true,'barbell');
INSERT INTO programs(id,title,created_by,client_id,is_template) VALUES
 ('20000000-0000-4000-8000-000000000301','Synthetic A plan','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',false),
 ('20000000-0000-4000-8000-000000000302','Synthetic B plan','20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003',false);
INSERT INTO program_blocks(id,program_id,title,order_index) VALUES('20000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000301','Week 1',0);
INSERT INTO program_sessions(id,program_id,block_id,title,session_order) VALUES
 ('20000000-0000-4000-8000-000000000501','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000401','Upper A',0),
 ('20000000-0000-4000-8000-000000000502','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000401','Lower B',1);
INSERT INTO session_exercises(id,session_id,exercise_id,order_index,target_sets,target_reps,target_weight_kg,target_rpe) VALUES
 ('20000000-0000-4000-8000-000000000551','20000000-0000-4000-8000-000000000501','20000000-0000-4000-8000-000000000201',0,3,'5',100,8),
 ('20000000-0000-4000-8000-000000000552','20000000-0000-4000-8000-000000000502','20000000-0000-4000-8000-000000000201',0,2,'3',110,8);
INSERT INTO user_program_assignments(id,user_id,program_id,assigned_by) VALUES
 ('20000000-0000-4000-8000-000000000601','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000301','20000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000602','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000302','20000000-0000-4000-8000-000000000004');
INSERT INTO workout_logs(id,user_id,assignment_id,title) VALUES('20000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000602','Foreign workout');
INSERT INTO workout_log_exercises(id,workout_log_id,exercise_id,order_index) VALUES('20000000-0000-4000-8000-000000000702','20000000-0000-4000-8000-000000000701','20000000-0000-4000-8000-000000000201',0);
INSERT INTO workout_log_sets(id,log_exercise_id,set_number) VALUES('20000000-0000-4000-8000-000000000703','20000000-0000-4000-8000-000000000702',1);
CREATE FUNCTION synthetic_finish_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('powerbuild.test_finish_failure',true)='yes' THEN RAISE EXCEPTION 'Synthetic finish failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER synthetic_finish_failure BEFORE UPDATE ON workout_logs FOR EACH ROW EXECUTE FUNCTION synthetic_finish_failure();
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON profiles,exercises,programs,program_blocks,program_sessions,session_exercises,user_exercise_overrides TO authenticated;
GRANT UPDATE ON session_exercises TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON workout_logs,workout_log_exercises,workout_log_sets,body_metrics,user_program_assignments TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE log_id uuid; again uuid; quick uuid; s uuid; s2 uuid; result jsonb; before_count integer;
BEGIN
 log_id:=start_workout_atomically('20000000-0000-4000-8000-000000000501');
 again:=start_workout_atomically('20000000-0000-4000-8000-000000000501');
 IF again<>log_id OR (SELECT count(*) FROM workout_logs WHERE user_id=auth.uid())<>1 THEN RAISE EXCEPTION 'TEST FAILED: start is not idempotent'; END IF;
 IF (SELECT count(*) FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id WHERE e.workout_log_id=log_id)<>3 THEN RAISE EXCEPTION 'TEST FAILED: planned set rows missing'; END IF;
 IF EXISTS(SELECT 1 FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id WHERE e.workout_log_id=log_id AND (ws.weight_kg IS NOT NULL OR ws.reps IS NOT NULL OR ws.rpe IS NOT NULL OR ws.is_completed)) THEN RAISE EXCEPTION 'TEST FAILED: invented measured results'; END IF;
 IF NOT EXISTS(SELECT 1 FROM workout_log_exercises WHERE workout_log_id=log_id AND planned_snapshot->>'target_weight_kg'='100.00') THEN RAISE EXCEPTION 'TEST FAILED: started plan snapshot missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
 UPDATE session_exercises SET target_weight_kg=120,target_reps='9' WHERE id='20000000-0000-4000-8000-000000000551';
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
 IF NOT EXISTS(SELECT 1 FROM workout_log_exercises WHERE workout_log_id=log_id AND planned_snapshot->>'target_weight_kg'='100.00' AND planned_snapshot->>'target_reps'='5') THEN RAISE EXCEPTION 'TEST FAILED: later template edit changed recorded plan'; END IF;
 BEGIN
  UPDATE workout_log_exercises SET planned_snapshot='{"target_reps":"99"}' WHERE workout_log_id=log_id;
  RAISE EXCEPTION 'TEST FAILED: recorded planned prescription forged';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 SELECT ws.id INTO s FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id WHERE e.workout_log_id=log_id AND ws.set_number=1;
 SELECT ws.id INTO s2 FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id WHERE e.workout_log_id=log_id AND ws.set_number=2;
 BEGIN
  UPDATE workout_log_sets SET is_completed=true WHERE id=s;
  RAISE EXCEPTION 'TEST FAILED: completion flag without actual dose accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM complete_workout_atomically(log_id,jsonb_build_array(jsonb_build_object('id',s,'reps',5),jsonb_build_object('id',s,'reps',6)));
  RAISE EXCEPTION 'TEST FAILED: duplicate set IDs accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 result:=jsonb_build_array(jsonb_build_object('id',s,'weight_kg',50,'reps',5,'hold_seconds',NULL,'rpe',8),jsonb_build_object('id',s2,'weight_kg',55,'reps',3,'hold_seconds',NULL,'rpe',7.5));
 BEGIN
  PERFORM complete_workout_atomically(log_id,result||jsonb_build_array(jsonb_build_object('id','20000000-0000-4000-8000-000000000703','reps',5)));
  RAISE EXCEPTION 'TEST FAILED: foreign set accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM workout_log_sets WHERE id=s AND weight_kg IS NOT NULL) THEN RAISE EXCEPTION 'TEST FAILED: foreign set did not roll back earlier writes'; END IF;
 BEGIN
  PERFORM complete_workout_atomically('20000000-0000-4000-8000-000000000701','[]');
  RAISE EXCEPTION 'TEST FAILED: foreign workout accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM complete_workout_atomically(log_id,jsonb_build_array(jsonb_build_object('id',s,'is_completed',true)));
  RAISE EXCEPTION 'TEST FAILED: fake completed flag accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 PERFORM set_config('powerbuild.test_finish_failure','yes',true);
 BEGIN
  PERFORM complete_workout_atomically(log_id,result);
  RAISE EXCEPTION 'TEST FAILED: synthetic completion failure bypassed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 PERFORM set_config('powerbuild.test_finish_failure','no',true);
 IF EXISTS(SELECT 1 FROM workout_log_sets WHERE id=s AND weight_kg IS NOT NULL) OR (SELECT status FROM workout_logs WHERE id=log_id)<>'in_progress'
  OR (SELECT current_session_index FROM user_program_assignments WHERE id='20000000-0000-4000-8000-000000000601')<>0 THEN RAISE EXCEPTION 'TEST FAILED: finish failure was not atomic'; END IF;
 PERFORM complete_workout_atomically(log_id,result,'Actually measured',82.5,4);
 IF (SELECT status FROM workout_logs WHERE id=log_id)<>'completed' OR (SELECT current_session_index FROM user_program_assignments WHERE id='20000000-0000-4000-8000-000000000601')<>1 THEN RAISE EXCEPTION 'TEST FAILED: finish status/progress'; END IF;
 IF (SELECT count(*) FROM workout_log_sets WHERE id IN(s,s2) AND is_completed)<>2 OR (SELECT weight_kg FROM workout_log_sets WHERE id=s2)<>55 THEN RAISE EXCEPTION 'TEST FAILED: typed values not completed'; END IF;
 PERFORM complete_workout_atomically(log_id,jsonb_build_array(jsonb_build_object('id',s,'weight_kg',999,'reps',99)));
 IF (SELECT weight_kg FROM workout_log_sets WHERE id=s)<>50 OR (SELECT current_session_index FROM user_program_assignments WHERE id='20000000-0000-4000-8000-000000000601')<>1 THEN RAISE EXCEPTION 'TEST FAILED: repeat finish changed results/progress'; END IF;
 BEGIN
  UPDATE workout_log_sets SET weight_kg=1 WHERE id=s;
  RAISE EXCEPTION 'TEST FAILED: delayed autosave changed completed results';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
  DELETE FROM workout_log_sets WHERE id=s;
  RAISE EXCEPTION 'TEST FAILED: completed set could be deleted individually';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO workout_log_sets(log_exercise_id,set_number,reps,is_completed)
   SELECT log_exercise_id,20,99,true FROM workout_log_sets WHERE id=s;
  RAISE EXCEPTION 'TEST FAILED: a measured set was added after completion';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 quick:=start_workout_atomically('20000000-0000-4000-8000-000000000502',true);
 IF start_workout_atomically('20000000-0000-4000-8000-000000000502',true)<>quick THEN RAISE EXCEPTION 'TEST FAILED: quick completion duplicate'; END IF;
 IF (SELECT current_session_index FROM user_program_assignments WHERE id='20000000-0000-4000-8000-000000000601')<>2 THEN RAISE EXCEPTION 'TEST FAILED: quick completion advanced twice'; END IF;
 IF (SELECT count(*) FROM workout_log_exercises WHERE workout_log_id=quick)<>1 THEN RAISE EXCEPTION 'TEST FAILED: quick completion lost planned exercises'; END IF;
 IF EXISTS(SELECT 1 FROM workout_log_sets ws JOIN workout_log_exercises e ON e.id=ws.log_exercise_id WHERE e.workout_log_id=quick AND (ws.reps IS NOT NULL OR ws.weight_kg IS NOT NULL OR ws.is_completed)) THEN RAISE EXCEPTION 'TEST FAILED: quick completion invented performance'; END IF;
 PERFORM reopen_quick_workout_atomically('20000000-0000-4000-8000-000000000502');
 IF EXISTS(SELECT 1 FROM workout_logs WHERE id=quick) OR (SELECT current_session_index FROM user_program_assignments WHERE id='20000000-0000-4000-8000-000000000601')<>1 THEN RAISE EXCEPTION 'TEST FAILED: quick reopen did not delete/rewind atomically'; END IF;
 BEGIN
  PERFORM reopen_quick_workout_atomically('20000000-0000-4000-8000-000000000501');
  RAISE EXCEPTION 'TEST FAILED: quick reopen deleted detailed measured log';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 IF NOT EXISTS(SELECT 1 FROM workout_logs WHERE id=log_id) THEN RAISE EXCEPTION 'TEST FAILED: detailed history removed'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'workout atomic logging tests passed' AS result;
