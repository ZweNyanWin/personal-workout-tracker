-- Rollback-only regression for the actual authenticated INSERT ... RETURNING
-- used by exercise/program creation, plus unchanged tenant visibility and writes.
BEGIN;
DO $$ BEGIN
 IF current_setting('port')::integer<>55439 OR current_database() NOT LIKE 'powerbuild_%'
 THEN RAISE EXCEPTION 'Run this fixture only on the isolated PowerBuild database at port 55439'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
-- Mirror ordinary Supabase grants missing from the minimal isolated DB role.
GRANT SELECT,INSERT,UPDATE,DELETE ON exercises,programs,user_program_assignments TO authenticated;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('e0150000-0000-4000-8000-000000000001','row-coach-a@example.invalid','{}'),
 ('e0150000-0000-4000-8000-000000000002','row-coach-b@example.invalid','{}'),
 ('e0150000-0000-4000-8000-000000000003','row-client-a@example.invalid','{}'),
 ('e0150000-0000-4000-8000-000000000004','row-client-a-other@example.invalid','{}'),
 ('e0150000-0000-4000-8000-000000000005','row-client-b@example.invalid','{}'),
 ('e0150000-0000-4000-8000-000000000006','row-disabled-a@example.invalid','{}');
UPDATE profiles SET role='admin' WHERE id IN ('e0150000-0000-4000-8000-000000000001','e0150000-0000-4000-8000-000000000002');
INSERT INTO coach_organizations(id,name,owner_user_id) VALUES
 ('e0151000-0000-4000-8000-000000000001','Direct row business A','e0150000-0000-4000-8000-000000000001'),
 ('e0151000-0000-4000-8000-000000000002','Direct row business B','e0150000-0000-4000-8000-000000000002');
INSERT INTO coach_memberships(user_id,organization_id,role,status) VALUES
 ('e0150000-0000-4000-8000-000000000001','e0151000-0000-4000-8000-000000000001','coach','active'),
 ('e0150000-0000-4000-8000-000000000002','e0151000-0000-4000-8000-000000000002','coach','active'),
 ('e0150000-0000-4000-8000-000000000003','e0151000-0000-4000-8000-000000000001','client','active'),
 ('e0150000-0000-4000-8000-000000000004','e0151000-0000-4000-8000-000000000001','client','active'),
 ('e0150000-0000-4000-8000-000000000005','e0151000-0000-4000-8000-000000000002','client','active'),
 ('e0150000-0000-4000-8000-000000000006','e0151000-0000-4000-8000-000000000001','client','disabled');
INSERT INTO exercises(id,name,created_by,is_public,organization_id,coaching_client_id) VALUES
 ('e0152000-0000-4000-8000-000000000001','Direct row public seed',NULL,true,NULL,NULL),
 ('e0152000-0000-4000-8000-000000000002','Direct row nonpublic seed',NULL,false,NULL,NULL),
 ('e0152000-0000-4000-8000-000000000003','Direct row shared A','e0150000-0000-4000-8000-000000000001',true,'e0151000-0000-4000-8000-000000000001',NULL),
 ('e0152000-0000-4000-8000-000000000004','Direct row private coach A','e0150000-0000-4000-8000-000000000001',false,'e0151000-0000-4000-8000-000000000001',NULL),
 ('e0152000-0000-4000-8000-000000000006','Direct row shared B','e0150000-0000-4000-8000-000000000002',true,'e0151000-0000-4000-8000-000000000002',NULL),
 ('e0152000-0000-4000-8000-000000000008','Direct row client A own','e0150000-0000-4000-8000-000000000003',false,'e0151000-0000-4000-8000-000000000001',NULL),
 ('e0152000-0000-4000-8000-000000000009','Direct row former coach private',NULL,false,'e0151000-0000-4000-8000-000000000001',NULL);
SELECT set_config('request.jwt.claim.sub','e0150000-0000-4000-8000-000000000001',true);
INSERT INTO exercises(id,name,created_by,is_public,coaching_client_id)
 VALUES('e0152000-0000-4000-8000-000000000005','Direct row client A snapshot',auth.uid(),false,'e0150000-0000-4000-8000-000000000003');
SELECT set_config('request.jwt.claim.sub','e0150000-0000-4000-8000-000000000002',true);
INSERT INTO exercises(id,name,created_by,is_public,coaching_client_id)
 VALUES('e0152000-0000-4000-8000-000000000007','Direct row client B snapshot',auth.uid(),false,'e0150000-0000-4000-8000-000000000005');
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO programs(id,title,created_by,organization_id,client_id) VALUES
 ('e0153000-0000-4000-8000-000000000001','Direct row global template',NULL,NULL,NULL),
 ('e0153000-0000-4000-8000-000000000002','Direct row A template','e0150000-0000-4000-8000-000000000001','e0151000-0000-4000-8000-000000000001',NULL),
 ('e0153000-0000-4000-8000-000000000003','Direct row A client program','e0150000-0000-4000-8000-000000000001','e0151000-0000-4000-8000-000000000001','e0150000-0000-4000-8000-000000000003'),
 ('e0153000-0000-4000-8000-000000000004','Direct row B template','e0150000-0000-4000-8000-000000000002','e0151000-0000-4000-8000-000000000002',NULL),
 ('e0153000-0000-4000-8000-000000000005','Direct row B client program','e0150000-0000-4000-8000-000000000002','e0151000-0000-4000-8000-000000000002','e0150000-0000-4000-8000-000000000005');
INSERT INTO user_program_assignments(user_id,program_id,assigned_by)
 VALUES('e0150000-0000-4000-8000-000000000004','e0153000-0000-4000-8000-000000000002','e0150000-0000-4000-8000-000000000001');

-- Build the expected visibility from the unchanged ID lookup helpers with SQL
-- maintenance privileges, then compare the direct policies under actual RLS.
CREATE TEMP TABLE expected_row_visibility(actor uuid,kind text,id uuid,readable boolean);
GRANT SELECT ON expected_row_visibility TO authenticated;
DO $$ DECLARE actor uuid; BEGIN
 FOR actor IN SELECT id FROM profiles WHERE id::text LIKE 'e0150000-%' LOOP
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  INSERT INTO expected_row_visibility SELECT actor,'exercise',id,can_read_coaching_exercise(id) FROM exercises WHERE id::text LIKE 'e0152000-%';
  INSERT INTO expected_row_visibility SELECT actor,'program',id,can_read_coaching_program(id) FROM programs WHERE id::text LIKE 'e0153000-%';
 END LOOP;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE fixture_actor uuid; BEGIN
 FOR fixture_actor IN SELECT DISTINCT v.actor FROM expected_row_visibility v LOOP
  PERFORM set_config('request.jwt.claim.sub',fixture_actor::text,true);
  IF EXISTS(SELECT 1 FROM expected_row_visibility v WHERE v.actor=fixture_actor AND v.kind='exercise'
   AND v.readable IS DISTINCT FROM EXISTS(SELECT 1 FROM exercises e WHERE e.id=v.id))
  THEN RAISE EXCEPTION 'TEST FAILED: exercise visibility differs from the previous tenant rules'; END IF;
  IF EXISTS(SELECT 1 FROM expected_row_visibility v WHERE v.actor=fixture_actor AND v.kind='program'
   AND v.readable IS DISTINCT FROM EXISTS(SELECT 1 FROM programs p WHERE p.id=v.id))
  THEN RAISE EXCEPTION 'TEST FAILED: program visibility differs from the previous tenant rules'; END IF;
 END LOOP;
END $$;

SELECT set_config('request.jwt.claim.sub','e0150000-0000-4000-8000-000000000003',true);
DO $$ DECLARE row exercises; BEGIN
 INSERT INTO exercises(name,created_by) VALUES('Direct row client RETURNING',auth.uid()) RETURNING * INTO row;
 IF row.id IS NULL OR row.created_by<>auth.uid() OR row.organization_id<>'e0151000-0000-4000-8000-000000000001' OR row.is_public
 THEN RAISE EXCEPTION 'TEST FAILED: client exercise INSERT RETURNING lost its own private row'; END IF;
 BEGIN
  INSERT INTO programs(title,created_by) VALUES('Client cannot create coach program',auth.uid());
  RAISE EXCEPTION 'TEST FAILED: client created a coach program';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 WHEN raise_exception THEN IF SQLERRM<>'Program is outside your active coaching business' THEN RAISE; END IF; END;
END $$;

SELECT set_config('request.jwt.claim.sub','e0150000-0000-4000-8000-000000000001',true);
DO $$ DECLARE exercise_row exercises; program_row programs; BEGIN
 INSERT INTO exercises(name,created_by,is_public) VALUES('Direct row coach RETURNING',auth.uid(),true) RETURNING * INTO exercise_row;
 IF exercise_row.id IS NULL OR exercise_row.organization_id<>'e0151000-0000-4000-8000-000000000001'
 THEN RAISE EXCEPTION 'TEST FAILED: coach exercise INSERT RETURNING lost its row'; END IF;
 INSERT INTO exercises(name,created_by,coaching_client_id) VALUES('Direct row coach client RETURNING',auth.uid(),'e0150000-0000-4000-8000-000000000003') RETURNING * INTO exercise_row;
 IF exercise_row.id IS NULL OR exercise_row.coaching_client_id<>'e0150000-0000-4000-8000-000000000003'
 THEN RAISE EXCEPTION 'TEST FAILED: coach client exercise INSERT RETURNING lost its row'; END IF;
 INSERT INTO programs(title,created_by) VALUES('Direct row coach template RETURNING',auth.uid()) RETURNING * INTO program_row;
 IF program_row.id IS NULL OR program_row.organization_id<>'e0151000-0000-4000-8000-000000000001'
 THEN RAISE EXCEPTION 'TEST FAILED: coach template INSERT RETURNING lost its row'; END IF;
 INSERT INTO programs(title,created_by,client_id) VALUES('Direct row coach client RETURNING',auth.uid(),'e0150000-0000-4000-8000-000000000003') RETURNING * INTO program_row;
 IF program_row.id IS NULL OR program_row.client_id<>'e0150000-0000-4000-8000-000000000003'
 THEN RAISE EXCEPTION 'TEST FAILED: coach client program INSERT RETURNING lost its row'; END IF;
 BEGIN
  INSERT INTO exercises(name,created_by,organization_id) VALUES('Forged foreign organization',auth.uid(),'e0151000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'TEST FAILED: forged exercise organization accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Exercise business mismatch' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO programs(title,created_by,organization_id) VALUES('Forged foreign program',auth.uid(),'e0151000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'TEST FAILED: forged program organization accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Program business mismatch' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO exercises(name,created_by,coaching_client_id) VALUES('Forged foreign client',auth.uid(),'e0150000-0000-4000-8000-000000000005');
  RAISE EXCEPTION 'TEST FAILED: forged exercise client accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Exercise client is outside your business' THEN RAISE; END IF; END;
END $$;

SELECT set_config('request.jwt.claim.sub','e0150000-0000-4000-8000-000000000006',true);
DO $$ BEGIN
 BEGIN
  INSERT INTO exercises(name,created_by) VALUES('Disabled member cannot create',auth.uid());
  RAISE EXCEPTION 'TEST FAILED: disabled member wrote an exercise';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 WHEN raise_exception THEN IF SQLERRM<>'Your coaching business write access is disabled' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE coach_organizations SET status='paused' WHERE id='e0151000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e0150000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 BEGIN
  INSERT INTO programs(title,created_by) VALUES('Paused coach cannot create',auth.uid());
  RAISE EXCEPTION 'TEST FAILED: paused coach wrote a program';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 WHEN raise_exception THEN IF SQLERRM<>'Your coaching business write access is disabled' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'direct row visibility, authenticated INSERT RETURNING, tenant isolation and restricted writes passed' AS result;
