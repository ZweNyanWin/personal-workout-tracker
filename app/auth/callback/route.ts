import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";
import { withDeadline } from "@/lib/async/deadline";
import { recoveryCallbackError, type RecoveryCallbackError } from "@/lib/auth/recovery";

export const maxDuration = 20;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const safeNext = safeRedirectPath(requestUrl.searchParams.get("next"));
  let callbackError: RecoveryCallbackError = "invalid_link";

  if (code) {
    try {
      const { error } = await withDeadline(async (signal) => {
        const supabase = await createClient({ signal });
        return supabase.auth.exchangeCodeForSession(code);
      }, 12_000, request.signal);
      if (!error) {
        const response = NextResponse.redirect(new URL(safeNext, requestUrl.origin));
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      callbackError = recoveryCallbackError(error);
    } catch {
      callbackError = "verification_unavailable";
    }
  }

  const errorPath = safeNext === "/update-password" ? "/update-password" : "/login";
  const errorUrl = new URL(errorPath, requestUrl.origin);
  errorUrl.searchParams.set("error", callbackError);
  const response = NextResponse.redirect(errorUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
