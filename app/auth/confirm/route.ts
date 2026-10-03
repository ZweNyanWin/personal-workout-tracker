import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withDeadline } from "@/lib/async/deadline";

export const maxDuration = 20;

/** Optional invite template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  let verified = false;
  if (url.searchParams.get("type") === "invite" && tokenHash && tokenHash.length <= 2048) {
    try {
      const { error } = await withDeadline(async (signal) => {
        const supabase = await createClient({ signal });
        return supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
      }, 12_000, request.signal);
      verified = !error;
    } catch { /* Never include a one-use token or provider response in diagnostics. */ }
  }
  const destination = new URL("/accept-coach-invite", url.origin);
  if (!verified) destination.searchParams.set("error", "invalid_link");
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
