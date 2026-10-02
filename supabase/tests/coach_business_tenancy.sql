-- Synthetic rollback-only fixture. Run on the isolated review DB after 001–011.
BEGIN;
DO $$ BEGIN
 IF current_setting('port')::integer<>55439 OR current_database() NOT LIKE 'powerbuild_%'
 THEN RAISE EXCEPTION 'Run this synthetic test only on the disposable PowerBuild review database at port 55439'; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN RETURN; END;
 RAISE EXCEPTION 'FAIL: write unexpectedly succeeded: %',statement;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('b2000000-0000-0000-0000-000000000001','coach-a@invalid.example',now(),'{}'),
 ('b2000000-0000-0000-0000-000000000002','coach-b@invalid.example',now(),'{}'),
 ('b2000000-0000-0000-0000-000000000003','client-a@invalid.example',now(),'{}'),
 ('b2000000-0000-0000-0000-000000000004','client-b@invalid.example',now(),'{}'),
 ('b2000000-0000-0000-0000-000000000005','new-coach@invalid.example',now(),'{"role":"admin","platform_operator":true}'),
 ('b2000000-0000-0000-0000-000000000006','new-client@invalid.example',now(),'{}'),
 ('b2000000-0000-0000-0000-000000000007','unverified@invalid.example',null,'{}');
UPDATE profiles SET role='admin' WHERE id IN ('b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002');
INSERT INTO platform_operators(user_id) VALUES('b2000000-0000-0000-0000-000000000001');
INSERT INTO coach_organizations(id,name,owner_user_id) VALUES
 ('b2100000-0000-0000-0000-000000000001','Business A','b2000000-0000-0000-0000-000000000001'),
 ('b2100000-0000-0000-0000-000000000002','Business B','b2000000-0000-0000-0000-000000000002');
INSERT INTO coach_memberships(user_id,organization_id,role) VALUES
 ('b2000000-0000-0000-0000-000000000001','b2100000-0000-0000-0000-000000000001','coach'),
 ('b2000000-0000-0000-0000-000000000003','b2100000-0000-0000-0000-000000000001','client'),
 ('b2000000-0000-0000-0000-000000000002','b2100000-0000-0000-0000-000000000002','coach'),
 ('b2000000-0000-0000-0000-000000000004','b2100000-0000-0000-0000-000000000002','client');
SET LOCAL request.jwt.claim.sub='b2000000-0000-0000-0000-000000000001';
INSERT INTO exercises(id,name,created_by,is_public,coaching_client_id) VALUES
 ('b2200000-0000-0000-0000-000000000001','A client bench','b2000000-0000-0000-0000-000000000001',false,'b2000000-0000-0000-0000-000000000003');
SET LOCAL request.jwt.claim.sub='b2000000-0000-0000-0000-000000000002';
INSERT INTO exercises(id,name,created_by,is_public,coaching_client_id) VALUES
 ('b2200000-0000-0000-0000-000000000002','B client bench','b2000000-0000-0000-0000-000000000002',false,'b2000000-0000-0000-0000-000000000004'),
 ('b2200000-0000-0000-0000-000000000003','B shared custom exercise','b2000000-0000-0000-0000-000000000002',true,null);
SET LOCAL request.jwt.claim.sub='';
INSERT INTO exercises(id,name,created_by,is_public,coaching_client_id) VALUES
 ('b2200000-0000-0000-0000-000000000004','Public seed bench',null,true,null);
INSERT INTO programs(id,title,created_by,client_id,is_template,organization_id) VALUES
 ('b2300000-0000-0000-0000-000000000001','A plan','b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003',false,'b2100000-0000-0000-0000-000000000001'),
 ('b2300000-0000-0000-0000-000000000002','B plan','b2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000004',false,'b2100000-0000-0000-0000-000000000002'),
 ('b2300000-0000-0000-0000-000000000003','B private template','b2000000-0000-0000-0000-000000000002',null,true,'b2100000-0000-0000-0000-000000000002'),
 ('b2300000-0000-0000-0000-000000000004','Deleted author B private template',null,null,true,'b2100000-0000-0000-0000-000000000002');
INSERT INTO program_blocks(id,program_id,title,order_index) VALUES
 ('b2400000-0000-0000-0000-000000000001','b2300000-0000-0000-0000-000000000001','A week',0),
 ('b2400000-0000-0000-0000-000000000002','b2300000-0000-0000-0000-000000000002','B week',0);
INSERT INTO program_sessions(id,program_id,block_id,title,session_order) VALUES
 ('b2500000-0000-0000-0000-000000000001','b2300000-0000-0000-0000-000000000001','b2400000-0000-0000-0000-000000000001','A day',0),
 ('b2500000-0000-0000-0000-000000000002','b2300000-0000-0000-0000-000000000002','b2400000-0000-0000-0000-000000000002','B day',0);
INSERT INTO session_exercises(id,session_id,exercise_id,order_index,target_sets,target_reps) VALUES
 ('b2600000-0000-0000-0000-000000000001','b2500000-0000-0000-0000-000000000001','b2200000-0000-0000-0000-000000000001',0,3,'5'),
 ('b2600000-0000-0000-0000-000000000002','b2500000-0000-0000-0000-000000000002','b2200000-0000-0000-0000-000000000002',0,3,'5');
INSERT INTO user_program_assignments(id,user_id,program_id,assigned_by) VALUES
 ('b2700000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','b2300000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001'),
 ('b2700000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000004','b2300000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002');
INSERT INTO workout_logs(id,user_id,session_id,assignment_id,title) VALUES
 ('b2800000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','b2500000-0000-0000-0000-000000000001','b2700000-0000-0000-0000-000000000001','A workout'),
 ('b2800000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000004','b2500000-0000-0000-0000-000000000002','b2700000-0000-0000-0000-000000000002','B workout');
INSERT INTO workout_log_exercises(id,workout_log_id,exercise_id,session_exercise_id,order_index) VALUES
 ('b2900000-0000-0000-0000-000000000001','b2800000-0000-0000-0000-000000000001','b2200000-0000-0000-0000-000000000001','b2600000-0000-0000-0000-000000000001',0),
 ('b2900000-0000-0000-0000-000000000002','b2800000-0000-0000-0000-000000000002','b2200000-0000-0000-0000-000000000002','b2600000-0000-0000-0000-000000000002',0);
INSERT INTO workout_log_sets(log_exercise_id,set_number,reps) VALUES('b2900000-0000-0000-0000-000000000001',1,5),('b2900000-0000-0000-0000-000000000002',1,5);
INSERT INTO body_metrics(user_id,bodyweight_kg) VALUES('b2000000-0000-0000-0000-000000000003',80),('b2000000-0000-0000-0000-000000000004',90);
INSERT INTO personal_records(user_id,exercise_id,record_type,value) VALUES('b2000000-0000-0000-0000-000000000003','b2200000-0000-0000-0000-000000000001','1rm',100),('b2000000-0000-0000-0000-000000000004','b2200000-0000-0000-0000-000000000002','1rm',110);
INSERT INTO coaching_profiles(member_id,training_context,updated_by) VALUES('b2000000-0000-0000-0000-000000000003','A PRIVATE HEALTH','b2000000-0000-0000-0000-000000000001'),('b2000000-0000-0000-0000-000000000004','B PRIVATE HEALTH','b2000000-0000-0000-0000-000000000002');
INSERT INTO coaching_drafts(member_id,coach_id,brief,scope) VALUES('b2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000002','B PRIVATE BRIEF','{"startWeek":1,"weekCount":1,"daysPerWeek":1}');
INSERT INTO coaching_review_requests(member_id,message) VALUES('b2000000-0000-0000-0000-000000000004','B PRIVATE REVIEW');
INSERT INTO coach_chat_turns(user_id,job_id,question) VALUES('b2000000-0000-0000-0000-000000000004',gen_random_uuid(),'B PRIVATE CHAT');
GRANT SELECT,INSERT,UPDATE,DELETE ON profiles,exercises,programs,program_blocks,program_sessions,session_exercises,user_program_assignments,user_exercise_overrides,workout_logs,workout_log_exercises,workout_log_sets,body_metrics,personal_records TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b2000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(is_admin() AND is_platform_operator(),'owner coach access');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM profiles WHERE id='b2000000-0000-0000-0000-000000000004'),'foreign client profiles hidden even from operator');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM programs WHERE id IN ('b2300000-0000-0000-0000-000000000002','b2300000-0000-0000-0000-000000000003','b2300000-0000-0000-0000-000000000004')),'foreign templates, orphaned author templates and published programs hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM program_blocks WHERE id='b2400000-0000-0000-0000-000000000002'),'foreign blocks hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM program_sessions WHERE id='b2500000-0000-0000-0000-000000000002'),'foreign sessions hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM session_exercises WHERE id='b2600000-0000-0000-0000-000000000002'),'foreign prescriptions hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM exercises WHERE id IN ('b2200000-0000-0000-0000-000000000002','b2200000-0000-0000-0000-000000000003')),'foreign private/shared exercises hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM user_program_assignments WHERE user_id='b2000000-0000-0000-0000-000000000004'),'foreign assignments hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM workout_logs WHERE user_id='b2000000-0000-0000-0000-000000000004'),'foreign workouts hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM workout_log_exercises WHERE workout_log_id='b2800000-0000-0000-0000-000000000002'),'foreign logged exercises hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM workout_log_sets WHERE log_exercise_id='b2900000-0000-0000-0000-000000000002'),'foreign sets hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM body_metrics WHERE user_id='b2000000-0000-0000-0000-000000000004'),'foreign body metrics hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM personal_records WHERE user_id='b2000000-0000-0000-0000-000000000004'),'foreign records hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coaching_profiles WHERE member_id='b2000000-0000-0000-0000-000000000004'),'foreign private context hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coaching_drafts WHERE member_id='b2000000-0000-0000-0000-000000000004'),'foreign drafts hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coaching_review_requests WHERE member_id='b2000000-0000-0000-0000-000000000004'),'foreign reviews hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coach_chat_turns WHERE user_id='b2000000-0000-0000-0000-000000000004'),'operator cannot read foreign chats');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM coaching_profiles WHERE member_id='b2000000-0000-0000-0000-000000000003'),'own business client context still works');
SELECT pg_temp.assert_true(jsonb_array_length(get_coach_business_metrics())=2 AND get_coach_business_metrics()::text NOT LIKE '%PRIVATE%' AND get_coach_business_metrics()::text NOT LIKE '%client-b@%','operator only sees business aggregates and coach contacts');
SELECT pg_temp.expect_denied($q$SELECT assign_program_atomically('b2000000-0000-0000-0000-000000000004','b2300000-0000-0000-0000-000000000001')$q$);
SELECT pg_temp.expect_denied($q$SELECT assign_program_atomically('b2000000-0000-0000-0000-000000000003','b2300000-0000-0000-0000-000000000003')$q$);
SELECT pg_temp.expect_denied($q$SELECT business_internal_assign_program('b2000000-0000-0000-0000-000000000003','b2300000-0000-0000-0000-000000000003')$q$);
SELECT pg_temp.expect_denied($q$SELECT coaching_snapshot_exercise('b2000000-0000-0000-0000-000000000004','{"name":"Leaked"}')$q$);
SELECT pg_temp.expect_denied($q$SELECT save_coaching_draft('b2000000-0000-0000-0000-000000000004','foreign','{"startWeek":1,"weekCount":1,"daysPerWeek":1}')$q$);
SELECT pg_temp.expect_denied($q$INSERT INTO exercises(name,created_by,is_public) VALUES('forged','b2000000-0000-0000-0000-000000000002',true)$q$);
SELECT pg_temp.expect_denied($q$INSERT INTO workout_logs(user_id,session_id) VALUES('b2000000-0000-0000-0000-000000000003','b2500000-0000-0000-0000-000000000002')$q$);
SELECT pg_temp.expect_denied($q$INSERT INTO workout_log_exercises(workout_log_id,exercise_id,order_index) VALUES('b2800000-0000-0000-0000-000000000001','b2200000-0000-0000-0000-000000000002',1)$q$);
SELECT pg_temp.expect_denied($q$INSERT INTO user_exercise_overrides(user_id,session_exercise_id,target_sets) VALUES('b2000000-0000-0000-0000-000000000003','b2600000-0000-0000-0000-000000000002',3)$q$);
SELECT pg_temp.expect_denied($q$SELECT create_coach_business('Unverified','unverified@invalid.example')$q$);
SELECT create_coach_business('New coach business','new-coach@invalid.example');
SELECT add_coach_business_client('new-client@invalid.example');
DO $$ DECLARE draft coaching_drafts; job uuid:=gen_random_uuid(); result jsonb; content jsonb:='{"title":"Tenant-safe approved block","status":"proposed","assumptions":["Synthetic fixture"],"progression":"Review each week","regression":"Reduce fatigue with coach review","weeks":[{"number":1,"focus":"Strength","days":[{"number":1,"title":"Bench","warmup":"Ramp up gradually","exercises":[{"name":"Paused Bench Press","sets":3,"dose":{"kind":"reps","range":{"min":5,"max":5},"perSide":false},"loadOrAssistance":"Coach selects kg","effort":"RPE 8","restSeconds":300,"restRangeMinutes":{"min":4,"max":6}},{"name":"Tuck Front Lever","sets":3,"dose":{"kind":"hold","seconds":{"min":8,"max":12}},"loadOrAssistance":"Bodyweight","effort":"Stop before form breaks","restSeconds":120}]}]}]}'; BEGIN
 draft:=save_coaching_draft('b2000000-0000-0000-0000-000000000006','Approve exact fixture','{"startWeek":1,"weekCount":1,"daysPerWeek":1}',content);
 draft:=set_coaching_generation(draft.id,draft.revision,job);
 draft:=complete_coaching_generation(draft.id,job,content);
 result:=approve_coaching_draft(draft.id,draft.revision);
 PERFORM pg_temp.assert_true(approve_coaching_draft(draft.id,draft.revision)=result,'same-tenant approval remains idempotent');
 PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM programs p WHERE p.id=(result->>'programId')::uuid AND p.client_id='b2000000-0000-0000-0000-000000000006' AND p.approved_snapshot=content),'same-tenant immutable snapshot retained');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM session_exercises e JOIN program_sessions s ON s.id=e.session_id WHERE s.program_id=(result->>'programId')::uuid),'same-tenant exact working groups preserved');
 PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM session_exercises e JOIN program_sessions s ON s.id=e.session_id WHERE s.program_id=(result->>'programId')::uuid AND e.rest_seconds=300 AND e.prescription->'restRangeMinutes'='{"min":4,"max":6}'::jsonb),'rest suggestion range and timer survive approval');
 PERFORM pg_temp.expect_denied(format('SELECT business_internal_approve_draft(%L,2)',draft.id));
 PERFORM pg_temp.expect_denied(format('UPDATE programs SET title=''Tampered'' WHERE id=%L',result->>'programId'));
END $$;
SELECT set_coach_member_role('b2000000-0000-0000-0000-000000000006','coach');
SELECT pg_temp.assert_true((SELECT role='admin' FROM profiles WHERE id='b2000000-0000-0000-0000-000000000006'),'business owner can promote a team coach through membership RPC');
SELECT set_coach_member_role('b2000000-0000-0000-0000-000000000006','client');
SELECT pg_temp.expect_denied($q$SELECT add_coach_business_client('client-b@invalid.example')$q$);
SELECT pg_temp.expect_denied($q$SELECT set_coach_member_role('b2000000-0000-0000-0000-000000000004','coach')$q$);
SELECT pg_temp.expect_denied($q$UPDATE coach_memberships SET organization_id='b2100000-0000-0000-0000-000000000001' WHERE user_id='b2000000-0000-0000-0000-000000000004'$q$);
SELECT set_coach_business_status('b2100000-0000-0000-0000-000000000002','paused');
SET LOCAL request.jwt.claim.sub='b2000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true(NOT is_admin() AND NOT coach_ai_access(),'paused business loses coach and AI access');
SELECT pg_temp.expect_denied($q$SELECT get_coach_business_metrics()$q$);
SELECT pg_temp.expect_denied($q$SELECT save_coaching_draft('b2000000-0000-0000-0000-000000000004','paused','{"startWeek":1,"weekCount":1,"daysPerWeek":1}')$q$);
SET LOCAL request.jwt.claim.sub='b2000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_true(NOT is_admin() AND coach_ai_access(),'client AI access without coach permissions');
SELECT pg_temp.expect_denied($q$UPDATE profiles SET role='admin' WHERE id='b2000000-0000-0000-0000-000000000003'$q$);
SELECT pg_temp.expect_denied($q$SELECT create_coach_business('Forged business','unverified@invalid.example')$q$);
SELECT pg_temp.expect_denied($q$SELECT set_coach_business_status('b2100000-0000-0000-0000-000000000001','paused')$q$);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM programs WHERE id='b2300000-0000-0000-0000-000000000001'),'client retains assigned program');
UPDATE user_program_assignments SET current_session_index=1 WHERE id='b2700000-0000-0000-0000-000000000001';
RESET ROLE;
UPDATE coach_memberships SET status='disabled' WHERE user_id='b2000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b2000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(NOT is_admin() AND NOT coach_ai_access(),'disabled coach membership loses access');
SELECT pg_temp.assert_true(NOT browser_business_write_allowed(),'disabled membership blocks direct writes');
SELECT pg_temp.expect_denied($q$INSERT INTO exercises(name,created_by,is_public) VALUES('Disabled mutation','b2000000-0000-0000-0000-000000000001',false)$q$);
UPDATE profiles SET full_name='Should not save' WHERE id=auth.uid();
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND full_name='Should not save'),'disabled profile mutation prevented');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT role='admin' FROM profiles WHERE id='b2000000-0000-0000-0000-000000000005'),'verified owner onboarding updates compatible profile role');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM platform_operators WHERE user_id='b2000000-0000-0000-0000-000000000005'),'signup metadata never grants operator');
ROLLBACK;
