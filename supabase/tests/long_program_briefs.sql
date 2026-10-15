-- Rollback-only capacity check. No real draft, account or assignment changes.
BEGIN;
CREATE TEMP TABLE program_brief_capacity
  (LIKE public.coaching_drafts INCLUDING CONSTRAINTS INCLUDING DEFAULTS);
INSERT INTO program_brief_capacity(member_id, coach_id, brief, scope)
VALUES (gen_random_uuid(), gen_random_uuid(), repeat('x', 64000),
        '{"startWeek":1,"weekCount":12,"daysPerWeek":4}'::jsonb),
       (gen_random_uuid(), gen_random_uuid(), repeat('界', 64000),
        '{"startWeek":1,"weekCount":12,"daysPerWeek":4}'::jsonb);
DO $$
BEGIN
  IF (SELECT count(*) FROM program_brief_capacity) <> 2 THEN
    RAISE EXCEPTION 'The full 64000-character drafts were not retained';
  END IF;
  BEGIN
    INSERT INTO program_brief_capacity(member_id, coach_id, brief, scope)
    VALUES (gen_random_uuid(), gen_random_uuid(), repeat('x', 64001), '{}'::jsonb);
    RAISE EXCEPTION 'Oversized draft unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO program_brief_capacity(member_id, coach_id, brief, scope)
    VALUES (gen_random_uuid(), gen_random_uuid(), '', '{}'::jsonb);
    RAISE EXCEPTION 'Empty draft unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
SELECT '64000 ASCII and Unicode characters retained; 64001 and empty rejected' AS capacity_check;
ROLLBACK;
