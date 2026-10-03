-- Rollback-only fixture on the isolated local PowerBuild database, after 014.
BEGIN;
DO $$ BEGIN
 IF current_setting('port') <> '55439' OR current_database() NOT LIKE 'powerbuild_%'
 THEN RAISE EXCEPTION 'Use an isolated local PowerBuild test database on port 55439'; END IF;
END $$;
-- Supabase grants browser roles table access before RLS; mirror that inside the
-- rollback-only local fixture so this tests policies rather than missing grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('e0140000-0000-4000-8000-000000000001','home-fixture@example.invalid',now(),'{}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e0140000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.exercises WHERE name IN
   ('Push-ups','Parallette Push-up','Dumbbell Goblet Squat','Dumbbell Overhead Press',
    'Resistance Band Row','Bodyweight Squat','Reverse Lunge','Dumbbell Farmer''s Carry',
    'Plank','Band-Assisted Push-up')
   AND created_by IS NULL AND coaching_client_id IS NULL AND organization_id IS NULL AND is_public) <> 10
 THEN RAISE EXCEPTION 'TEST FAILED: home defaults are not readable as canonical public exercises'; END IF;
 UPDATE public.exercises SET name='Changed default' WHERE name='Parallette Push-up' AND created_by IS NULL;
 IF FOUND THEN RAISE EXCEPTION 'TEST FAILED: member modified a public home default'; END IF;
 DELETE FROM public.exercises WHERE name='Parallette Push-up' AND created_by IS NULL;
 IF FOUND THEN RAISE EXCEPTION 'TEST FAILED: member deleted a public home default'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'home defaults visibility and write protection passed' AS result;
