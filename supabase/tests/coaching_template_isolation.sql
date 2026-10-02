-- Run only after the workflow fixture in a disposable database with migration 006.
-- Synthetic fixtures; never run this test against production.
CREATE TEMP TABLE template_fixture_ids(template_id uuid,source_exercise_id uuid,published_id uuid,snapshot_exercise_id uuid);
GRANT ALL ON template_fixture_ids TO authenticated;
CREATE TEMP TABLE identity_fixture_ids(client_a_exercise_id uuid,client_b_exercise_id uuid);
GRANT ALL ON identity_fixture_ids TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$
DECLARE template_id uuid; source_exercise_id uuid; block_id uuid; session_id uuid; assignment_id uuid; published_id uuid; snapshot_exercise_id uuid; day integer;
BEGIN
 INSERT INTO exercises(name,description,muscle_groups,movement_type,equipment,is_compound,primary_lift,created_by,is_public)
 VALUES('Paused Bench Library Fixture','Original exact description',ARRAY['chest','triceps'],'push','barbell',true,'bench',auth.uid(),true)
 RETURNING id INTO source_exercise_id;
 INSERT INTO programs(title,created_by) VALUES('Reusable template fixture',auth.uid()) RETURNING id INTO template_id;
 INSERT INTO program_blocks(program_id,title,order_index) VALUES(template_id,'First block',0) RETURNING id INTO block_id;
 FOR day IN 0..1 LOOP
   INSERT INTO program_sessions(program_id,block_id,title,session_order) VALUES(template_id,block_id,'Day '||day,day) RETURNING id INTO session_id;
   INSERT INTO session_exercises(session_id,exercise_id,order_index,target_sets,target_reps,target_rpe,rest_seconds)
   VALUES(session_id,source_exercise_id,0,3,'5',8,180);
 END LOOP;
 assignment_id:=assign_program_atomically('00000000-0000-4000-8000-000000000002',template_id);
 IF NOT EXISTS(SELECT 1 FROM user_program_assignments WHERE id=assignment_id AND is_finite AND status='active') THEN RAISE EXCEPTION 'TEST FAILED: newly published template must be a finite block'; END IF;
 SELECT program_id INTO published_id FROM user_program_assignments WHERE id=assignment_id;
 SELECT se.exercise_id INTO snapshot_exercise_id FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=published_id LIMIT 1;
 IF snapshot_exercise_id=source_exercise_id THEN RAISE EXCEPTION 'TEST FAILED: snapshot shares editable library exercise'; END IF;
 IF (SELECT count(DISTINCT se.exercise_id) FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=published_id)<>1 THEN RAISE EXCEPTION 'TEST FAILED: repeated exercise identity changed across sessions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM exercises WHERE id=snapshot_exercise_id AND description='Original exact description' AND muscle_groups=ARRAY['chest','triceps'] AND movement_type='push' AND equipment='barbell' AND is_compound AND primary_lift='bench' AND NOT is_public) THEN RAISE EXCEPTION 'TEST FAILED: exact private metadata was not cloned'; END IF;
 UPDATE exercises SET name='Updated library exercise',description='Changed description' WHERE id=source_exercise_id;
 IF NOT EXISTS(SELECT 1 FROM exercises WHERE id=snapshot_exercise_id AND name='Paused Bench Library Fixture' AND description='Original exact description') THEN RAISE EXCEPTION 'TEST FAILED: library edit changed snapshot'; END IF;
 BEGIN
   UPDATE exercises SET name='Mutated snapshot' WHERE id=snapshot_exercise_id;
   RAISE EXCEPTION 'TEST FAILED: approved snapshot exercise mutable';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 UPDATE session_exercises se SET target_sets=4 WHERE se.session_id IN (SELECT ps.id FROM program_sessions ps WHERE ps.program_id=template_id);
 IF EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=published_id AND se.target_sets<>3) THEN RAISE EXCEPTION 'TEST FAILED: source dose edit changed snapshot'; END IF;
 INSERT INTO template_fixture_ids VALUES(template_id,source_exercise_id,published_id,snapshot_exercise_id);
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ DECLARE assignment_id uuid; BEGIN
 SELECT id INTO assignment_id FROM user_program_assignments WHERE program_id=(SELECT published_id FROM template_fixture_ids);
 UPDATE user_program_assignments SET current_session_index=1 WHERE id=assignment_id;
 UPDATE user_program_assignments SET current_session_index=2 WHERE id=assignment_id;
 IF NOT EXISTS(SELECT 1 FROM user_program_assignments WHERE id=assignment_id AND current_session_index=2 AND status='completed') THEN RAISE EXCEPTION 'TEST FAILED: template block did not finish'; END IF;
 BEGIN
   UPDATE user_program_assignments SET current_session_index=3 WHERE id=assignment_id;
   RAISE EXCEPTION 'TEST FAILED: template block wrapped past its final day';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$
DECLARE content jsonb; scope jsonb; draft coaching_drafts; result jsonb; client_a_exercise_id uuid; client_b_exercise_id uuid;
BEGIN
 SELECT approved_snapshot INTO content FROM programs WHERE id=(SELECT program_id FROM fixture_ids);
 -- The same exact movement occurs in distinct top/backdown groups and weeks.
 content:=jsonb_set(content,'{weeks}',jsonb_build_array(content->'weeks'->0,jsonb_set(content->'weeks'->0,'{number}','6')));
 scope:='{"startWeek":5,"weekCount":2,"daysPerWeek":1}';
 draft:=save_coaching_draft('00000000-0000-4000-8000-000000000002','Stable identity across weeks and blocks',scope,content);
 result:=approve_coaching_draft(draft.id,draft.revision);
 IF (SELECT count(DISTINCT se.exercise_id) FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id JOIN exercises e ON e.id=se.exercise_id WHERE s.program_id=(result->>'programId')::uuid AND e.name='Paused Bench Press')<>1 THEN RAISE EXCEPTION 'TEST FAILED: AI repeated movement identity changed across weeks'; END IF;
 SELECT id INTO client_a_exercise_id FROM exercises WHERE name='Paused Bench Press' AND coaching_client_id='00000000-0000-4000-8000-000000000002';
 IF NOT EXISTS(SELECT 1 FROM session_exercises se JOIN program_sessions s ON s.id=se.session_id WHERE s.program_id=(SELECT program_id FROM fixture_ids) AND se.exercise_id=client_a_exercise_id) THEN RAISE EXCEPTION 'TEST FAILED: AI identity changed between approved blocks'; END IF;
 draft:=save_coaching_draft('00000000-0000-4000-8000-000000000003','Different client same exact exercise name',scope,content);
 PERFORM approve_coaching_draft(draft.id,draft.revision);
 SELECT id INTO client_b_exercise_id FROM exercises WHERE name='Paused Bench Press' AND coaching_client_id='00000000-0000-4000-8000-000000000003';
 IF client_a_exercise_id IS NULL OR client_b_exercise_id IS NULL OR client_a_exercise_id=client_b_exercise_id THEN RAISE EXCEPTION 'TEST FAILED: private identities shared between clients'; END IF;
 INSERT INTO identity_fixture_ids VALUES(client_a_exercise_id,client_b_exercise_id);
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM exercises WHERE id=(SELECT snapshot_exercise_id FROM template_fixture_ids)) THEN RAISE EXCEPTION 'TEST FAILED: other client can read private snapshot exercise'; END IF;
 IF EXISTS(SELECT 1 FROM programs WHERE id=(SELECT published_id FROM template_fixture_ids)) THEN RAISE EXCEPTION 'TEST FAILED: other client can read published template'; END IF;
 IF EXISTS(SELECT 1 FROM exercises WHERE id=(SELECT client_a_exercise_id FROM identity_fixture_ids)) THEN RAISE EXCEPTION 'TEST FAILED: another client can read AI exercise identity'; END IF;
 BEGIN
   INSERT INTO exercises(name,created_by,is_public,coaching_client_id) VALUES('Forged private identity',auth.uid(),false,'00000000-0000-4000-8000-000000000002');
   RAISE EXCEPTION 'TEST FAILED: member forged private client identity';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM coaching_snapshot_exercise(auth.uid(),'{"name":"Bypassed private helper"}');
   RAISE EXCEPTION 'TEST FAILED: member called private helper';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM exercises WHERE id=(SELECT snapshot_exercise_id FROM template_fixture_ids) AND name='Paused Bench Library Fixture') THEN RAISE EXCEPTION 'TEST FAILED: assigned client cannot read snapshot name'; END IF;
 IF EXISTS(SELECT 1 FROM exercises WHERE id=(SELECT client_b_exercise_id FROM identity_fixture_ids)) THEN RAISE EXCEPTION 'TEST FAILED: other client identity visible'; END IF;
END $$;
RESET ROLE;
SELECT 'template library editing, exact snapshot metadata, stable exercise identity, immutability and private visibility tests passed' AS result;
