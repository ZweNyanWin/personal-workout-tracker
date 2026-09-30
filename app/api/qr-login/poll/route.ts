import { createClient } from "@/lib/supabase/server";
import { getQrAdminClient, hashSecret, qrJson, validQrCredentials } from "@/lib/qr-login";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!validQrCredentials(body?.id, body?.desktopSecret)) {
    return qrJson({ error: "Invalid sign-in request." }, 400);
  }
  const admin = getQrAdminClient();
  if (!admin) return qrJson({ error: "Phone sign-in is not configured yet." }, 503);

  const secretHash = hashSecret(body.desktopSecret);
  const { data: pairing, error } = await admin.from("qr_login_requests")
    .select("status, expires_at")
    .eq("id", body.id)
    .eq("desktop_secret_hash", secretHash)
    .maybeSingle();
  if (error || !pairing) return qrJson({ error: "Sign-in request not found." }, 404);
  if (new Date(pairing.expires_at).getTime() <= Date.now()) {
    return qrJson({ status: "expired" }, 410);
  }
  if (pairing.status === "pending" || pairing.status === "authorizing") {
    return qrJson({ status: "pending" });
  }
  if (pairing.status !== "approved") {
    return qrJson({ status: "expired" }, 410);
  }

  // Only one waiting desktop can claim the one-time token.
  const { data: claimed, error: claimError } = await admin.from("qr_login_requests")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("desktop_secret_hash", secretHash)
    .eq("status", "approved")
    .gt("expires_at", new Date().toISOString())
    .select("token_hash, approved_user_id")
    .maybeSingle();
  if (claimError || !claimed?.token_hash) return qrJson({ status: "expired" }, 410);

  const supabase = await createClient();
  const { data, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: claimed.token_hash,
    type: "magiclink",
  });
  await admin.from("qr_login_requests").update({ token_hash: null }).eq("id", body.id);
  if (verifyError || data.user?.id !== claimed.approved_user_id) {
    return qrJson({ error: "Phone approval could not be verified. Start again." }, 503);
  }

  return qrJson({ status: "complete" });
}
