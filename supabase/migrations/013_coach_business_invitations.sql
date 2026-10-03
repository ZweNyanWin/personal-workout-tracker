-- Owner-approved invitations are separate from business membership. No email
-- token or service key is stored here; email acceptance uses Supabase Auth.
BEGIN;

CREATE TABLE coach_business_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 email text NOT NULL UNIQUE CHECK (email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 320),
 invited_by uuid NOT NULL REFERENCES platform_operators(user_id) ON DELETE RESTRICT,
 auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','email_sent','email_failed','accepted','cancelled')),
 failure_code text CHECK (failure_code IN ('recipient_not_authorized','email_rate_limit','email_service_unavailable','server_not_configured')),
 attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
 last_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 organization_id uuid REFERENCES coach_organizations(id) ON DELETE RESTRICT,
 CHECK ((status='accepted')=(organization_id IS NOT NULL))
);
ALTER TABLE coach_business_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coach_business_invitations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON coach_business_invitations TO authenticated;
GRANT ALL ON coach_business_invitations TO service_role;
CREATE POLICY "invitations: operator read" ON coach_business_invitations FOR SELECT TO authenticated USING(is_platform_operator());
CREATE TABLE coach_invitation_send_attempts (
 id uuid PRIMARY KEY,
 invitation_id uuid NOT NULL REFERENCES coach_business_invitations(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coach_invitation_send_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON coach_invitation_send_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON coach_invitation_send_attempts TO service_role;

CREATE FUNCTION prepare_coach_business_invitation(p_name text,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation coach_business_invitations; target_id uuid; confirmed_at timestamptz; business_id uuid; clean_email text:=lower(btrim(p_email));
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the PowerBuild owner can invite coach businesses'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR clean_email IS NULL OR length(clean_email)>320 OR clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 THEN RAISE EXCEPTION 'Enter a business name and coach email'; END IF;
 -- Serializes owner send claims across processes and restricts aggregate abuse.
 PERFORM pg_advisory_xact_lock(hashtextextended('powerbuild-coach-invitations',43));
 SELECT id,email_confirmed_at INTO target_id,confirmed_at FROM auth.users WHERE lower(email)=clean_email;
 IF target_id IS NOT NULL AND EXISTS(SELECT 1 FROM coach_memberships WHERE user_id=target_id)
 THEN RAISE EXCEPTION 'This account already belongs to a coaching business'; END IF;
 IF target_id IS NOT NULL AND confirmed_at IS NOT NULL THEN
  business_id:=create_coach_business(btrim(p_name),clean_email);
  UPDATE coach_business_invitations SET status='accepted',organization_id=business_id,failure_code=NULL,auth_user_id=target_id WHERE email=clean_email;
  RETURN jsonb_build_object('state','created','businessId',business_id);
 END IF;
 SELECT * INTO invitation FROM coach_business_invitations WHERE email=clean_email FOR UPDATE;
 IF invitation.id IS NOT NULL AND invitation.last_attempt_at>now()-interval '60 seconds'
 THEN RAISE EXCEPTION 'Wait at least one minute before resending this invitation'; END IF;
 IF (SELECT count(*) FROM coach_invitation_send_attempts WHERE created_at>now()-interval '1 hour')>=10
 THEN RAISE EXCEPTION 'Invitation limit reached. Wait before inviting more coaches'; END IF;
 INSERT INTO coach_business_invitations(name,email,invited_by,auth_user_id)
 VALUES(btrim(p_name),clean_email,auth.uid(),target_id)
 ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,invited_by=EXCLUDED.invited_by,auth_user_id=EXCLUDED.auth_user_id,
 status='sending',failure_code=NULL,attempt_id=gen_random_uuid(),last_attempt_at=now(),expires_at=now()+interval '7 days',organization_id=NULL
 RETURNING * INTO invitation;
 INSERT INTO coach_invitation_send_attempts(id,invitation_id) VALUES(invitation.attempt_id,invitation.id);
 RETURN jsonb_build_object('state','pending','invitationId',invitation.id,'attemptId',invitation.attempt_id,'email',invitation.email);
END;
$$;

CREATE FUNCTION cancel_coach_business_invitation(p_invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the PowerBuild owner can cancel invitations'; END IF;
 UPDATE coach_business_invitations SET status='cancelled',failure_code=NULL WHERE id=p_invitation_id AND status IN ('sending','email_sent','email_failed');
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending invitation not found'; END IF;
END;
$$;

CREATE FUNCTION record_coach_invitation_delivery(p_invitation_id uuid,p_attempt_id uuid,p_auth_user_id uuid,p_failure_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation coach_business_invitations;
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the PowerBuild owner can update invitations'; END IF;
 IF p_failure_code IS NOT NULL AND p_failure_code NOT IN ('recipient_not_authorized','email_rate_limit','email_service_unavailable','server_not_configured')
 THEN RAISE EXCEPTION 'Invalid invitation delivery status'; END IF;
 SELECT * INTO invitation FROM coach_business_invitations WHERE id=p_invitation_id AND attempt_id=p_attempt_id FOR UPDATE;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation changed. Reload its current status'; END IF;
 IF invitation.status='accepted' THEN RETURN; END IF;
 IF invitation.status<>'sending' THEN RAISE EXCEPTION 'Invitation is not awaiting delivery'; END IF;
 IF p_auth_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_user_id AND lower(email)=invitation.email)
 THEN RAISE EXCEPTION 'Invitation account does not match its email'; END IF;
 IF p_failure_code IS NULL AND p_auth_user_id IS NULL THEN RAISE EXCEPTION 'Invitation email result is missing'; END IF;
 UPDATE coach_business_invitations SET status=CASE WHEN p_failure_code IS NULL THEN 'email_sent' ELSE 'email_failed' END,
 failure_code=p_failure_code,auth_user_id=coalesce(p_auth_user_id,auth_user_id) WHERE id=invitation.id;
END;
$$;

CREATE FUNCTION get_my_coach_business_invitation()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in using your invitation first'; END IF;
 SELECT jsonb_build_object('name',i.name,'status',i.status,'expiresAt',i.expires_at,'businessId',i.organization_id) INTO result
 FROM coach_business_invitations i JOIN auth.users u ON lower(u.email)=i.email
 WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL
 AND (i.auth_user_id IS NULL OR i.auth_user_id=u.id) AND i.status IN ('sending','email_sent','email_failed','accepted')
 AND (i.status='accepted' OR i.expires_at>now());
 RETURN result;
END;
$$;

CREATE FUNCTION accept_coach_business_invitation()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invitation coach_business_invitations; target_email text; business_id uuid; membership_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in using your invitation first'; END IF;
 SELECT lower(email) INTO target_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF target_email IS NULL THEN RAISE EXCEPTION 'Accept the email invitation to verify this account first'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42));
 SELECT * INTO invitation FROM coach_business_invitations WHERE email=target_email FOR UPDATE;
 IF invitation.id IS NULL OR invitation.status='cancelled' OR (invitation.auth_user_id IS NOT NULL AND invitation.auth_user_id<>auth.uid())
 THEN RAISE EXCEPTION 'No coach invitation is available for this verified account'; END IF;
 SELECT organization_id INTO membership_id FROM coach_memberships WHERE user_id=auth.uid();
 IF invitation.status='accepted' THEN
  IF membership_id=invitation.organization_id THEN RETURN invitation.organization_id; END IF;
  RAISE EXCEPTION 'This invitation has already been accepted';
 END IF;
 IF invitation.expires_at<=now() THEN RAISE EXCEPTION 'This invitation expired. Ask the PowerBuild owner to resend it'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_operators WHERE user_id=invitation.invited_by) THEN RAISE EXCEPTION 'This invitation is no longer authorized'; END IF;
 IF membership_id IS NOT NULL THEN RAISE EXCEPTION 'This account already belongs to a coaching business'; END IF;
 INSERT INTO coach_organizations(name,owner_user_id) VALUES(invitation.name,auth.uid()) RETURNING id INTO business_id;
 INSERT INTO coach_memberships(user_id,organization_id,role) VALUES(auth.uid(),business_id,'coach');
 UPDATE profiles SET role='admin' WHERE id=auth.uid();
 UPDATE coach_business_invitations SET status='accepted',failure_code=NULL,auth_user_id=auth.uid(),organization_id=business_id WHERE id=invitation.id;
 RETURN business_id;
END;
$$;

REVOKE ALL ON FUNCTION prepare_coach_business_invitation(text,text),record_coach_invitation_delivery(uuid,uuid,uuid,text),get_my_coach_business_invitation(),accept_coach_business_invitation(),cancel_coach_business_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION prepare_coach_business_invitation(text,text),record_coach_invitation_delivery(uuid,uuid,uuid,text),get_my_coach_business_invitation(),accept_coach_business_invitation(),cancel_coach_business_invitation(uuid) TO authenticated;

-- Direct verified-account onboarding remains available, but its old instruction
-- must not imply that public signup is enabled.
CREATE OR REPLACE FUNCTION create_coach_business(p_name text,p_coach_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE coach_id uuid; organization_id uuid;
BEGIN
 IF NOT is_platform_operator() THEN RAISE EXCEPTION 'Only the platform owner can onboard coach businesses'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_coach_email IS NULL OR length(p_coach_email)>320 THEN RAISE EXCEPTION 'Enter a business name and verified coach email'; END IF;
 SELECT p.id INTO coach_id FROM profiles p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)=lower(btrim(p_coach_email)) AND u.email_confirmed_at IS NOT NULL;
 IF coach_id IS NULL THEN RAISE EXCEPTION 'Invite this coach and have them accept the email link first. Public signup is closed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(coach_id::text,42));
 IF EXISTS(SELECT 1 FROM coach_memberships WHERE user_id=coach_id) THEN RAISE EXCEPTION 'This account already belongs to a coaching business'; END IF;
 INSERT INTO coach_organizations(name,owner_user_id) VALUES(btrim(p_name),coach_id) RETURNING id INTO organization_id;
 INSERT INTO coach_memberships(user_id,organization_id,role) VALUES(coach_id,organization_id,'coach');
 UPDATE profiles SET role='admin' WHERE id=coach_id;
 RETURN organization_id;
END;
$$;

COMMIT;
