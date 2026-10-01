"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Cpu, Send, Square, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface Status {
  online: boolean;
  version?: string;
  model: string;
  available?: { name: string; size: number }[];
  loaded?: { name: string; size: number; size_vram: number; context_length: number }[];
  training?: { busy: boolean; stage: string; step: number; total: number; loss?: number | null; validationLoss?: number | null; note: string; updatedAt?: string; evaluation?: { model: string; completed: number; total: number } | null };
}

export function OllamaLive() {
  const [status, setStatus] = useState<Status | null>(null);
  const [question, setQuestion] = useState("My plan includes a 130 kg bench attempt, but I haven't performed it. What can you conclude?");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("workout-coach");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{ seconds: number; tokens: number; truncated: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/local-ollama");
        if (!response.ok) throw new Error("Status unavailable");
        const next = await response.json();
        if (active) setStatus(next);
      } catch {
        if (active) setStatus({ online: false, model: "workout-coach" });
      }
    }
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(interval); controller.current?.abort(); };
  }, []);

  async function send() {
    if (running || status?.training?.busy || !question.trim()) return;
    setRunning(true); setAnswer(""); setError(""); setStats(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch("/api/local-ollama", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, model }), signal: abort.signal });
      if (!response.ok) throw new Error((await response.json()).error || "Request failed");
      if (!response.body) throw new Error("No response stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let finished = false;
      function handle(line: string) {
        if (!line.trim()) return;
        const chunk = JSON.parse(line);
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.message?.content) setAnswer((current) => current + chunk.message.content);
        if (chunk.done) {
          finished = true;
          setStats({ seconds: chunk.total_duration / 1e9, tokens: chunk.eval_count, truncated: chunk.done_reason === "length" });
        }
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        lines.forEach(handle);
      }
      pending += decoder.decode();
      handle(pending);
      if (!finished) throw new Error("The response stream ended early. Try again.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") setError("Generation stopped.");
      else setError(err instanceof Error ? err.message : "Request failed");
    } finally { setRunning(false); controller.current = null; }
  }

  const loaded = status?.loaded?.find((entry) => entry.name === `${model}:latest`);
  const training = status?.training;
  const candidateAvailable = status?.available?.some((entry) => entry.name === "workout-coach-v2:latest");
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-12 space-y-6">
      <header className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3"><Terminal className="h-6 w-6 text-primary" /></div><div><h1 className="text-2xl font-bold">Ollama, live on your Mac</h1><p className="mt-1 text-sm text-muted-foreground">Watch your workout coach generate a response.</p></div></div><ThemeToggle /></header>
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${status?.online ? "bg-success" : "bg-warning"}`} />{status === null ? "Checking Ollama…" : status.online ? "Ollama is running" : "Ollama is unreachable"}</p><span className="text-xs text-muted-foreground">{status?.version ? `v${status.version}` : "Local only"}</span></div>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-3"><label htmlFor="coach-model" className="text-xs text-muted-foreground">Model</label><select id="coach-model" className="mt-1 block w-full bg-transparent text-sm font-semibold" value={model} disabled={running || training?.busy} onChange={(event) => setModel(event.target.value)}><option value="workout-coach">Original coach · unvalidated</option>{candidateAvailable && <option value="workout-coach-v2">Fine-tuned v2 · experimental</option>}</select></div><div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Generation</p><p className="mt-1 text-sm font-semibold">{training?.busy ? "GPU reserved for a local job" : running ? "Generating tokens…" : loaded ? "Loaded · ready" : "Loads on request"}</p></div></div>
        {loaded && <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><Cpu className="h-4 w-4" /><span>{(loaded.size / 1e9).toFixed(1)} GB loaded</span><span>{loaded.size > 0 ? Math.round(loaded.size_vram / loaded.size * 100) : 0}% on GPU</span><span>{loaded.context_length.toLocaleString()} context tokens</span></p>}
        <p className="text-xs text-muted-foreground">Responses run locally on this Mac. This tab sends only your message to the selected model; it does not fetch workout history or reference files.</p>
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-muted-foreground">Experimental coach: the first trained candidates failed important answer checks, including repetition and factual errors. They are available for inspection and are not connected to your saved training.</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3" aria-live="polite"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Local model training</h2><span className="text-sm text-primary">{training?.stage ?? "Checking…"}</span></div>{Boolean(training?.total) && <><progress className="h-2 w-full accent-primary" value={training?.step ?? 0} max={training?.total} /><p className="text-xs text-muted-foreground">{training?.step} / {training?.total} training steps</p></>}{(training?.loss != null || training?.validationLoss != null) && <p className="text-xs text-muted-foreground">{training?.loss != null && `Training loss ${training.loss.toFixed(3)}`}{training?.validationLoss != null && ` · Validation loss ${training.validationLoss.toFixed(3)}`}</p>}<p className="text-sm text-muted-foreground">{training?.note || "The original model is preserved. Training creates a separate candidate for evaluation."}</p>{training?.evaluation && <div className="space-y-2"><progress className="h-2 w-full accent-primary" value={training.evaluation.completed} max={training.evaluation.total} /><p className="text-xs text-muted-foreground">{training.evaluation.completed} / {training.evaluation.total} held-out cases · {training.evaluation.model}</p></div>}<p className="text-xs text-muted-foreground">Loss measures prediction fit; it does not establish answer quality. Held-out coaching tests determine whether a candidate improves.</p></section>
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="space-y-3"><label htmlFor="ollama-question" className="text-sm font-semibold">Try your model</label><Input id="ollama-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} disabled={running} /><div className="flex gap-2"><Button type="submit" disabled={running || training?.busy || !status?.online || !question.trim()}><Send className="h-4 w-4" />Run on Ollama</Button>{running && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}><Square className="h-3.5 w-3.5" />Stop</Button>}</div></form>
        {(answer || running) && <div className="rounded-xl bg-muted p-4"><p className="mb-3 text-xs font-semibold text-primary">{model} {running ? "· generating live" : "· response"}</p><div className="text-sm leading-relaxed whitespace-pre-wrap break-words" role="log" aria-live="polite">{answer || "Loading the model…"}</div></div>}
        {stats && <p className="text-xs text-muted-foreground">{stats.tokens} generated tokens in {stats.seconds.toFixed(1)} seconds{stats.truncated ? " · token limit reached; answer may be incomplete" : " · finished"}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
      <Button asChild variant="outline"><Link href="/preview/coach">See the Coach layout<ArrowRight className="h-4 w-4" /></Link></Button>
    </main>
  );
}
