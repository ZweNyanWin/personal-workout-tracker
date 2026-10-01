import { createClient } from "@/lib/supabase/server";
import { getQrAdminClient, hashSecret, qrJson, validQrCredentials } from "@/lib/qr-login";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return qrJson({ error: "Sign in on your phone, then scan again." }, 401);

  const { data: profile } = await supabase.from("profiles")
    .select("id").eq("id", user.id).maybeSingle();
  if (!profile) return qrJson({ error: "Your account is not a tracker member." }, 403);

  const body = await request.json().catch(() => null);
  if (!validQrCredentials(body?.id, body?.approvalSecret)) {
    return qrJson({ error: "Invalid QR code." }, 400);
  }
  const admin = getQrAdminClient();
  if (!admin) return qrJson({ error: "Phone sign-in is not configured yet." }, 503);

  // Atomically claim the pending request before issuing a sign-in token.
  const { data: claimed, error: claimError } = await admin.from("qr_login_requests")
    .update({ status: "authorizing", approved_user_id: user.id })
    .eq("id", body.id)
    .eq("approval_secret_hash", hashSecret(body.approvalSecret))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    return qrJson({ error: "This QR code expired or was already approved." }, 410);
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink", email: user.email,
  });
  if (linkError || !link?.properties.hashed_token || link.user.id !== user.id) {
    await admin.from("qr_login_requests").update({ status: "failed" }).eq("id", body.id);
    return qrJson({ error: "Could not authorize the desktop. Start a new QR sign-in." }, 503);
  }

  const { error: updateError } = await admin.from("qr_login_requests").update({
    status: "approved",
    token_hash: link.properties.hashed_token,
    approved_at: new Date().toISOString(),
  }).eq("id", body.id).eq("status", "authorizing");
  if (updateError) return qrJson({ error: "Could not complete approval. Start again." }, 503);

  return qrJson({ approved: true });
}
