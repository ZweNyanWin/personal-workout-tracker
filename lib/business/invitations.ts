import { z } from "zod";

export const invitationFailureSchema = z.enum(["recipient_not_authorized", "email_rate_limit", "email_service_unavailable", "server_not_configured"]);
export type InvitationFailure = z.infer<typeof invitationFailureSchema>;
export const coachInvitationSchema = z.object({
  id: z.string().uuid(), name: z.string(), email: z.string().email(),
  status: z.enum(["sending", "email_sent", "email_failed", "accepted", "cancelled"]),
  failure_code: invitationFailureSchema.nullable(), created_at: z.string(),
  last_attempt_at: z.string(), expires_at: z.string(), organization_id: z.string().uuid().nullable(),
}).strict();
export type CoachInvitation = z.infer<typeof coachInvitationSchema>;
export const preparedInvitationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("created"), businessId: z.string().uuid() }).strict(),
  z.object({ state: z.literal("pending"), invitationId: z.string().uuid(), attemptId: z.string().uuid(), email: z.string().email() }).strict(),
]);
export type CoachOnboardingResult =
  | { state: "created"; businessId: string }
  | { state: "email_sent"; invitationId: string }
  | { state: "email_failed"; invitationId: string; failure: InvitationFailure };

export class InvitationConfigurationError extends Error {
  constructor() { super("Invitation service is not configured"); }
}

/** Privileged adapters run only after owner authorization. Keep provider records out of the result. */
export async function deliverCoachInvitation(
  prepared: Extract<z.infer<typeof preparedInvitationSchema>, { state: "pending" }>,
  send: () => Promise<{ user: { id: string; email?: string } | null; error: { code?: string; status?: number; message?: string } | null }>,
  record: (authUserId: string | null, failure: InvitationFailure | null) => Promise<void>,
): Promise<CoachOnboardingResult> {
  let failure: InvitationFailure | null = null;
  let authUserId: string | null = null;
  try {
    const result = await send();
    if (result.error) failure = invitationFailure(result.error);
    else if (result.user?.email?.toLowerCase() === prepared.email && z.string().uuid().safeParse(result.user.id).success) authUserId = result.user.id;
    else failure = "email_service_unavailable";
  } catch (error) {
    failure = error instanceof InvitationConfigurationError ? "server_not_configured" : "email_service_unavailable";
  }
  try { await record(authUserId, failure); }
  catch { throw new Error("The invitation request finished, but its saved status could not be checked. Reload before resending."); }
  return failure ? { state: "email_failed", invitationId: prepared.invitationId, failure }
    : { state: "email_sent", invitationId: prepared.invitationId };
}

/** The provider error can contain request details. Only an allowlisted code leaves the server. */
export function invitationFailure(error: { code?: string; status?: number; message?: string } | null | undefined): InvitationFailure {
  if (error?.code === "email_address_not_authorized" || /email address not authorized/i.test(error?.message ?? "")) return "recipient_not_authorized";
  if (error?.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(error?.code ?? "")) return "email_rate_limit";
  return "email_service_unavailable";
}

export function invitationFailureMessage(failure: InvitationFailure) {
  if (failure === "recipient_not_authorized") return "Invitation saved, but Supabase's default email sender only sends to your Supabase project team. Configure a custom SMTP sender to invite other coaches. No business access has been granted.";
  if (failure === "email_rate_limit") return "Invitation saved, but the email sender's rate limit was reached. Wait before resending. No business access has been granted.";
  if (failure === "server_not_configured") return "Invitation saved, but the server's invitation service is not configured. The PowerBuild owner must finish server setup before resending.";
  return "Invitation saved, but the email service could not confirm sending. Check the sender configuration and resend. No business access has been granted.";
}

/** Redirects are derived from server configuration, never a submitted host or URL. */
export function coachInvitationRedirect(appUrl: string | undefined, development = false) {
  if (!appUrl) throw new Error("Configure the application's invitation URL first");
  const url = new URL(appUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(development && local && url.protocol === "http:"))) {
    throw new Error("Configure a secure application origin for invitations");
  }
  return new URL("/accept-coach-invite", url.origin).toString();
}

/** Accept only complete invite fragments; a malformed link must not use an unrelated session. */
export function coachInviteFragment(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.has("error") || params.has("error_code")) return { state: "invalid" as const };
  const access = params.get("access_token"), refresh = params.get("refresh_token");
  if (!access && !refresh) return { state: "none" as const };
  if (!access || !refresh || params.get("type") !== "invite" || access.length > 16_384 || refresh.length > 16_384) return { state: "invalid" as const };
  return { state: "session" as const, access_token: access, refresh_token: refresh };
}
