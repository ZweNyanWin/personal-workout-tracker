import { validGatewayConfig } from "./relay";
import { COACH_GATEWAY_TIMEOUT_MS } from "./timeouts";

export function gatewayConfiguration() {
  return { url: process.env.COACH_GATEWAY_URL, token: process.env.COACH_GATEWAY_TOKEN,
    appUrl: process.env.NEXT_PUBLIC_APP_URL, development: process.env.NODE_ENV === "development" };
}

export function mutationFromApp(request: Request) {
  const config = gatewayConfiguration();
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  return origin === new URL(config.appUrl || request.url).origin || (config.development
    && ["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname) && origin === requestUrl.origin);
}

export async function gatewayCall(path: string, method = "GET", body?: unknown, signal?: AbortSignal, responseLimit = 256 * 1024) {
  const config = validGatewayConfig(gatewayConfiguration());
  if (!config) throw new Error("The Mac connector has not been configured yet.");
  const response = await fetch(config.origin + path, { method, redirect: "error", cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(COACH_GATEWAY_TIMEOUT_MS)]) : AbortSignal.timeout(COACH_GATEWAY_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${config.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    if (response.status === 409) throw new Error("Your Mac is busy with another request or model training. Try again shortly.");
    if (response.status === 429) throw new Error("Too many requests. Please wait before trying again.");
    if (response.status === 404) throw new Error("This request expired. Your saved draft is kept; generate again.");
    throw new Error("Could not reach Tommy. Keep your Mac awake and its connector running.");
  }
  if (!response.body) throw new Error("Empty Mac response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > responseLimit) { await reader.cancel(); throw new Error("Mac response was too large."); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

export function coachJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function readCoachInput(request: Request, limit: number) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > limit) throw new RangeError("The brief is too long.");
  if (!request.body) throw new SyntaxError("Empty brief.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RangeError("The brief is too long."); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
