"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, RefreshCw, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };
type MacStatus = { configured: boolean; online: boolean; busy?: boolean };
type JobResult = { status?: string; answer?: string; error?: string };

const PROMPTS = [
  "Help me plan a four-week block. Ask what you need to know first.",
  "What details should I share after missing target reps?",
  "Explain how to progress from basic to advanced calisthenics.",
];

function requestContext(history: Message[], question: string): Message[] {
  // Keep complete pairs and bound the context even when an answer is very long.
  const recent = history.slice(-10).map((message) => ({ ...message, content: message.content.slice(0, 2000) }));
  while (recent.reduce((total, message) => total + message.content.length, question.length) > 12000) recent.splice(0, 2);
  return [...recent, { role: "user", content: question }];
}

async function responseData(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json(); } catch { return {}; }
}

function responseError(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" ? data.error : fallback;
}

function cancelJob(jobId: string) {
  void fetch(`/api/coach?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE", keepalive: true, cache: "no-store" }).catch(() => {});
}

export function CoachChat({ active }: { active: boolean }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<MacStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const generation = useRef(0);
  const pendingRef = useRef<string | null>(null);
  const jobRef = useRef<string | null>(null);
  const busy = pending !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (jobRef.current) cancelJob(jobRef.current);
      jobRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    async function check() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      setChecking(true);
      try {
        const response = await fetch("/api/coach", { cache: "no-store", signal: controller.signal });
        const data = await responseData(response);
        if (!response.ok) throw new Error(responseError(data, response.status === 401 ? "Sign in again to use your coach." : "Could not check the Mac connection."));
        if (typeof data.configured !== "boolean" || typeof data.online !== "boolean") throw new Error("The coach connection returned an unexpected response.");
        if (!disposed) {
          setStatus({ configured: data.configured, online: data.online, busy: data.busy === true });
          setStatusError("");
        }
      } catch (failure) {
        if (!disposed) {
          setStatus(null);
          setStatusError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "Connection check timed out. Try again.");
        }
      } finally {
        clearTimeout(timeout);
        if (!disposed) {
          setChecking(false);
          timer = setTimeout(check, 15000);
        }
      }
    }
    void check();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, [active, refresh]);

  useEffect(() => {
    if (!busy) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [busy, startedAt]);

  useEffect(() => {
    if (!jobId) return;
    const run = generation.current;
    let disposed = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const isCurrent = () => !disposed && mounted.current && generation.current === run && jobRef.current === jobId;
    function finish(answer?: string, failure?: string) {
      if (!isCurrent()) return;
      const sentQuestion = pendingRef.current;
      jobRef.current = null;
      pendingRef.current = null;
      setPending(null);
      setJobId(null);
      if (answer && sentQuestion) {
        setMessages((current) => [...current, { role: "user", content: sentQuestion }, { role: "assistant", content: answer }]);
        setQuestion("");
        setError("");
      } else setError(failure || "No answer was returned. Your question is kept so you can try again.");
      setRefresh((current) => current + 1);
    }
    async function poll() {
      if (!isCurrent()) return;
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        cancelJob(jobId!);
        finish(undefined, "This request took too long. Your question is kept; try a shorter question or check your Mac.");
        return;
      }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch(`/api/coach?jobId=${encodeURIComponent(jobId!)}`, { cache: "no-store", signal: controller.signal });
        const data = await responseData(response);
        if (!isCurrent()) return;
        if (!response.ok) {
          // A tunnel reconnect can briefly return an HTTP error rather than a
          // fetch exception. Retry the same job; never resubmit its question.
          if ([500, 502, 503, 504].includes(response.status)) throw new Error("Temporary Mac connection failure");
          cancelJob(jobId!);
          finish(undefined, responseError(data, response.status === 401 ? "Sign in again to use your coach. Your question is kept." : "Could not retrieve the answer. Your question is kept."));
          return;
        }
        const result = data as JobResult;
        failures = 0;
        setError("");
        if (result.status === "completed") {
          finish(typeof result.answer === "string" && result.answer.trim() ? result.answer : undefined);
          return;
        }
        if (result.status === "failed") {
          finish(undefined, `${typeof result.error === "string" ? result.error : "The model could not answer. Try a shorter question or check your Mac."} Your question is kept.`);
          return;
        }
        if (result.status !== "queued" && result.status !== "running") {
          cancelJob(jobId!);
          finish(undefined, "The coach returned an unexpected job status. Your question is kept.");
          return;
        }
      } catch {
        if (!isCurrent()) return;
        failures += 1;
        if (failures >= 3) {
          cancelJob(jobId!);
          finish(undefined, "The connection was interrupted. Your question is kept; check your connection and Mac before retrying.");
          return;
        }
        setError("Connection interrupted. Retrying the current request…");
      } finally { clearTimeout(timeout); }
      if (isCurrent()) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, [jobId, startedAt]);

  async function ask() {
    const text = question.trim();
    if (!text || text.length > 2000 || pendingRef.current || !status?.online || status.busy) return;
    const run = ++generation.current;
    pendingRef.current = text;
    setPending(text);
    setStartedAt(Date.now());
    setElapsed(0);
    setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/coach", {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestContext(messages, text) }),
      });
      const data = await responseData(response);
      const acceptedId = typeof data.jobId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.jobId) ? data.jobId : null;
      if (!mounted.current || generation.current !== run) {
        if (acceptedId) cancelJob(acceptedId);
        return;
      }
      if (response.status !== 202 || !acceptedId) throw new Error(responseError(data, "The request could not start. Your question is kept so you can try again."));
      jobRef.current = acceptedId;
      setJobId(acceptedId);
    } catch (failure) {
      if (mounted.current && generation.current === run) {
        pendingRef.current = null;
        setPending(null);
        setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "The request timed out. Your question is kept; check the Mac connection and try again.");
        setRefresh((current) => current + 1);
      }
    } finally { clearTimeout(timeout); }
  }

  function stop() {
    generation.current += 1;
    if (jobRef.current) cancelJob(jobRef.current);
    jobRef.current = null;
    pendingRef.current = null;
    setJobId(null);
    setPending(null);
    setError("Stopped. Your question is kept so you can edit it or try again.");
    setRefresh((current) => current + 1);
  }

  const statusLabel = !status ? checking ? "Checking Mac connection…" : "Connection unavailable" : !status.configured ? "AI connection needs setup" : !status.online ? "Mac offline" : status.busy ? "Mac is busy" : "Ready on your Mac";
  const ready = status?.online === true && !status.busy;

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">Ask your experimental coach</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Real answers from workout-coach running on your Mac.</p></div>
        <Button type="button" size="sm" variant="ghost" aria-label="Refresh Mac connection" disabled={checking || !active} onClick={() => setRefresh((current) => current + 1)}><RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />Check</Button>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs" role="status">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", ready ? "bg-success" : "bg-muted-foreground")} />{statusLabel}
      </div>
      {statusError && <p className="mt-2 text-xs leading-relaxed text-destructive" role="alert">{statusError}</p>}
      {status && !status.online && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Keep your Mac awake and online, with Ollama and the PowerBuild bridge running, then tap Check.</p>}
      {status?.busy && !busy && <p className="mt-2 text-xs text-muted-foreground">Another request is running. Wait a moment and check again.</p>}
      <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">Experimental model. Answers have not been approved as personalized training recommendations. This model can give incorrect effort targets; review its suggestions. Share your actual experience, equipment, and recent sets; saved workouts and reference files are not connected.</p>
      <details className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Check RPE against this reference</summary>
        <p className="mt-3 leading-relaxed text-muted-foreground">For resistance training, the RIR-based RPE scale estimates how many more clean reps you could complete at the end of a set.</p>
        <table className="mt-2 w-full text-left text-xs">
          <caption className="sr-only">Resistance training RPE and estimated repetitions in reserve</caption>
          <thead><tr className="border-b border-border"><th scope="col" className="py-2 font-medium">RPE</th><th scope="col" className="py-2 font-medium">Reps left (RIR)</th></tr></thead>
          <tbody>{[[10, "0"], [9, "About 1"], [8, "About 2"], [7, "About 3"]].map(([rpe, rir]) => <tr key={rpe} className="border-b border-border last:border-0"><th scope="row" className="py-1.5 font-normal">{rpe}</th><td className="py-1.5">{rir}</td></tr>)}</tbody>
        </table>
        <p className="mt-2 leading-relaxed text-muted-foreground">RIR is an estimate. RPE is not a percentage of your one-rep max: RPE 8 does not mean 80% of 1RM.</p>
        <p className="mt-2 leading-relaxed text-muted-foreground">References: <a href="https://pubmed.ncbi.nlm.nih.gov/26049792/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Zourdos et al. study</a> · <a href="https://store.reactivetrainingsystems.com/blogs/rts-basics/beginning-rts" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">RTS coaching guide</a></p>
      </details>
      {messages.length === 0 && !busy && <div className="my-5 space-y-2">{PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left text-sm transition-colors hover:bg-accent">{prompt}<ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div>}
      <div className="my-5 space-y-4" role="log" aria-label="Coach conversation" aria-live="polite" aria-relevant="additions">
        {messages.map((message, index) => <div key={index} className={cn("min-w-0 whitespace-pre-wrap break-words rounded-xl p-4 text-sm leading-relaxed [overflow-wrap:anywhere]", message.role === "user" ? "ml-4 bg-secondary" : "bg-muted/60")}><p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">{message.role === "user" ? "You" : "Coach · experimental AI"}</p>{message.content}</div>)}
        {pending && <div className="ml-4 whitespace-pre-wrap break-words rounded-xl bg-secondary p-4 text-sm leading-relaxed [overflow-wrap:anywhere]"><p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">You</p>{pending}</div>}
      </div>
      {busy && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border p-3"><p className="flex items-center gap-2 text-xs" role="status"><LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />{jobId ? "Generating" : "Sending"}<span aria-hidden="true">· {elapsed}s</span></p><Button type="button" variant="outline" size="sm" onClick={stop}><Square className="h-3 w-3" />Stop</Button></div>}
      {busy && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Your Mac can take up to 2½ minutes to answer before the model request times out. Keep it awake; try shorter questions for faster replies.</p>}
      {error && <p className="mb-3 text-xs leading-relaxed text-destructive" role="alert">{error}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="space-y-2">
        <Label htmlFor="coach-question">Your training question</Label>
        <textarea id="coach-question" placeholder="Ask about your training…" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} disabled={busy} className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm" />
        <div className="flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">{question.length}/2000</p><Button type="submit" disabled={!question.trim() || !ready || busy}><Send className="h-4 w-4" />{error && !busy ? "Try again" : "Send"}</Button></div>
      </form>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Recent messages are sent to your Mac. This conversation stays in this page&apos;s memory and clears when you leave or reload. No workouts are changed.</p>
    </div>
  );
}
