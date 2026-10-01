export type RecoverySessionState = "ready" | "invalid" | "unavailable";
export type RecoveryCallbackError = "invalid_link" | "verification_unavailable";

type AuthError = {
  code?: string;
  name?: string;
  status?: number;
};

const invalidSessionCodes = new Set([
  "bad_jwt",
  "session_not_found",
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

export function recoverySessionState(
  result: { data: { user: unknown | null }; error: AuthError | null },
  callbackError: string | null
): RecoverySessionState {
  // A failed code exchange must not be mistaken for a successful recovery
  // just because this browser already has another authenticated session.
  if (callbackError === "invalid_link") return "invalid";
  if (callbackError === "verification_unavailable") return "unavailable";
  if (!result.error) return result.data.user ? "ready" : "invalid";

  const { code, name, status } = result.error;
  if (
    name === "AuthSessionMissingError" ||
    (code && invalidSessionCodes.has(code)) ||
    status === 401 || status === 403
  ) {
    return "invalid";
  }
  return "unavailable";
}

export function recoveryCallbackError(error: AuthError): RecoveryCallbackError {
  const { code, name, status } = error;
  if (
    name === "AuthPKCEGrantCodeExchangeError" ||
    ["bad_code_verifier", "flow_state_not_found", "flow_state_expired", "otp_expired"].includes(code ?? "") ||
    (status !== undefined && status >= 400 && status < 500 && status !== 429)
  ) {
    return "invalid_link";
  }
  return "verification_unavailable";
}
