import { randomUUID } from "node:crypto";
import {
  generateSecret, getQrAdminClient, hashSecret, newVerificationCode,
  qrJson,
} from "@/lib/qr-login";
import { isSameOriginQrRequest, qrSourceHash } from "@/lib/qr-login-security";

export async function POST(request: Request) {
  if (!isSameOriginQrRequest(request)) {
    return qrJson({ error: "Start phone sign-in from this website." }, 403);
  }
  const sourceHash = qrSourceHash(request);
  if (!sourceHash) return qrJson({ error: "Phone sign-in is temporarily unavailable." }, 503);

  const admin = getQrAdminClient();
  if (!admin) return qrJson({ error: "Phone sign-in is not configured yet." }, 503);

  const id = randomUUID();
  const desktopSecret = generateSecret();
  const approvalSecret = generateSecret();
  const verificationCode = newVerificationCode();
  // The budget reservation and insertion happen together in the database;
  // concurrent serverless requests cannot race a separate count and insert.
  const { data, error } = await admin.rpc("create_qr_login_request", {
    p_id: id,
    p_source_hash: sourceHash,
    p_desktop_secret_hash: hashSecret(desktopSecret),
    p_approval_secret_hash: hashSecret(approvalSecret),
    p_verification_code: verificationCode,
  });
  const reservation = data?.[0];
  if (error || !reservation) return qrJson({ error: "Could not start phone sign-in. Check database setup." }, 503);
  if (!reservation.accepted) {
    const retryAfter = Math.max(1, Math.min(3600, Number(reservation.retry_after_seconds) || 60));
    return Response.json({ error: "Too many QR requests. Try again shortly." }, {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
    });
  }
  const expiresAt = reservation.expires_at;

  const approvalUrl = new URL("/scan-login", request.url);
  approvalUrl.hash = new URLSearchParams({ id, secret: approvalSecret }).toString();
  return qrJson({ id, desktopSecret, approvalUrl: approvalUrl.toString(), verificationCode, expiresAt });
}
