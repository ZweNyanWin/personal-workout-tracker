import { createClient } from "@/lib/supabase/server";
import { getQrAdminClient, hashSecret, qrJson, validQrCredentials } from "@/lib/qr-login";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return qrJson({ error: "Sign in on your phone, then scan again." }, 401);

  const body = await request.json().catch(() => null);
  if (!validQrCredentials(body?.id, body?.approvalSecret)) {
    return qrJson({ error: "Invalid QR code." }, 400);
  }
  const admin = getQrAdminClient();
  if (!admin) return qrJson({ error: "Phone sign-in is not configured yet." }, 503);

  const { data } = await admin.from("qr_login_requests")
    .select("verification_code, expires_at")
    .eq("id", body.id)
    .eq("approval_secret_hash", hashSecret(body.approvalSecret))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return qrJson({ error: "This QR code expired or was already used." }, 410);

  return qrJson({ verificationCode: data.verification_code, expiresAt: data.expires_at });
}
