-- Run only against a fresh disposable database with migrations 001,002,003,005,006,007.
-- Synthetic fixtures; never run this test against production.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000001','coach@example.invalid','{}'),
 ('00000000-0000-4000-8000-000000000002','client-a@example.invalid','{}'),
 ('00000000-0000-4000-8000-000000000003','client-b@example.invalid','{}');
UPDATE profiles SET role='admin' WHERE id='00000000-0000-4000-8000-000000000001';
CREATE FUNCTION fixture_fail_assignment_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('powerbuild.test_fail_assignment',true)='yes' THEN RAISE EXCEPTION 'Synthetic failure after old assignment was deactivated'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixture_fail_assignment BEFORE INSERT ON user_program_assignments FOR EACH ROW EXECUTE FUNCTION fixture_fail_assignment_insert();
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE TEMP TABLE fixture_ids(draft_id uuid,assignment_id uuid,program_id uuid,job_id uuid);
GRANT ALL ON fixture_ids TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

DO $$
DECLARE content jsonb := '{"title":"Exact synthetic block","status":"proposed","assumptions":["Synthetic adult fixture"],"progression":"Coach reviews progression","regression":"Reduce only on coach review","weeks":[{"number":5,"focus":"Technique","days":[{"number":1,"title":"Upper","warmup":"Light ramp sets","exercises":[{"name":"Paused Bench Press","sets":1,"dose":{"kind":"reps","range":{"min":1,"max":1},"perSide":false},"loadOrAssistance":"100 lb","effort":"RPE 7","restSeconds":180,"notes":"Top single"},{"name":"Paused Bench Press","sets":3,"dose":{"kind":"reps","range":{"min":5,"max":5},"perSide":false},"loadOrAssistance":"80 lb","effort":"2 RIR","restSeconds":120,"notes":"Backdowns"},{"name":"Tuck Front Lever","sets":3,"dose":{"kind":"hold","seconds":{"min":8,"max":12}},"loadOrAssistance":"Bodyweight","effort":"Stop before position loss","restSeconds":120}]}]}]}';
 scope jsonb := '{"startWeek":5,"weekCount":1,"daysPerWeek":1}';
 draft coaching_drafts; result jsonb; repeated jsonb; failing jsonb; g uuid := gen_random_uuid(); before_count integer;
BEGIN
 content:=jsonb_set(content,'{weeks,0,days,0,exercises,0,effort}','"RPE 8"');
 content:=jsonb_set(content,'{weeks,0,days,0,exercises,0,restSeconds}','300');
 content:=jsonb_set(content,'{weeks,0,days,0,exercises,0,restRangeMinutes}','{"min":4,"max":6}');
 draft:=save_coaching_draft('00000000-0000-4000-8000-000000000002','Synthetic brief',scope,content);
 BEGIN
   PERFORM save_coaching_draft(draft.member_id,'Changed',scope,content,draft.id,99);
   RAISE EXCEPTION 'TEST FAILED: revision conflict accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 PERFORM set_coaching_generation(draft.id,draft.revision,g);
 BEGIN
   PERFORM approve_coaching_draft(draft.id,draft.revision);
   RAISE EXCEPTION 'TEST FAILED: approved pending generation';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 draft:=complete_coaching_generation(draft.id,g,content);
 IF draft.revision<>2 THEN RAISE EXCEPTION 'TEST FAILED: generation revision'; END IF;
 IF (complete_coaching_generation(draft.id,g,content)).revision<>2 THEN RAISE EXCEPTION 'TEST FAILED: repeat generation'; END IF;
 result:=approve_coaching_draft(draft.id,draft.revision);
 repeated:=approve_coaching_draft(draft.id,draft.revision);
 IF repeated<>result THEN RAISE EXCEPTION 'TEST FAILED: duplicate assignment'; END IF;
 IF (SELECT count(*) FROM user_program_assignments WHERE user_id=draft.member_id)<>1 THEN RAISE EXCEPTION 'TEST FAILED: repeated publish created history'; END IF;
 IF (SELECT count(*) FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=(result->>'programId')::uuid)<>3 THEN RAISE EXCEPTION 'TEST FAILED: top/backdown groups lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=(result->>'programId')::uuid AND target_reps='8–12 seconds' AND prescription->>'name'='Tuck Front Lever') THEN RAISE EXCEPTION 'TEST FAILED: hold seconds lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=(result->>'programId')::uuid AND prescription->>'loadOrAssistance'='100 lb') THEN RAISE EXCEPTION 'TEST FAILED: original load unit lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=(result->>'programId')::uuid AND rest_seconds=300 AND prescription->'restRangeMinutes'='{"min":4,"max":6}'::jsonb) THEN RAISE EXCEPTION 'TEST FAILED: suggested rest range or timer lost'; END IF;
 INSERT INTO fixture_ids VALUES(draft.id,(result->>'assignmentId')::uuid,(result->>'programId')::uuid,g);
 BEGIN
   UPDATE programs SET title='Changed' WHERE id=(result->>'programId')::uuid;
   RAISE EXCEPTION 'TEST FAILED: immutable program edited';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
   UPDATE session_exercises SET target_sets=9 WHERE session_id IN(SELECT id FROM program_sessions WHERE program_id=(result->>'programId')::uuid);
   RAISE EXCEPTION 'TEST FAILED: immutable dose edited';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 failing:=jsonb_set(content,'{weeks,0,days}','[]');
 draft:=save_coaching_draft('00000000-0000-4000-8000-000000000002','Incomplete draft',scope,failing);
 BEGIN
   PERFORM approve_coaching_draft(draft.id,draft.revision);
   RAISE EXCEPTION 'TEST FAILED: incomplete calendar approved';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 IF NOT EXISTS(SELECT 1 FROM user_program_assignments WHERE id=(result->>'assignmentId')::uuid AND is_active) THEN RAISE EXCEPTION 'TEST FAILED: failed approval removed active plan'; END IF;
 SELECT count(*) INTO before_count FROM programs;
 BEGIN
   PERFORM assign_program_atomically('00000000-0000-4000-8000-000000000099',(result->>'programId')::uuid);
   RAISE EXCEPTION 'TEST FAILED: invalid member assigned';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM programs)<>before_count THEN RAISE EXCEPTION 'TEST FAILED: failed publish leaked program'; END IF;
 draft:=save_coaching_draft('00000000-0000-4000-8000-000000000002','Rollback fixture',scope,content);
 SELECT count(*) INTO before_count FROM programs;
 PERFORM set_config('powerbuild.test_fail_assignment','yes',true);
 BEGIN
   PERFORM approve_coaching_draft(draft.id,draft.revision);
   RAISE EXCEPTION 'TEST FAILED: synthetic publishing failure was ignored';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 PERFORM set_config('powerbuild.test_fail_assignment','no',true);
 IF (SELECT count(*) FROM programs)<>before_count OR NOT EXISTS(SELECT 1 FROM user_program_assignments WHERE id=(result->>'assignmentId')::uuid AND is_active) THEN RAISE EXCEPTION 'TEST FAILED: atomic rollback did not restore old assignment'; END IF;
 draft:=save_coaching_draft('00000000-0000-4000-8000-000000000002','Editable',scope,content);
 PERFORM set_coaching_generation(draft.id,draft.revision,g);
 BEGIN
   PERFORM save_coaching_draft(draft.member_id,'Second tab edit while Tommy runs',scope,content,draft.id,draft.revision);
   RAISE EXCEPTION 'TEST FAILED: active generation was orphaned by another tab';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 PERFORM set_coaching_generation(draft.id,draft.revision,NULL);
 draft:=save_coaching_draft(draft.member_id,'Coach edit wins',scope,content,draft.id,draft.revision);
 BEGIN
   PERFORM complete_coaching_generation(draft.id,g,content);
   RAISE EXCEPTION 'TEST FAILED: stale model overwrote coach edit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
END;
$$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM programs WHERE client_id='00000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'TEST FAILED: another client can read program'; END IF;
 IF EXISTS(SELECT 1 FROM coaching_drafts) THEN RAISE EXCEPTION 'TEST FAILED: member can read drafts'; END IF;
 IF EXISTS(SELECT 1 FROM session_exercises) THEN RAISE EXCEPTION 'TEST FAILED: member can read other prescriptions'; END IF;
 BEGIN
   PERFORM approve_coaching_draft((SELECT draft_id FROM fixture_ids),2);
   RAISE EXCEPTION 'TEST FAILED: member can approve';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM save_coach_chat_turn(gen_random_uuid(),'Q','A',(SELECT assignment_id FROM fixture_ids));
   RAISE EXCEPTION 'TEST FAILED: another assignment added to chat';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ DECLARE a uuid; s uuid; turn uuid; log_id uuid; log_ex_id uuid; BEGIN
 SELECT assignment_id INTO a FROM fixture_ids;
 IF (SELECT count(*) FROM programs WHERE client_id=auth.uid())<>1 THEN RAISE EXCEPTION 'TEST FAILED: own program not visible'; END IF;
 IF (SELECT count(*) FROM session_exercises)<>3 THEN RAISE EXCEPTION 'TEST FAILED: own prescriptions missing'; END IF;
 IF (SELECT count(*) FROM exercises)<>2 THEN RAISE EXCEPTION 'TEST FAILED: private snapshot exercise identities unavailable'; END IF;
 SELECT id INTO s FROM session_exercises LIMIT 1;
 BEGIN
   INSERT INTO user_exercise_overrides(user_id,session_exercise_id,target_sets) VALUES(auth.uid(),s,9);
   RAISE EXCEPTION 'TEST FAILED: member edited approved prescription';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
   UPDATE user_program_assignments SET program_id=gen_random_uuid() WHERE id=a;
   RAISE EXCEPTION 'TEST FAILED: member swapped program';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 UPDATE user_program_assignments SET current_session_index=1 WHERE id=a;
 IF (SELECT status FROM user_program_assignments WHERE id=a)<>'completed' THEN RAISE EXCEPTION 'TEST FAILED: final session did not complete block'; END IF;
 BEGIN
   UPDATE user_program_assignments SET current_session_index=2 WHERE id=a;
   RAISE EXCEPTION 'TEST FAILED: completed block advanced past end';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 UPDATE user_program_assignments SET current_session_index=0 WHERE id=a;
 IF (SELECT status FROM user_program_assignments WHERE id=a)<>'active' THEN RAISE EXCEPTION 'TEST FAILED: quick completion cannot reopen'; END IF;
 turn:=save_coach_chat_turn(gen_random_uuid(),'Synthetic question','Synthetic answer',a);
 IF NOT EXISTS(SELECT 1 FROM coach_chat_turns WHERE id=turn) THEN RAISE EXCEPTION 'TEST FAILED: own chat not visible'; END IF;
 PERFORM create_coaching_review_request('Please review my next block');
 IF (SELECT count(*) FROM coaching_review_requests WHERE member_id=auth.uid())<>1 THEN RAISE EXCEPTION 'TEST FAILED: review not saved'; END IF;
 INSERT INTO workout_logs(user_id,title,status) VALUES(auth.uid(),'Synthetic timed hold','in_progress') RETURNING id INTO log_id;
 INSERT INTO workout_log_exercises(workout_log_id,exercise_id,order_index) VALUES(log_id,(SELECT id FROM exercises LIMIT 1),0) RETURNING id INTO log_ex_id;
 INSERT INTO workout_log_sets(log_exercise_id,set_number,hold_seconds,is_completed) VALUES(log_ex_id,1,12.5,true);
 IF NOT EXISTS(SELECT 1 FROM workout_log_sets WHERE log_exercise_id=log_ex_id AND hold_seconds=12.5 AND reps IS NULL) THEN RAISE EXCEPTION 'TEST FAILED: hold recorded as repetitions'; END IF;
 BEGIN
   INSERT INTO workout_log_sets(log_exercise_id,set_number,hold_seconds,reps) VALUES(log_ex_id,2,12,12);
   RAISE EXCEPTION 'TEST FAILED: ambiguous hold and repetitions accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
   INSERT INTO workout_log_sets(log_exercise_id,set_number,hold_seconds) VALUES(log_ex_id,2,3601);
   RAISE EXCEPTION 'TEST FAILED: invalid hold duration accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM coach_chat_turns) THEN RAISE EXCEPTION 'TEST FAILED: another client can read chat'; END IF;
 IF EXISTS(SELECT 1 FROM coaching_review_requests) THEN RAISE EXCEPTION 'TEST FAILED: another client can read reviews'; END IF;
END $$;
RESET ROLE;
SELECT 'coaching workflow ownership, revision, idempotence, rollback, immutability and completion tests passed' AS result;
