-- Requires 004_qr_login.sql. Apply before deploying the atomic start route.
-- No raw client IP is stored. The app supplies a purpose-specific keyed hash
-- derived only from Vercel's trusted source-IP header.
BEGIN;
CREATE TABLE public.qr_login_rate_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX qr_login_rate_events_created_at_idx ON public.qr_login_rate_events(created_at);
CREATE INDEX qr_login_rate_events_source_created_at_idx ON public.qr_login_rate_events(source_hash, created_at);
ALTER TABLE public.qr_login_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_login_rate_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.qr_login_rate_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_qr_login_request(
  p_id UUID,
  p_source_hash TEXT,
  p_desktop_secret_hash TEXT,
  p_approval_secret_hash TEXT,
  p_verification_code TEXT
)
RETURNS TABLE(accepted BOOLEAN, expires_at TIMESTAMPTZ, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_retry_at TIMESTAMPTZ;
  v_global_minute BIGINT;
  v_global_hour BIGINT;
  v_global_minute_oldest TIMESTAMPTZ;
  v_global_hour_oldest TIMESTAMPTZ;
  v_source_minute BIGINT;
  v_source_hour BIGINT;
  v_source_minute_oldest TIMESTAMPTZ;
  v_source_hour_oldest TIMESTAMPTZ;
BEGIN
  IF p_id IS NULL OR p_source_hash IS NULL OR p_source_hash !~ '^[0-9a-f]{64}$'
    OR p_desktop_secret_hash IS NULL OR p_desktop_secret_hash !~ '^[0-9a-f]{64}$'
    OR p_approval_secret_hash IS NULL OR p_approval_secret_hash !~ '^[0-9a-f]{64}$'
    OR p_verification_code IS NULL OR p_verification_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid QR sign-in parameters' USING ERRCODE = '22023';
  END IF;

  -- One transaction lock covers both budgets and the token insertion. It is
  -- intentionally global for this small instance, and is released at commit.
  PERFORM pg_catalog.pg_advisory_xact_lock(1768388961, 1);
  v_now := clock_timestamp();

  -- Bounded cleanup keeps the public endpoint from causing an unbounded
  -- delete. Separate rate events preserve the hour budget after QR expiry.
  DELETE FROM public.qr_login_requests WHERE id IN (
    SELECT qr.id FROM public.qr_login_requests qr WHERE qr.expires_at <= v_now
    ORDER BY qr.expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
  );
  DELETE FROM public.qr_login_rate_events WHERE id IN (
    SELECT id FROM public.qr_login_rate_events WHERE created_at <= v_now - INTERVAL '1 hour'
    ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED
  );

  SELECT count(*) FILTER (WHERE created_at > v_now - INTERVAL '1 minute'), count(*),
    min(created_at) FILTER (WHERE created_at > v_now - INTERVAL '1 minute'), min(created_at)
    INTO v_global_minute, v_global_hour, v_global_minute_oldest, v_global_hour_oldest
    FROM public.qr_login_rate_events WHERE created_at > v_now - INTERVAL '1 hour';
  SELECT count(*) FILTER (WHERE created_at > v_now - INTERVAL '1 minute'), count(*),
    min(created_at) FILTER (WHERE created_at > v_now - INTERVAL '1 minute'), min(created_at)
    INTO v_source_minute, v_source_hour, v_source_minute_oldest, v_source_hour_oldest
    FROM public.qr_login_rate_events
    WHERE source_hash = p_source_hash AND created_at > v_now - INTERVAL '1 hour';

  v_retry_at := v_now;
  IF v_source_minute >= 6 THEN v_retry_at := greatest(v_retry_at, v_source_minute_oldest + INTERVAL '1 minute'); END IF;
  IF v_source_hour >= 30 THEN v_retry_at := greatest(v_retry_at, v_source_hour_oldest + INTERVAL '1 hour'); END IF;
  IF v_global_minute >= 50 THEN v_retry_at := greatest(v_retry_at, v_global_minute_oldest + INTERVAL '1 minute'); END IF;
  IF v_global_hour >= 300 THEN v_retry_at := greatest(v_retry_at, v_global_hour_oldest + INTERVAL '1 hour'); END IF;
  IF v_retry_at > v_now THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ,
      greatest(1, ceil(extract(epoch FROM v_retry_at - v_now))::INTEGER);
    RETURN;
  END IF;

  INSERT INTO public.qr_login_rate_events(source_hash, created_at) VALUES(p_source_hash, v_now);
  INSERT INTO public.qr_login_requests(id, desktop_secret_hash, approval_secret_hash, verification_code, expires_at, created_at)
    VALUES(p_id, p_desktop_secret_hash, p_approval_secret_hash, p_verification_code, v_now + INTERVAL '5 minutes', v_now);
  RETURN QUERY SELECT true, v_now + INTERVAL '5 minutes', 0;
END;
$$;

REVOKE ALL ON FUNCTION public.create_qr_login_request(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_qr_login_request(UUID,TEXT,TEXT,TEXT,TEXT) TO service_role;
-- Other QR routes retain read/update/delete access; creation goes through the
-- privileged function so the server cannot accidentally bypass its budget.
REVOKE INSERT ON public.qr_login_requests FROM service_role;
COMMIT;
