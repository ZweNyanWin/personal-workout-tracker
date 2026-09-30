import { randomUUID } from "node:crypto";
import {
  generateSecret, getQrAdminClient, hashSecret, newVerificationCode,
  qrJson, QR_LOGIN_TTL_MS,
} from "@/lib/qr-login";

export async function POST(request: Request) {
  const admin = getQrAdminClient();
  if (!admin) return qrJson({ error: "Phone sign-in is not configured yet." }, 503);

  // The endpoint is public; cap request creation for this small private tracker.
  const { count, error: countError } = await admin.from("qr_login_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if (countError) return qrJson({ error: "Phone sign-in database is not ready." }, 503);
  if ((count ?? 0) >= 50) return qrJson({ error: "Too many QR requests. Try again shortly." }, 429);

  const id = randomUUID();
  const desktopSecret = generateSecret();
  const approvalSecret = generateSecret();
  const verificationCode = newVerificationCode();
  const expiresAt = new Date(Date.now() + QR_LOGIN_TTL_MS).toISOString();

  const { error } = await admin.from("qr_login_requests").insert({
    id,
    desktop_secret_hash: hashSecret(desktopSecret),
    approval_secret_hash: hashSecret(approvalSecret),
    verification_code: verificationCode,
    expires_at: expiresAt,
  });
  if (error) return qrJson({ error: "Could not start phone sign-in. Check database setup." }, 503);

  const approvalUrl = new URL("/scan-login", request.url);
  approvalUrl.hash = new URLSearchParams({ id, secret: approvalSecret }).toString();
  return qrJson({ id, desktopSecret, approvalUrl: approvalUrl.toString(), verificationCode, expiresAt });
}
