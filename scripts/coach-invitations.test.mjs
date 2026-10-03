import assert from "node:assert/strict";
import test from "node:test";
import { coachInvitationRedirect, coachInviteFragment, deliverCoachInvitation, InvitationConfigurationError, invitationFailure, invitationFailureMessage, preparedInvitationSchema, coachInvitationSchema } from "../lib/business/invitations.ts";

const pending = { state: "pending", invitationId: "ba000000-0000-4000-8000-000000000001", attemptId: "ba000000-0000-4000-8000-000000000002", email: "synthetic@invalid.example" };

test("coach invites redirect only to the configured secure origin and fixed setup route", () => {
  assert.equal(coachInvitationRedirect("https://powerbuild.example"), "https://powerbuild.example/accept-coach-invite");
  assert.equal(coachInvitationRedirect("http://localhost:3001", true), "http://localhost:3001/accept-coach-invite");
  for (const invalid of [undefined, "http://powerbuild.example", "http://localhost:3001", "https://user:pass@powerbuild.example", "https://powerbuild.example/other", "https://powerbuild.example?next=https://evil.example", "https://powerbuild.example#token", "javascript:alert(1)"]) {
    assert.throws(() => coachInvitationRedirect(invalid));
  }
  assert.throws(() => coachInvitationRedirect("http://external.example", true));
});

test("malformed or expired invitation fragments never fall back to an existing session", () => {
  assert.deepEqual(coachInviteFragment(""), { state: "none" });
  for (const fragment of ["#error=access_denied", "#error_code=otp_expired", "#access_token=fixture", "#refresh_token=fixture", "#access_token=fixture&refresh_token=fixture&type=recovery", `#access_token=${"x".repeat(16_385)}&refresh_token=fixture&type=invite`]) {
    assert.deepEqual(coachInviteFragment(fragment), { state: "invalid" });
  }
  assert.deepEqual(coachInviteFragment("#access_token=fixture-access&refresh_token=fixture-refresh&type=invite"), { state: "session", access_token: "fixture-access", refresh_token: "fixture-refresh" });
});

test("provider response details are reduced to actionable public delivery codes", () => {
  assert.equal(invitationFailure({ code: "email_address_not_authorized", message: "private provider payload" }), "recipient_not_authorized");
  assert.equal(invitationFailure({ message: "Email address not authorized" }), "recipient_not_authorized");
  assert.equal(invitationFailure({ status: 429 }), "email_rate_limit");
  assert.equal(invitationFailure({ code: "over_email_send_rate_limit" }), "email_rate_limit");
  const code = invitationFailure({ status: 500, message: "DO-NOT-RETURN-PRIVATE-PAYLOAD" });
  assert.equal(code, "email_service_unavailable");
  assert.doesNotMatch(invitationFailureMessage(code), /DO-NOT-RETURN/);
  assert.match(invitationFailureMessage("recipient_not_authorized"), /No business access/);
});

test("prepared onboarding DTO rejects unexpected Auth payloads and credentials", () => {
  assert.deepEqual(preparedInvitationSchema.parse(pending), pending);
  for (const extra of ["access_token", "refresh_token", "service_role_key", "user_metadata", "user"]) {
    assert.equal(preparedInvitationSchema.safeParse({ ...pending, [extra]: "fixture" }).success, false);
  }
  assert.equal(preparedInvitationSchema.safeParse({ state: "created", businessId: "not-a-uuid" }).success, false);
});

test("mocked successful sends record only the matching auth ID and return no user payload", async () => {
  const records = [];
  const result = await deliverCoachInvitation(pending, async () => ({ user: { id: "ba000000-0000-4000-8000-000000000003", email: "Synthetic@invalid.example", private_payload: "DO-NOT-RETURN" }, error: null }), async (...record) => { records.push(record); });
  assert.deepEqual(records, [["ba000000-0000-4000-8000-000000000003", null]]);
  assert.deepEqual(result, { state: "email_sent", invitationId: pending.invitationId });
  assert.doesNotMatch(JSON.stringify(result), /DO-NOT-RETURN/);
});

test("blocked SMTP sends remain pending and record a safe failure code", async () => {
  const records = [];
  const result = await deliverCoachInvitation(pending, async () => ({ user: null, error: { code: "email_address_not_authorized", message: "DO-NOT-RETURN" } }), async (...record) => { records.push(record); });
  assert.deepEqual(records, [[null, "recipient_not_authorized"]]);
  assert.deepEqual(result, { state: "email_failed", invitationId: pending.invitationId, failure: "recipient_not_authorized" });
});

test("missing or wrong provider accounts never become a successful invitation", async () => {
  for (const user of [null, { id: "not-a-uuid", email: pending.email }, { id: "ba000000-0000-4000-8000-000000000003", email: "other@invalid.example" }]) {
    const result = await deliverCoachInvitation(pending, async () => ({ user, error: null }), async (id, failure) => { assert.equal(id, null); assert.equal(failure, "email_service_unavailable"); });
    assert.equal(result.state, "email_failed");
  }
});

test("configuration and transport exceptions never reveal their original values", async () => {
  for (const [problem, expected] of [[new InvitationConfigurationError(), "server_not_configured"], [new Error("DO-NOT-RETURN-PRIVATE-TRANSPORT"), "email_service_unavailable"]]) {
    const result = await deliverCoachInvitation(pending, async () => { throw problem; }, async (id, failure) => { assert.equal(id, null); assert.equal(failure, expected); });
    assert.equal(result.failure, expected);
    assert.doesNotMatch(JSON.stringify(result), /DO-NOT-RETURN/);
  }
});

test("a failed status write is ambiguous and must not claim delivery success", async () => {
  await assert.rejects(deliverCoachInvitation(pending, async () => ({ user: { id: "ba000000-0000-4000-8000-000000000003", email: pending.email }, error: null }), async () => { throw new Error("DO-NOT-RETURN-DB-DETAILS"); }), (error) => {
    assert.match(error.message, /Reload before resending/); assert.doesNotMatch(error.message, /DO-NOT-RETURN/); return true;
  });
});

test("owner invitation views contain delivery state without auth account IDs or attempts", () => {
  const row = { id: "ba000000-0000-4000-8000-000000000001", name: "Synthetic coaching", email: "synthetic@invalid.example", status: "email_failed", failure_code: "recipient_not_authorized", created_at: "2026-10-03T00:00:00Z", last_attempt_at: "2026-10-03T00:00:00Z", expires_at: "2026-10-10T00:00:00Z", organization_id: null };
  assert.deepEqual(coachInvitationSchema.parse(row), row);
  assert.equal(coachInvitationSchema.safeParse({ ...row, auth_user_id: "ba000000-0000-4000-8000-000000000002" }).success, false);
  assert.equal(coachInvitationSchema.safeParse({ ...row, failure_code: "raw-provider-response" }).success, false);
});
