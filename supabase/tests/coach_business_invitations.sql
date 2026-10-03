-- Synthetic, rollback-only. No Auth requests or emails occur in this fixture.
BEGIN;
DO $$ BEGIN
 IF current_setting('port')::integer<>55439 OR current_database() NOT LIKE 'powerbuild_%'
 THEN RAISE EXCEPTION 'Use the isolated PowerBuild test database on port 55439'; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(statement text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN RETURN; END;
 RAISE EXCEPTION 'FAIL: write unexpectedly succeeded: %',statement;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('c3000000-0000-0000-0000-000000000001','inviter@invalid.example',now(),'{}'),
 ('c3000000-0000-0000-0000-000000000002','invitee@invalid.example',NULL,'{"role":"admin","platform_operator":true}'),
 ('c3000000-0000-0000-0000-000000000003','wrong-account@invalid.example',now(),'{}'),
 ('c3000000-0000-0000-0000-000000000004','already-verified@invalid.example',now(),'{}'),
 ('c3000000-0000-0000-0000-000000000005','cancelled-invitee@invalid.example',NULL,'{}'),
 ('c3000000-0000-0000-0000-000000000006','expired-invitee@invalid.example',NULL,'{}');
INSERT INTO platform_operators(user_id) VALUES('c3000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_denied($q$INSERT INTO coach_business_invitations(name,email,invited_by) VALUES('Forged','forged@invalid.example',auth.uid())$q$);
SELECT pg_temp.assert_true(prepare_coach_business_invitation('Existing verified business','already-verified@invalid.example')->>'state'='created','verified existing account bypasses email');
SELECT pg_temp.assert_true(prepare_coach_business_invitation('Invitation business','Invitee@invalid.example')->>'state'='pending','unconfirmed coach gets a pending email claim');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM coach_business_invitations WHERE email='invitee@invalid.example' AND status='sending'),'pending record visible to owner');
SELECT pg_temp.expect_denied($q$SELECT prepare_coach_business_invitation('Too soon','invitee@invalid.example')$q$);
DO $$ DECLARE invitation coach_business_invitations; BEGIN
 SELECT * INTO invitation FROM coach_business_invitations WHERE email='invitee@invalid.example';
 PERFORM pg_temp.expect_denied(format('SELECT record_coach_invitation_delivery(%L,%L,%L,NULL)',invitation.id,gen_random_uuid(),'c3000000-0000-0000-0000-000000000002'));
 PERFORM pg_temp.expect_denied(format('SELECT record_coach_invitation_delivery(%L,%L,%L,NULL)',invitation.id,invitation.attempt_id,'c3000000-0000-0000-0000-000000000003'));
 PERFORM record_coach_invitation_delivery(invitation.id,invitation.attempt_id,'c3000000-0000-0000-0000-000000000002','recipient_not_authorized');
 PERFORM pg_temp.assert_true((SELECT status='email_failed' AND organization_id IS NULL FROM coach_business_invitations WHERE id=invitation.id),'blocked email has no business grant');
END $$;
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true(NOT is_admin() AND NOT is_platform_operator(),'unverified invitation and signup metadata grant no role');
SELECT pg_temp.assert_true(get_my_coach_business_invitation() IS NULL,'unverified user cannot resolve invitation');
SELECT pg_temp.expect_denied($q$SELECT accept_coach_business_invitation()$q$);
SELECT pg_temp.expect_denied($q$SELECT prepare_coach_business_invitation('Self grant','invitee@invalid.example')$q$);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coach_business_invitations),'nonoperator cannot read invitation contacts');
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_denied($q$SELECT accept_coach_business_invitation()$q$);
SELECT pg_temp.expect_denied($q$SELECT cancel_coach_business_invitation(gen_random_uuid())$q$);
SELECT pg_temp.expect_denied($q$SELECT record_coach_invitation_delivery(gen_random_uuid(),gen_random_uuid(),NULL,'email_rate_limit')$q$);
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000004';
SELECT pg_temp.assert_true(is_admin() AND NOT is_platform_operator(),'separate business coach is not the operator');
SELECT pg_temp.expect_denied($q$SELECT prepare_coach_business_invitation('Foreign invite','another@invalid.example')$q$);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coach_business_invitations),'separate business coach cannot read owner invitations');
SET LOCAL ROLE anon;
SELECT pg_temp.expect_denied($q$SELECT prepare_coach_business_invitation('Anonymous invite','another@invalid.example')$q$);
SELECT pg_temp.expect_denied($q$SELECT accept_coach_business_invitation()$q$);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coach_memberships WHERE user_id='c3000000-0000-0000-0000-000000000002'),'no membership while unverified');
UPDATE auth.users SET email_confirmed_at=now() WHERE id='c3000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true(get_my_coach_business_invitation()->>'name'='Invitation business','verified intended user resolves pending invitation');
SELECT accept_coach_business_invitation();
SELECT pg_temp.assert_true(is_admin() AND NOT is_platform_operator(),'acceptance grants only its coach business');
SELECT pg_temp.assert_true(accept_coach_business_invitation()=current_coach_organization(),'replay is idempotent for intended coach');
SELECT pg_temp.expect_denied($q$SELECT get_coach_business_metrics()$q$);
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_denied($q$SELECT prepare_coach_business_invitation('Duplicate business','invitee@invalid.example')$q$);
SELECT prepare_coach_business_invitation('Cancelled business','cancelled-invitee@invalid.example');
SELECT cancel_coach_business_invitation(id) FROM coach_business_invitations WHERE email='cancelled-invitee@invalid.example';
SELECT prepare_coach_business_invitation('Expired business','expired-invitee@invalid.example');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id IN ('c3000000-0000-0000-0000-000000000005','c3000000-0000-0000-0000-000000000006');
UPDATE coach_business_invitations SET expires_at=now()-interval '1 minute' WHERE email='expired-invitee@invalid.example';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000005';
SELECT pg_temp.expect_denied($q$SELECT accept_coach_business_invitation()$q$);
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000006';
SELECT pg_temp.expect_denied($q$SELECT accept_coach_business_invitation()$q$);
RESET ROLE;
-- Aggregate limits count resend attempts, rather than only distinct recipients.
INSERT INTO coach_invitation_send_attempts(id,invitation_id)
 SELECT gen_random_uuid(),id FROM coach_business_invitations CROSS JOIN generate_series(1,10) WHERE email='expired-invitee@invalid.example';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c3000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_denied($q$SELECT prepare_coach_business_invitation('Rate-limited business','another@invalid.example')$q$);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM coach_memberships WHERE user_id='c3000000-0000-0000-0000-000000000002'),'accepted coach has exactly one business');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM coach_memberships WHERE user_id IN ('c3000000-0000-0000-0000-000000000005','c3000000-0000-0000-0000-000000000006')),'cancelled and expired invitations never grant membership');
ROLLBACK;
