-- Synthetic security checks. Run after migration 008 only on a disposable DB.
-- Everything here, including fixture users and any trigger state, rolls back.
BEGIN;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  ('cc000001-0000-4000-8000-000000000001','chat-a@example.invalid','{}'),
  ('cc000001-0000-4000-8000-000000000002','chat-b@example.invalid','{}'),
  ('cc000001-0000-4000-8000-000000000003','chat-c@example.invalid','{}');
INSERT INTO programs(title) VALUES('Chat security fixture');
INSERT INTO user_program_assignments(user_id,program_id)
  SELECT 'cc000001-0000-4000-8000-000000000002',id FROM programs
  WHERE title='Chat security fixture' ORDER BY created_at DESC LIMIT 1;
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT ON user_program_assignments TO service_role;
-- The local test role is minimal; production Supabase service_role bypasses RLS.
ALTER ROLE service_role BYPASSRLS;

DO $$ BEGIN
  IF has_table_privilege('authenticated','coach_chat_turns','INSERT')
     OR has_table_privilege('authenticated','coach_chat_turns','UPDATE')
     OR has_table_privilege('authenticated','coach_chat_turns','DELETE') THEN
    RAISE EXCEPTION 'TEST FAILED: client has a direct chat write grant';
  END IF;
  IF has_function_privilege('authenticated','save_coach_chat_turn(uuid,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: old client chat RPC is callable';
  END IF;
  IF NOT has_table_privilege('authenticated','coach_chat_turns','SELECT') THEN
    RAISE EXCEPTION 'TEST FAILED: clients lost their own history read grant';
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cc000001-0000-4000-8000-000000000001',false);
DO $$ BEGIN
  BEGIN
    INSERT INTO coach_chat_turns(user_id,job_id,question,answer)
      VALUES(auth.uid(),gen_random_uuid(),'Forged question','Forged Tommy answer');
    RAISE EXCEPTION 'TEST FAILED: client forged Tommy history';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM save_coach_chat_turn(gen_random_uuid(),'Forged question','Forged answer');
    RAISE EXCEPTION 'TEST FAILED: old RPC forged Tommy history';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM create_coaching_review_request('Review one');
  PERFORM create_coaching_review_request('Review two');
  PERFORM create_coaching_review_request('Review three');
  BEGIN
    PERFORM create_coaching_review_request('A fourth request in an hour');
    RAISE EXCEPTION 'TEST FAILED: review hourly cap was bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Too many review requests%' THEN RAISE; END IF; END;
END $$;

SELECT set_config('request.jwt.claim.sub','cc000001-0000-4000-8000-000000000002',false);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM coaching_review_requests WHERE member_id='cc000001-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'TEST FAILED: client can read another client review requests';
  END IF;
END $$;
RESET ROLE;

-- Older open requests test the open cap independently of the hourly cap.
INSERT INTO coaching_review_requests(member_id,message,created_at)
SELECT 'cc000001-0000-4000-8000-000000000002','Older open review',clock_timestamp()-interval '2 hours'
FROM generate_series(1,10);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cc000001-0000-4000-8000-000000000002',false);
DO $$ BEGIN
  BEGIN
    PERFORM create_coaching_review_request('More than ten open');
    RAISE EXCEPTION 'TEST FAILED: review open cap was bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Please wait for your coach%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;

SET ROLE service_role;
DO $$ DECLARE turn_id uuid; other_assignment uuid; i integer; BEGIN
  SELECT id INTO other_assignment FROM user_program_assignments
    WHERE user_id='cc000001-0000-4000-8000-000000000002' LIMIT 1;
  BEGIN
    INSERT INTO coach_chat_turns(user_id,job_id,question,assignment_id)
      VALUES('cc000001-0000-4000-8000-000000000001',gen_random_uuid(),'Wrong assignment',other_assignment);
    RAISE EXCEPTION 'TEST FAILED: server associated another client assignment';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Chat assignment does not belong%' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO coach_chat_turns(user_id,job_id,question,answer)
      VALUES('cc000001-0000-4000-8000-000000000001',gen_random_uuid(),'Premature','Fake answer');
    RAISE EXCEPTION 'TEST FAILED: accepted job included an answer';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'A new coach answer must come%' THEN RAISE; END IF; END;
  INSERT INTO coach_chat_turns(user_id,job_id,question)
    VALUES('cc000001-0000-4000-8000-000000000001',gen_random_uuid(),'Real question')
    RETURNING id INTO turn_id;
  UPDATE coach_chat_turns SET answer='Real completed answer' WHERE id=turn_id;
  BEGIN
    UPDATE coach_chat_turns SET answer='Rewritten answer' WHERE id=turn_id;
    RAISE EXCEPTION 'TEST FAILED: completed answer was editable';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Saved coach answers are immutable%' THEN RAISE; END IF; END;
  FOR i IN 2..6 LOOP
    INSERT INTO coach_chat_turns(user_id,job_id,question)
      VALUES('cc000001-0000-4000-8000-000000000001',gen_random_uuid(),'Minute quota fixture');
  END LOOP;
  BEGIN
    INSERT INTO coach_chat_turns(user_id,job_id,question)
      VALUES('cc000001-0000-4000-8000-000000000001',gen_random_uuid(),'Seventh in a minute');
    RAISE EXCEPTION 'TEST FAILED: chat minute cap was bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Too many coach messages%' THEN RAISE; END IF; END;
  FOR i IN 1..60 LOOP
    INSERT INTO coach_chat_turns(user_id,job_id,question,created_at)
      VALUES('cc000001-0000-4000-8000-000000000002',gen_random_uuid(),'Hour quota fixture',clock_timestamp()-interval '2 minutes');
  END LOOP;
  BEGIN
    INSERT INTO coach_chat_turns(user_id,job_id,question)
      VALUES('cc000001-0000-4000-8000-000000000002',gen_random_uuid(),'Sixty first in an hour');
    RAISE EXCEPTION 'TEST FAILED: chat hour cap was bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Too many coach messages%' THEN RAISE; END IF; END;
  FOR i IN 1..500 LOOP
    INSERT INTO coach_chat_turns(user_id,job_id,question,created_at)
      VALUES('cc000001-0000-4000-8000-000000000003',gen_random_uuid(),'Preserved history '||i,clock_timestamp()-interval '2 days' + i*interval '1 second');
  END LOOP;
  UPDATE coach_chat_turns SET answer='Completed at the history cap'
    WHERE user_id='cc000001-0000-4000-8000-000000000003' AND question='Preserved history 1';
  IF NOT EXISTS(SELECT 1 FROM coach_chat_turns WHERE user_id='cc000001-0000-4000-8000-000000000003'
      AND question='Preserved history 1' AND answer='Completed at the history cap') THEN
    RAISE EXCEPTION 'TEST FAILED: pending answer could not complete at the cap';
  END IF;
  BEGIN
    INSERT INTO coach_chat_turns(user_id,job_id,question)
      VALUES('cc000001-0000-4000-8000-000000000003',gen_random_uuid(),'Beyond saved history cap');
    RAISE EXCEPTION 'TEST FAILED: chat total cap was bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Saved coach history is full%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM coach_chat_turns WHERE user_id='cc000001-0000-4000-8000-000000000003') <> 500 THEN
    RAISE EXCEPTION 'TEST FAILED: chat history count changed at the cap';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM coach_chat_turns WHERE user_id='cc000001-0000-4000-8000-000000000003' AND question='Preserved history 1') THEN
    RAISE EXCEPTION 'TEST FAILED: the cap deleted existing chat history';
  END IF;
END $$;
RESET ROLE;

INSERT INTO coaching_review_requests(member_id,message,status,created_at)
SELECT 'cc000001-0000-4000-8000-000000000003','Preserved review '||n,'resolved',clock_timestamp()-interval '2 days' + n*interval '1 second'
FROM generate_series(1,500) AS n;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cc000001-0000-4000-8000-000000000003',false);
DO $$ BEGIN
  BEGIN
    PERFORM create_coaching_review_request('Beyond saved review cap');
    RAISE EXCEPTION 'TEST FAILED: review total cap was bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Saved review history is full%' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM coaching_review_requests WHERE member_id=auth.uid())<>500
     OR NOT EXISTS(SELECT 1 FROM coaching_review_requests WHERE member_id=auth.uid() AND message='Preserved review 1') THEN
    RAISE EXCEPTION 'TEST FAILED: review history was lost at the cap';
  END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cc000001-0000-4000-8000-000000000001',false);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM coach_chat_turns WHERE question='Real question' AND answer='Real completed answer') THEN
    RAISE EXCEPTION 'TEST FAILED: owner lost completed chat history';
  END IF;
  BEGIN
    UPDATE coach_chat_turns SET answer='Forged rewrite' WHERE question='Real question';
    RAISE EXCEPTION 'TEST FAILED: client rewrote a completed answer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM coach_chat_turns WHERE user_id='cc000001-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'TEST FAILED: client can read another client chat';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'coach chat provenance, quotas, preserved history and review limits passed' AS result;
