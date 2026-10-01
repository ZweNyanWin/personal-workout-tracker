import { z } from "zod";
import { withDeadline } from "../async/deadline.ts";
import { COACH_AUTH_TIMEOUT_MS, COACH_GATEWAY_TIMEOUT_MS } from "./timeouts.ts";

const uuid = z.string().uuid();
const message = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
}).strict();

export const coachRequestSchema = z.object({
  messages: z.array(message).min(1).max(12),
}).strict().superRefine(({ messages }, ctx) => {
  if (messages.reduce((sum, item) => sum + item.content.length, 0) > 12000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Conversation is too long" });
  }
  if (messages.some((item, index) => item.role !== (index % 2 ? "assistant" : "user")) || messages.at(-1)?.role !== "user") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Send complete user/assistant pairs followed by your question" });
  }
});

type RelayConfig = { url?: string; token?: string; appUrl?: string; development?: boolean };
type Dependencies = {
  authenticate: (request: Request, signal: AbortSignal) => Promise<{ id: string } | null>;
  config: () => RelayConfig;
  fetch?: typeof fetch;
  authTimeoutMs?: number;
};

export function validGatewayConfig(config: RelayConfig): { origin: string; token: string } | null {
  if (!config.url || !config.token || !/^[A-Za-z0-9_-]{43}$/.test(config.token)) return null;
  try {
    const url = new URL(config.url);
    if (url.protocol !== "https:" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { origin: url.origin, token: config.token };
  } catch { return null; }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

function sameOrigin(request: Request, config: RelayConfig) {
  const supplied = request.headers.get("origin");
  if (!supplied) return false;
  try {
    const expected = new URL(config.appUrl ?? request.url).origin;
    if (supplied === expected) return true;
    const local = new URL(request.url);
    return config.development === true && ["127.0.0.1", "localhost", "[::1]"].includes(local.hostname) && supplied === local.origin;
  } catch { return false; }
}

async function boundedJson(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new Error("Empty body");
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new RangeError("Body too large"); }
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

const acceptedJob = z.object({ jobId: uuid, status: z.enum(["queued", "running"]) });
const jobResponse = z.object({
  jobId: uuid,
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  answer: z.string().max(20000).optional(),
  error: z.string().max(300).optional(),
});

/** Stateless app relay. Authentication and job ownership are checked on every request. */
export function createCoachHandler(dependencies: Dependencies) {
  const network = dependencies.fetch ?? fetch;
  return async function handle(request: Request): Promise<Response> {
    if (!["GET", "POST", "DELETE"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
    let user: { id: string } | null;
    try {
      user = await withDeadline((signal) => dependencies.authenticate(request, signal), dependencies.authTimeoutMs ?? COACH_AUTH_TIMEOUT_MS, request.signal);
    } catch {
      return json({ error: "Sign-in verification is temporarily unavailable. Tap Check to retry; your Mac may still be online." }, 503);
    }
    if (!user) return json({ error: "Sign in to PowerBuild to use the coach." }, 401);
    if (!uuid.safeParse(user.id).success) return json({ error: "This account cannot use the coach." }, 403);
    const config = dependencies.config();
    if (request.method !== "GET" && !sameOrigin(request, config)) return json({ error: "Send requests from PowerBuild." }, 403);
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== "jobId") || url.searchParams.getAll("jobId").length > 1) {
      return json({ error: "Invalid request" }, 400);
    }
    const jobId = url.searchParams.get("jobId");
    if ((jobId !== null && !uuid.safeParse(jobId).success) || (request.method === "DELETE" && !jobId) || (request.method === "POST" && jobId)) {
      return json({ error: "Invalid request" }, 400);
    }
    let messages: z.infer<typeof coachRequestSchema>["messages"] | undefined;
    if (request.method === "POST") {
      if (request.headers.get("content-type")?.split(";", 1)[0].toLowerCase() !== "application/json") return json({ error: "Send a JSON conversation." }, 415);
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (!Number.isFinite(contentLength) || contentLength > 65000) return json({ error: "Conversation is too long." }, 413);
      try {
        const parsed = coachRequestSchema.safeParse(await boundedJson(request.body, 65000));
        if (!parsed.success) return json({ error: "Send a question of up to 2,000 characters with a short conversation history." }, 400);
        messages = parsed.data.messages;
      } catch (error) {
        return json({ error: error instanceof RangeError ? "Conversation is too long." : "Invalid JSON conversation." }, error instanceof RangeError ? 413 : 400);
      }
    }
    const gateway = validGatewayConfig(config);
    if (!gateway) {
      if (request.method === "GET" && !jobId) return json({ configured: false, online: false, busy: false, experimental: true, model: "workout-coach" });
      return json({ error: "The Mac connector has not been configured yet." }, 503);
    }
    const path = jobId ? `/v1/jobs/${jobId}?userId=${encodeURIComponent(user.id)}` : request.method === "POST" ? "/v1/jobs" : "/v1/status";
    try {
      const upstream = await network(gateway.origin + path, {
        method: request.method, redirect: "error", cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(COACH_GATEWAY_TIMEOUT_MS)]),
        headers: { Authorization: `Bearer ${gateway.token}`, ...(messages ? { "Content-Type": "application/json" } : {}) },
        ...(messages ? { body: JSON.stringify({ userId: user.id, messages }) } : {}),
      });
      if (!upstream.ok) {
        if (request.method === "GET" && !jobId) return json({ configured: true, online: false, busy: false, experimental: true, model: "workout-coach" });
        if (upstream.status === 409) return json({ error: "Your Mac is handling another AI request. Try again shortly." }, 409);
        if (upstream.status === 429) return json({ error: "Too many AI requests. Please wait before trying again." }, 429);
        if (upstream.status === 404 && jobId) return json({ error: "This conversation request expired or is unavailable. Send the question again." }, 404);
        return json({ error: "The Mac connector is unavailable. Keep the Mac awake and restart its connector if needed." }, 503);
      }
      const value: unknown = await boundedJson(upstream.body, 100000);
      if (!jobId && request.method === "GET") {
        const status = z.object({ online: z.boolean(), busy: z.boolean(), model: z.literal("workout-coach"), experimental: z.literal(true) }).parse(value);
        return json({ configured: true, ...status });
      }
      if (request.method === "POST") {
        const job = acceptedJob.parse(value);
        return json({ jobId: job.jobId, status: job.status }, 202);
      }
      const job = jobResponse.parse(value);
      if (job.jobId !== jobId || (job.status === "completed" && !job.answer?.trim())) throw new Error("Invalid job response");
      return json({ jobId: job.jobId, status: job.status, ...(job.status === "completed" ? { answer: job.answer } : {}),
        ...(job.status === "failed" ? { error: "The model could not complete this answer. Try a shorter question or check the Mac." } : {}) });
    } catch {
      if (request.method === "GET" && !jobId) return json({ configured: true, online: false, busy: false, experimental: true, model: "workout-coach" });
      return json({ error: "Could not reach your Mac. Keep it awake, online, and running the PowerBuild connector." }, 503);
    }
  };
}
