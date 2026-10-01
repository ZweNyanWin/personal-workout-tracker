import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const OLLAMA = "http://127.0.0.1:11434";
const MODEL = "workout-coach";
const MODELS = [MODEL, "workout-coach-v2"];

async function trainingState() {
  try {
    const state = JSON.parse(await readFile(resolve(process.cwd(), "ai/training/local-state.json"), "utf8"));
    let busy = state.busy === true;
    if (busy && Number.isInteger(state.pid)) {
      try { process.kill(state.pid, 0); } catch { busy = false; }
    }
    return { busy, stage: busy === state.busy ? String(state.stage ?? "Unknown") : "Interrupted",
      step: Number(state.step) || 0, total: Number(state.total) || 0,
      loss: typeof state.loss === "number" ? state.loss : null,
      validationLoss: typeof state.validationLoss === "number" ? state.validationLoss : null,
      note: String(state.note ?? ""), updatedAt: state.updatedAt,
      evaluation: state.evaluation && typeof state.evaluation.model === "string" ? {
        model: state.evaluation.model, completed: Number(state.evaluation.completed) || 0,
        total: Number(state.evaluation.total) || 0,
      } : null };
  } catch { return { busy: false, stage: "Not started", step: 0, total: 0, note: "" }; }
}

function isLocalDevelopment(request: NextRequest) {
  return process.env.NODE_ENV === "development" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(request.nextUrl.hostname) &&
    /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(request.headers.get("host") ?? "");
}

async function getOllama(path: string) {
  const response = await fetch(`${OLLAMA}${path}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error("Ollama unavailable");
  return response.json();
}

export async function GET(request: NextRequest) {
  if (!isLocalDevelopment(request)) return new Response(null, { status: 404 });
  try {
    const [version, tags, running, training] = await Promise.all([
      getOllama("/api/version"), getOllama("/api/tags"), getOllama("/api/ps"),
      trainingState(),
    ]);
    return Response.json({ online: true, version: version.version, model: MODEL, training,
      available: tags.models.map((model: { name: string; size: number }) => ({ name: model.name, size: model.size })),
      loaded: running.models.map((model: { name: string; size: number; size_vram: number; context_length: number }) =>
        ({ name: model.name, size: model.size, size_vram: model.size_vram, context_length: model.context_length })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ online: false, model: MODEL, training: await trainingState() }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  if (!isLocalDevelopment(request)) return new Response(null, { status: 404 });
  const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (request.headers.get("origin") !== expectedOrigin) {
    return Response.json({ error: "Use the local Ollama tab to send a message." }, { status: 403 });
  }
  let question: unknown;
  let model: unknown = MODEL;
  try {
    const body = await request.text();
    if (body.length > 5000) return Response.json({ error: "Message is too long." }, { status: 400 });
    const parsed = JSON.parse(body);
    question = parsed.question;
    model = parsed.model ?? MODEL;
  } catch {
    return Response.json({ error: "Invalid message." }, { status: 400 });
  }
  if (typeof question !== "string" || !question.trim() || question.length > 2000) {
    return Response.json({ error: "Enter a message of up to 2,000 characters." }, { status: 400 });
  }
  if (typeof model !== "string" || !MODELS.includes(model)) return Response.json({ error: "Choose an available coach model." }, { status: 400 });
  if ((await trainingState()).busy) return Response.json({ error: "A local training or evaluation job is using the GPU. Try again when it finishes." }, { status: 503 });
  try {
    const response = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
      body: JSON.stringify({ model, stream: true, keep_alive: "5m",
        messages: [{ role: "user", content: question.trim() }],
        options: { temperature: 0.2, top_k: 20, top_p: 0.8, repeat_penalty: 1, num_ctx: 8192, num_predict: 2048 },
      }),
    });
    if (!response.ok || !response.body) return Response.json({ error: "Ollama could not start this response." }, { status: 502 });
    return new Response(response.body, { headers: {
      "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "Could not reach local Ollama. Check that it is running." }, { status: 503 });
  }
}
