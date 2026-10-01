import { createHash, randomBytes, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const QR_LOGIN_TTL_MS = 5 * 60_000;

export function generateSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function validQrCredentials(id: unknown, secret: unknown): id is string {
  return typeof id === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    && typeof secret === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(secret);
}

export function getQrAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function qrJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function newVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
