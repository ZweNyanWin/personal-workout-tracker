-- Tommy history is server-owned. Clients retain their own read access, while
-- database triggers bound writes and prevent a saved answer from being changed.
BEGIN;

REVOKE ALL ON coach_chat_turns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON coach_chat_turns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON coach_chat_turns TO service_role;
REVOKE ALL ON FUNCTION save_coach_chat_turn(uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION guard_coach_chat_turn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  recent_minute integer;
  recent_hour integer;
  total_turns integer;
  checked_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.answer IS NOT NULL THEN RAISE EXCEPTION 'A new coach answer must come from a completed job'; END IF;
    IF NEW.assignment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_program_assignments
      WHERE id = NEW.assignment_id AND user_id = NEW.user_id
    ) THEN RAISE EXCEPTION 'Chat assignment does not belong to this client'; END IF;

    -- Serialize per-client checks across route instances before counting.
    PERFORM pg_advisory_xact_lock(hashtextextended('coach-chat:' || NEW.user_id::text, 0));
    checked_at := clock_timestamp();
    SELECT count(*) FILTER (WHERE created_at >= checked_at - interval '1 minute'),
           count(*) FILTER (WHERE created_at >= checked_at - interval '1 hour'),
           count(*)
      INTO recent_minute, recent_hour, total_turns
      FROM coach_chat_turns
      WHERE user_id = NEW.user_id;
    IF total_turns >= 500 THEN
      RAISE EXCEPTION 'Saved coach history is full (500 turns). Contact your coach to archive or export older messages before sending more';
    END IF;
    IF recent_minute >= 6 OR recent_hour >= 60 THEN
      RAISE EXCEPTION 'Too many coach messages. Try again later';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.answer IS NOT NULL THEN RAISE EXCEPTION 'Saved coach answers are immutable'; END IF;
  IF NEW.answer IS NULL OR btrim(NEW.answer) = '' THEN RAISE EXCEPTION 'A completed coach answer is required'; END IF;
  IF (to_jsonb(NEW) - 'answer') IS DISTINCT FROM (to_jsonb(OLD) - 'answer') THEN
    RAISE EXCEPTION 'Only the pending coach answer can be completed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guarded_coach_chat_turn ON coach_chat_turns;
CREATE TRIGGER guarded_coach_chat_turn
  BEFORE INSERT OR UPDATE ON coach_chat_turns
  FOR EACH ROW EXECUTE FUNCTION guard_coach_chat_turn();

-- Members submit review requests only through this authenticated RPC. Limit
-- each client to three per hour, ten unresolved, and 500 saved requests.
CREATE OR REPLACE FUNCTION create_coaching_review_request(p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_id uuid := auth.uid();
  result_id uuid;
  assignment_id uuid;
  recent_hour integer;
  open_count integer;
  total_requests integer;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Write a review request of at most 2,000 characters';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('coach-review:' || actor_id::text, 0));
  SELECT count(*) FILTER (WHERE created_at >= clock_timestamp() - interval '1 hour'),
         count(*) FILTER (WHERE status = 'open'), count(*)
    INTO recent_hour, open_count, total_requests
    FROM coaching_review_requests WHERE member_id = actor_id;
  IF total_requests >= 500 THEN
    RAISE EXCEPTION 'Saved review history is full (500 requests). Contact your coach to archive or export older requests before sending more';
  END IF;
  IF recent_hour >= 3 THEN RAISE EXCEPTION 'Too many review requests. Try again later'; END IF;
  IF open_count >= 10 THEN RAISE EXCEPTION 'Please wait for your coach to review an open request'; END IF;

  SELECT id INTO assignment_id FROM user_program_assignments
    WHERE user_id = actor_id AND is_active ORDER BY created_at DESC LIMIT 1;
  INSERT INTO coaching_review_requests(member_id,assignment_id,message)
    VALUES(actor_id,assignment_id,btrim(p_message)) RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;
REVOKE INSERT, DELETE ON coaching_review_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_coaching_review_request(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_coaching_review_request(text) TO authenticated;
CREATE INDEX IF NOT EXISTS coaching_review_requests_member_created
  ON coaching_review_requests(member_id, created_at DESC);

COMMIT;
