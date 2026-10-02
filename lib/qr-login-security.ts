import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type QrEnvironment = Record<string, string | undefined>;

// Browser checks reduce unwanted cross-site creation; the database budget is
// still required because a non-browser caller can forge Origin headers.
export function isSameOriginQrRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin")) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin
      && new URL(origin).pathname === "/"
      && !new URL(origin).search
      && !new URL(origin).hash
      && !new URL(origin).username
      && !new URL(origin).password;
  } catch {
    return false;
  }
}

export function qrSourceHash(request: Request, environment: QrEnvironment = process.env) {
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  let source: string;
  if (environment.VERCEL === "1") {
    // Vercel's edge supplies this header. Never fall back to caller-supplied
    // X-Forwarded-For, X-Real-IP, cookies, or a body field.
    // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
    const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
    const version = ip ? isIP(ip) : 0;
    if (!ip || !version || ip.includes("%")) return null;
    source = version === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
  } else if (environment.NODE_ENV === "development" || environment.NODE_ENV === "test") {
    // All local callers share a bucket. Spoofing an IP header cannot create
    // extra local buckets. A future hosting provider needs a trusted adapter.
    source = "local-development";
  } else {
    return null;
  }

  return createHmac("sha256", key)
    .update(`powerbuild:qr-login:source:v1\0${source}`)
    .digest("hex");
}
