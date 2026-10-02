-- Synthetic rollback-only test. Disposable local database only, after migration 010.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000091','catalog-owner@example.invalid','{}'),
 ('00000000-0000-4000-8000-000000000092','catalog-member@example.invalid','{}'),
 ('00000000-0000-4000-8000-000000000093','catalog-other@example.invalid','{}');
UPDATE profiles SET role='admin' WHERE id='00000000-0000-4000-8000-000000000091';
CREATE TEMP TABLE catalog_fixture(private_id uuid,public_id uuid);
GRANT ALL ON catalog_fixture TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
DO $$ DECLARE own_id uuid; BEGIN
 INSERT INTO exercises(name,created_by) VALUES('Synthetic personal exercise',auth.uid()) RETURNING id INTO own_id;
 IF NOT EXISTS(SELECT 1 FROM exercises WHERE id=own_id AND NOT is_public) THEN RAISE EXCEPTION 'TEST FAILED: member default is not private'; END IF;
 INSERT INTO catalog_fixture(private_id) VALUES(own_id);
 UPDATE exercises SET name='Edited personal exercise' WHERE id=own_id;
 BEGIN
   INSERT INTO exercises(name,created_by,is_public) VALUES('Forged public exercise',auth.uid(),true);
   RAISE EXCEPTION 'TEST FAILED: member published an exercise';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO exercises(name,created_by,is_public) VALUES('Forged owner exercise','00000000-0000-4000-8000-000000000093',false);
   RAISE EXCEPTION 'TEST FAILED: member forged exercise ownership';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE exercises SET is_public=true WHERE id=own_id;
   RAISE EXCEPTION 'TEST FAILED: member published via update';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE exercises SET created_by='00000000-0000-4000-8000-000000000093' WHERE id=own_id;
   RAISE EXCEPTION 'TEST FAILED: member moved ownership';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
DO $$ DECLARE own_id uuid; BEGIN
 INSERT INTO exercises(name,created_by,is_public) VALUES('Synthetic shared catalog exercise',auth.uid(),true) RETURNING id INTO own_id;
 UPDATE catalog_fixture SET public_id=own_id;
 UPDATE exercises SET name='Updated shared catalog exercise' WHERE id=own_id;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000093',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM exercises WHERE id=(SELECT private_id FROM catalog_fixture)) THEN RAISE EXCEPTION 'TEST FAILED: other member sees private exercise'; END IF;
 IF NOT EXISTS(SELECT 1 FROM exercises WHERE id=(SELECT public_id FROM catalog_fixture)) THEN RAISE EXCEPTION 'TEST FAILED: member cannot see trusted public catalog'; END IF;
 UPDATE exercises SET name='Tampered shared catalog' WHERE id=(SELECT public_id FROM catalog_fixture);
 IF FOUND THEN RAISE EXCEPTION 'TEST FAILED: member modified shared catalog'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'private member catalog ownership and trusted publication passed' AS result;
