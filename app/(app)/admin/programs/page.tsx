"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getAllPrograms, createProgram, createBlock, createSession, updateSession, deleteSession, deleteBlock, deleteProgram, importProgramTemplate, createStarterTemplates } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  Layers,
  FolderPlus,
  CalendarPlus,
  Trash2,
  ClipboardPaste,
} from "lucide-react";

// ─── Session row with edit + delete ──────────────────────────
function SessionRow({ session: s, onDone }: { session: any; onDone: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(s.title);
  const [editNotes, setEditNotes] = useState(s.notes ?? "");
  const [saving, startSave] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  function handleSave() {
    if (!editTitle.trim()) { toast.error("Name required"); return; }
    startSave(async () => {
      const r = await updateSession(s.id, editTitle, editNotes);
      if (r.success) { toast.success("Session updated"); setEditOpen(false); onDone(); }
      else toast.error(r.error);
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const r = await deleteSession(s.id);
      if (r.success) { toast.success("Session deleted"); onDone(); }
      else toast.error(r.error);
    });
  }

  return (
    <>
      <div className="flex items-center gap-3 px-6 py-2.5 hover:bg-accent/20 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{s.title}</p>
          <p className="text-xs text-muted-foreground">
            {s.exercises?.length ?? 0} exercises
            {s.notes ? ` · ${s.notes}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/workout/${s.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
              <Pencil className="h-3 w-3" />
              {s.exercises?.length ? "Edit" : "Add Exercises"}
            </Button>
          </Link>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => { setEditTitle(s.title); setEditNotes(s.notes ?? ""); setEditOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="destructive" className="h-7 text-xs" loading={deleting} onClick={handleDelete}>Confirm</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Session</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Session Name *</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button variant="brand" className="flex-1" loading={saving} onClick={handleSave}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Small inline dialogs ─────────────────────────────────────

function AddBlockDialog({
  programId,
  onDone,
}: {
  programId: string;
  onDone: () => void;
}) {
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
              <Input placeholder="e.g. Week 1 - Hypertrophy" value={title} onChange={(e) => setTitle(e.target.value)} />
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

function AddSessionDialog({
  programId,
  blockId,
  onDone,
}: {
  programId: string;
  blockId: string;
  onDone: () => void;
}) {
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
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1.5">
            {SESSION_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTitle(p)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors tap-none ${
                  title === p
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {p}
              </button>
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
            <Button variant="outline" className="flex-1" loading={saving} onClick={() => handle(false)}>
              Add
            </Button>
            <Button variant="brand" className="flex-1" loading={saving} onClick={() => handle(true)}>
              Add & Edit Exercises
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportTemplateDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [addStrengthSingles, setAddStrengthSingles] = useState(false);
  const [exposurePercent, setExposurePercent] = useState("82.5");
  const [importing, startImport] = useTransition();

  const placeholder = `Hypertrophy (Weeks 1-4)
Focus: Hypertrophy, technique, recovering from heavy singles.

WEEK 1 (hypertrophy week - should feel good)
Day 1 - Upper A
1. Bench: 3x5 @ 100 kg (leave 1-2 reps in tank)
2. Weighted Pull-ups: 4x6 @ +35 lb (leave 1-2 reps in tank)

WEEK 2 (small step up)
* Upper A: Bench: 3x5 @ 102.5 kg | Weighted Pull-ups: 4x6 @ +40 lb | Accessories: last set failure

For strength templates:
1. Bench single: 1x1 @ 82.5% (strength exposure)
2. Bench backdown: 4x4 @ 75%`;

  function handleImport() {
    if (!rawText.trim()) {
      toast.error("Paste a template first");
      return;
    }

    const percent = exposurePercent ? parseFloat(exposurePercent) : 82.5;
    startImport(async () => {
      const result = await importProgramTemplate({
        title: title.trim() || undefined,
        rawText,
        addStrengthExposureSingles: addStrengthSingles,
        strengthExposurePercent: Number.isFinite(percent) ? percent : 82.5,
      });

      if (result.success) {
        toast.success("Template imported");
        setOpen(false);
        setTitle("");
        setRawText("");
        setAddStrengthSingles(false);
        setExposurePercent("82.5");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ClipboardPaste className="h-4 w-4" />
          Paste Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Template Title</Label>
            <Input
              placeholder="Optional - inferred from pasted text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Program Text *</Label>
            <Textarea
              placeholder={placeholder}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={16}
              className="font-mono text-xs"
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Strength exposure singles</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Adds 1x1 bench/squat placeholders before backdowns.
                </p>
              </div>
              <Switch checked={addStrengthSingles} onCheckedChange={setAddStrengthSingles} />
            </div>
            {addStrengthSingles && (
              <div className="space-y-1.5">
                <Label>Single percent</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  max="100"
                  value={exposurePercent}
                  onChange={(e) => setExposurePercent(e.target.value)}
                />
              </div>
            )}
          </div>

          <Button className="w-full" variant="brand" loading={importing} onClick={handleImport}>
            Import Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, startSave] = useTransition();
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [confirmDeleteBlock, setConfirmDeleteBlock] = useState<string | null>(null);
  const [deletingBlock, startDeleteBlock] = useTransition();
  const [confirmDeleteProgram, setConfirmDeleteProgram] = useState<string | null>(null);
  const [deletingProgram, startDeleteProgram] = useTransition();
  const [creatingStarter, startCreateStarter] = useTransition();

  function reload() {
    getAllPrograms().then((data) => {
      setPrograms(data);
    });
  }

  useEffect(() => {
    getAllPrograms().then((data) => {
      setPrograms(data);
      // Auto-expand all blocks initially
      const all = new Set<string>();
      data.forEach((p: any) => p.blocks?.forEach((b: any) => all.add(b.id)));
      setExpandedBlocks(all);
    });
  }, []);

  function toggleBlock(blockId: string) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }

  function handleCreate() {
    if (!title.trim()) { toast.error("Title required"); return; }
    startSave(async () => {
      const result = await createProgram(title.trim(), description.trim());
      if (result.success) {
        toast.success("Program created");
        setNewProgramOpen(false);
        setTitle(""); setDescription("");
        reload();
      } else toast.error(result.error);
    });
  }

  function handleCreateStarterTemplates() {
    startCreateStarter(async () => {
      const result = await createStarterTemplates();
      if (result.success) {
        const { created, skipped } = result.data;
        toast.success(
          created > 0
            ? `Created ${created} starter template${created === 1 ? "" : "s"}`
            : "Starter templates already exist"
        );
        if (skipped > 0) {
          toast.message(`${skipped} existing template${skipped === 1 ? "" : "s"} skipped`);
        }
        reload();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur-sm">
        <h1 className="text-base font-semibold">Programs & Templates</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" loading={creatingStarter} onClick={handleCreateStarterTemplates}>
            <BookOpen className="h-4 w-4" />
            Starter Templates
          </Button>
          <ImportTemplateDialog onDone={reload} />
          <Dialog open={newProgramOpen} onOpenChange={setNewProgramOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="brand"><Plus className="h-4 w-4" />New Program</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Create Program</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input placeholder="e.g. 16-Week Peak Block" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea placeholder="Brief description…" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
                <Button className="w-full" loading={saving} onClick={handleCreate}>Create Program</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-4">
        {programs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No programs yet.</p>
          </div>
        ) : (
          programs.map((program: any) => (
            <div key={program.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Program header */}
              <div className="p-4 border-b border-border flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{program.title}</h3>
                    {program.is_template && <Badge variant="brand" className="text-[10px]">Template</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {program.blocks?.length ?? 0} blocks · {program.blocks?.reduce((n: number, b: any) => n + (b.sessions?.length ?? 0), 0)} sessions
                    </span>
                  </div>
                  {program.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{program.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AddBlockDialog programId={program.id} onDone={reload} />
                  {confirmDeleteProgram === program.id ? (
                    <>
                      <Button size="sm" variant="destructive" className="h-8 text-xs" loading={deletingProgram}
                        onClick={() => startDeleteProgram(async () => {
                          const r = await deleteProgram(program.id);
                          if (r.success) { toast.success("Program deleted"); setConfirmDeleteProgram(null); reload(); }
                          else toast.error(r.error);
                        })}>Confirm</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirmDeleteProgram(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDeleteProgram(program.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* No blocks state */}
              {(!program.blocks || program.blocks.length === 0) && (
                <div className="p-6 text-center">
                  <Layers className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No blocks yet.</p>
                  <p className="text-xs text-muted-foreground">Click "Add Block" above to create a training week.</p>
                </div>
              )}

              {/* Blocks */}
              {program.blocks?.map((block: any) => {
                const isExpanded = expandedBlocks.has(block.id);
                return (
                  <div key={block.id} className="border-t border-border">
                    {/* Block header row */}
                    <div className="flex items-center gap-0 bg-accent/30">
                      <button
                        type="button"
                        onClick={() => toggleBlock(block.id)}
                        className="flex-1 flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors tap-none text-left"
                      >
                        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{block.title}</span>
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
                      {/* Add session + delete block buttons */}
                      <div className="flex items-center gap-1 px-3">
                        <AddSessionDialog programId={program.id} blockId={block.id} onDone={reload} />
                        {confirmDeleteBlock === block.id ? (
                          <>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" loading={deletingBlock}
                              onClick={() => startDeleteBlock(async () => {
                                const r = await deleteBlock(block.id);
                                if (r.success) { toast.success("Block deleted"); setConfirmDeleteBlock(null); reload(); }
                                else toast.error(r.error);
                              })}>Confirm</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDeleteBlock(null)}>Cancel</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDeleteBlock(block.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Sessions */}
                    {isExpanded && (
                      <div className="divide-y divide-border">
                        {(!block.sessions || block.sessions.length === 0) && (
                          <div className="px-6 py-3 text-center">
                            <p className="text-xs text-muted-foreground">
                              No sessions yet — click "Add Session" to add one.
                            </p>
                          </div>
                        )}
                        {block.sessions?.map((s: any) => (
                          <SessionRow key={s.id} session={s} onDone={reload} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
