-- Synthetic, rollback-only checks. Run after migrations 004 and 009 in a
-- disposable local database, never production. No existing rows are altered.
BEGIN;
DO $$
DECLARE
  v_row RECORD;
  v_id UUID;
  v_source TEXT := repeat('a',64);
  v_desktop TEXT := repeat('b',64);
  v_approval TEXT := repeat('c',64);
  v_count INTEGER;
BEGIN
  IF EXISTS(SELECT 1 FROM public.qr_login_rate_events WHERE created_at > clock_timestamp() - INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Use an isolated QR security fixture with no recent rate events';
  END IF;

  FOR i IN 1..6 LOOP
    v_id := gen_random_uuid();
    SELECT * INTO v_row FROM public.create_qr_login_request(v_id,v_source,v_desktop,v_approval,'123456');
    IF NOT v_row.accepted OR v_row.retry_after_seconds <> 0 THEN RAISE EXCEPTION 'TEST FAILED: allowed source budget rejected'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.qr_login_requests WHERE id=v_id AND expires_at=created_at+INTERVAL '5 minutes') THEN
      RAISE EXCEPTION 'TEST FAILED: request expiry must be set atomically by database';
    END IF;
  END LOOP;
  v_id := gen_random_uuid();
  SELECT * INTO v_row FROM public.create_qr_login_request(v_id,v_source,v_desktop,v_approval,'123456');
  IF v_row.accepted OR v_row.retry_after_seconds NOT BETWEEN 1 AND 60 OR EXISTS(SELECT 1 FROM public.qr_login_requests WHERE id=v_id) THEN
    RAISE EXCEPTION 'TEST FAILED: per-source minute budget failed';
  END IF;
  SELECT count(*) INTO v_count FROM public.qr_login_rate_events WHERE source_hash=v_source;
  IF v_count<>6 THEN RAISE EXCEPTION 'TEST FAILED: denied request consumed a rate event'; END IF;

  -- An expired token is removed while its still-relevant rate event survives.
  UPDATE public.qr_login_requests SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE desktop_secret_hash=v_desktop;
  SELECT * INTO v_row FROM public.create_qr_login_request(gen_random_uuid(),repeat('d',64),v_desktop,v_approval,'123456');
  IF NOT v_row.accepted OR EXISTS(SELECT 1 FROM public.qr_login_requests WHERE expires_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'TEST FAILED: expired QR cleanup failed';
  END IF;
  IF (SELECT count(*) FROM public.qr_login_rate_events WHERE source_hash=v_source)<>6 THEN
    RAISE EXCEPTION 'TEST FAILED: expiry cleanup reset source budget';
  END IF;

  -- A source's hour budget also applies when its minute budget is clear.
  INSERT INTO public.qr_login_rate_events(source_hash,created_at)
    SELECT repeat('e',64),clock_timestamp()-INTERVAL '2 minutes' FROM generate_series(1,30);
  SELECT * INTO v_row FROM public.create_qr_login_request(gen_random_uuid(),repeat('e',64),v_desktop,v_approval,'123456');
  IF v_row.accepted OR v_row.retry_after_seconds NOT BETWEEN 3400 AND 3480 THEN RAISE EXCEPTION 'TEST FAILED: per-source hour budget failed'; END IF;

  -- Global budgets prevent distributed callers from filling the free database.
  INSERT INTO public.qr_login_rate_events(source_hash)
    SELECT repeat('f',64) FROM generate_series(1,43);
  SELECT * INTO v_row FROM public.create_qr_login_request(gen_random_uuid(),repeat('1',64),v_desktop,v_approval,'123456');
  IF v_row.accepted THEN RAISE EXCEPTION 'TEST FAILED: global minute budget failed'; END IF;
  UPDATE public.qr_login_rate_events SET created_at=clock_timestamp()-INTERVAL '2 minutes';
  INSERT INTO public.qr_login_rate_events(source_hash,created_at)
    SELECT repeat('2',64),clock_timestamp()-INTERVAL '2 minutes' FROM generate_series(1,220);
  SELECT * INTO v_row FROM public.create_qr_login_request(gen_random_uuid(),repeat('3',64),v_desktop,v_approval,'123456');
  IF v_row.accepted THEN RAISE EXCEPTION 'TEST FAILED: global hour budget failed'; END IF;

  -- Cleanup does a bounded batch even when importing a stale backlog.
  INSERT INTO public.qr_login_requests(id,desktop_secret_hash,approval_secret_hash,verification_code,expires_at)
    SELECT gen_random_uuid(),v_desktop,v_approval,'123456',clock_timestamp()-INTERVAL '1 day' FROM generate_series(1,105);
  INSERT INTO public.qr_login_rate_events(source_hash,created_at)
    SELECT repeat('4',64),clock_timestamp()-INTERVAL '1 day' FROM generate_series(1,505);
  PERFORM public.create_qr_login_request(gen_random_uuid(),repeat('5',64),v_desktop,v_approval,'123456');
  IF (SELECT count(*) FROM public.qr_login_requests WHERE expires_at <= clock_timestamp())<>5 THEN
    RAISE EXCEPTION 'TEST FAILED: QR cleanup batch was not bounded to 100';
  END IF;
  IF (SELECT count(*) FROM public.qr_login_rate_events WHERE created_at <= clock_timestamp()-INTERVAL '1 hour')<>5 THEN
    RAISE EXCEPTION 'TEST FAILED: rate-event cleanup batch was not bounded to 500';
  END IF;

  BEGIN
    PERFORM public.create_qr_login_request(gen_random_uuid(),'raw-ip',v_desktop,v_approval,'123456');
    RAISE EXCEPTION 'TEST FAILED: malformed source hash accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_qr_login_request(gen_random_uuid(),repeat('a',64),repeat('b',64),repeat('c',64),'123456');
    RAISE EXCEPTION 'TEST FAILED: anon can call privileged creation RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.qr_login_rate_events;
    RAISE EXCEPTION 'TEST FAILED: anon can read hashed rate history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.create_qr_login_request(gen_random_uuid(),repeat('a',64),repeat('b',64),repeat('c',64),'123456');
    RAISE EXCEPTION 'TEST FAILED: member can call privileged creation RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE v_row RECORD; BEGIN
  SELECT * INTO v_row FROM public.create_qr_login_request(gen_random_uuid(),repeat('a',64),repeat('b',64),repeat('c',64),'123456');
  BEGIN
    INSERT INTO public.qr_login_requests(id,desktop_secret_hash,approval_secret_hash,verification_code,expires_at)
      VALUES(gen_random_uuid(),repeat('b',64),repeat('c',64),'123456',clock_timestamp()+INTERVAL '5 minutes');
    RAISE EXCEPTION 'TEST FAILED: service role bypassed the atomic creation RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'QR source/global budgets, expiry, bounded cleanup, validation and privileges passed' AS result;
ROLLBACK;
