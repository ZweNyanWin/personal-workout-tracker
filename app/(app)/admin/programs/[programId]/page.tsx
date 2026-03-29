"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getProgramDetail, createBlock, createSession } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Layers,
  FolderPlus,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";

export default function ProgramDetailPage() {
  const { programId } = useParams<{ programId: string }>();
  const router = useRouter();
  const [program, setProgram] = useState<any>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  function reload() {
    getProgramDetail(programId).then((data) => {
      if (!data) return;
      setProgram(data);
      const all = new Set<string>();
      data.blocks?.forEach((b: any) => all.add(b.id));
      setExpandedBlocks(all);
    });
  }

  useEffect(() => { reload(); }, [programId]);

  function toggleBlock(blockId: string) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  if (!program) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm animate-pulse">Loading program…</p>
      </div>
    );
  }

  const totalSessions = program.blocks?.reduce((n: number, b: any) => n + (b.sessions?.length ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-14 items-center gap-3 px-4 border-b border-border bg-background/95 backdrop-blur-sm">
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors tap-none"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{program.title}</h1>
          <p className="text-xs text-muted-foreground">
            {program.blocks?.length ?? 0} blocks · {totalSessions} sessions
          </p>
        </div>
        <AddBlockDialog programId={programId} onDone={reload} />
      </div>

      {program.description && (
        <div className="px-4 py-2.5 border-b border-border bg-accent/20">
          <p className="text-sm text-muted-foreground">{program.description}</p>
        </div>
      )}

      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-3">
        {(!program.blocks || program.blocks.length === 0) && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No blocks yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Block" to create a training week/phase.</p>
          </div>
        )}

        {program.blocks?.map((block: any) => {
          const isExpanded = expandedBlocks.has(block.id);
          return (
            <div key={block.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Block header */}
              <div className="flex items-center bg-accent/30">
                <button
                  type="button"
                  onClick={() => toggleBlock(block.id)}
                  className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors tap-none text-left"
                >
                  <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{block.title}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {block.sessions?.length ?? 0} sessions
                      {block.duration_weeks ? ` · ${block.duration_weeks}w` : ""}
                    </span>
                  </div>
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                </button>
                <div className="px-3">
                  <AddSessionDialog programId={programId} blockId={block.id} onDone={reload} />
                </div>
              </div>

              {/* Sessions */}
              {isExpanded && (
                <div className="divide-y divide-border">
                  {(!block.sessions || block.sessions.length === 0) && (
                    <div className="px-6 py-4 text-center">
                      <p className="text-xs text-muted-foreground">No sessions yet — click "Add Session".</p>
                    </div>
                  )}
                  {block.sessions?.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.exercises?.length ?? 0} exercises
                          {s.notes ? ` · ${s.notes}` : ""}
                        </p>
                      </div>
                      <Link href={`/workout/${s.id}`}>
                        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                          <Pencil className="h-3 w-3" />
                          {s.exercises?.length ? "Edit" : "Add Exercises"}
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add Block Dialog ─────────────────────────────────────────
function AddBlockDialog({ programId, onDone }: { programId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [weeks, setWeeks] = useState("");
  const [saving, startSave] = useTransition();

  function handle() {
    if (!title.trim()) { toast.error("Block name required"); return; }
    startSave(async () => {
      const r = await createBlock(programId, title.trim(), weeks ? parseInt(weeks) : undefined);
      if (r.success) {
        toast.success("Block added");
        setOpen(false); setTitle(""); setWeeks("");
        onDone();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FolderPlus className="h-3.5 w-3.5" />
          Add Block
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Block</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Block Name *</Label>
            <Input placeholder="e.g. Week 1 – Accumulation" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (weeks)</Label>
            <Input type="number" placeholder="e.g. 1" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </div>
          <Button className="w-full" loading={saving} onClick={handle}>Add Block</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Session Dialog ───────────────────────────────────────
function AddSessionDialog({ programId, blockId, onDone }: { programId: string; blockId: string; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, startSave] = useTransition();

  const SESSION_PRESETS = ["Upper A", "Lower A", "Upper B", "Lower B", "Full Body", "Bench Day", "Squat Day", "Deadlift Day"];

  function handle(goToSession = false) {
    if (!title.trim()) { toast.error("Session name required"); return; }
    startSave(async () => {
      const r = await createSession(programId, blockId, title.trim(), notes.trim() || undefined);
      if (r.success) {
        toast.success("Session added");
        setOpen(false); setTitle(""); setNotes("");
        onDone();
        if (goToSession) router.push(`/workout/${r.data}`);
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground">
          <CalendarPlus className="h-3.5 w-3.5" />
          Add Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Session</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="flex flex-wrap gap-1.5">
            {SESSION_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setTitle(p)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors tap-none ${
                  title === p ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >{p}</button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Session Name *</Label>
            <Input placeholder="e.g. Upper A" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional session notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" loading={saving} onClick={() => handle(false)}>Add</Button>
            <Button variant="brand" className="flex-1" loading={saving} onClick={() => handle(true)}>Add & Edit Exercises</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
