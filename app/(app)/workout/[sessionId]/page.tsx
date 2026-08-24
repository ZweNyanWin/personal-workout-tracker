"use client";

import { useState, useEffect, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getSessionWithExercises,
  getAllExercises,
  addSessionExercise,
  removeSessionExercise,
  updateSessionExercise,
} from "@/lib/actions/admin";
import { startWorkout } from "@/lib/actions/workout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Dumbbell,
  Pencil,
  Play,
} from "lucide-react";
import type { Exercise } from "@/types";

type SessionExerciseRow = {
  id: string;
  order_index: number;
  target_sets: number | null;
  target_reps: string | null;
  target_rpe: number | null;
  target_weight_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
  is_warmup: boolean;
  exercise: Exercise;
};

type SessionData = {
  id: string;
  title: string;
  notes: string | null;
  block: { title: string; order_index: number } | null;
  exercises: SessionExerciseRow[];
  viewer_role?: string;
  can_start?: boolean;
};

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SessionExerciseRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SessionExerciseRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, startSave] = useTransition();
  const [updating, startUpdate] = useTransition();
  const [removing, startRemove] = useTransition();
  const [starting, startLogging] = useTransition();

  // Add form state
  const [selectedExId, setSelectedExId] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [rpe, setRpe] = useState("");
  const [rest, setRest] = useState("");
  const [notes, setNotes] = useState("");
  const [isWarmup, setIsWarmup] = useState(false);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  // Edit form state
  const [editSets, setEditSets] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editRpe, setEditRpe] = useState("");
  const [editRest, setEditRest] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editUnit, setEditUnit] = useState<"kg" | "lb">("kg");

  useEffect(() => {
    if (!sessionId) return;
    getSessionWithExercises(sessionId)
      .then((data) => {
        if (!data) return;
        setSession(data as SessionData);
        const viewerIsAdmin = (data as SessionData).viewer_role === "admin";
        setIsAdmin(viewerIsAdmin);
        if (viewerIsAdmin) getAllExercises(true).then(setAllExercises);
      })
      .catch(() => toast.error("Could not load this session"))
      .finally(() => setLoadingSession(false));
  }, [sessionId]);

  const filteredExercises = allExercises.filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase())
  );

  function resetForm() {
    setSelectedExId("");
    setSets("");
    setReps("");
    setWeightKg("");
    setRpe("");
    setRest("");
    setNotes("");
    setIsWarmup(false);
    setSearch("");
    // don't reset unit — keep user's preference
  }

  function handleAdd() {
    if (!selectedExId) {
      toast.error("Select an exercise");
      return;
    }
    startSave(async () => {
      const rawWeight = weightKg ? parseFloat(weightKg) : undefined;
      const weightInKg = rawWeight !== undefined
        ? unit === "lb" ? Math.round(rawWeight * 0.453592 * 10) / 10 : rawWeight
        : undefined;

      const result = await addSessionExercise(sessionId, selectedExId, {
        target_sets: sets ? parseInt(sets) : undefined,
        target_reps: reps || undefined,
        target_rpe: rpe ? parseFloat(rpe) : undefined,
        target_weight_kg: weightInKg,
        rest_seconds: rest ? parseInt(rest) : undefined,
        notes: notes || undefined,
        is_warmup: isWarmup,
      });
      if (result.success) {
        toast.success("Exercise added");
        setAddOpen(false);
        resetForm();
        const updated = await getSessionWithExercises(sessionId);
        if (updated) setSession(updated as SessionData);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    startRemove(async () => {
      const result = await removeSessionExercise(removeTarget.id);
      if (result.success) {
        toast.success(`Removed ${removeTarget.exercise.name}`);
        setRemoveTarget(null);
        const updated = await getSessionWithExercises(sessionId);
        if (updated) setSession(updated as SessionData);
      } else {
        toast.error(result.error);
      }
    });
  }

  function openEdit(se: SessionExerciseRow) {
    setEditTarget(se);
    setEditSets(se.target_sets?.toString() ?? "");
    setEditReps(se.target_reps ?? "");
    setEditRpe(se.target_rpe?.toString() ?? "");
    setEditRest(se.rest_seconds?.toString() ?? "");
    setEditNotes(se.notes ?? "");
    // show existing weight in kg by default
    setEditUnit("kg");
    setEditWeight(se.target_weight_kg?.toString() ?? "");
  }

  function handleUpdate() {
    if (!editTarget) return;
    startUpdate(async () => {
      const rawWeight = editWeight ? parseFloat(editWeight) : null;
      const weightInKg = rawWeight != null
        ? editUnit === "lb" ? Math.round(rawWeight * 0.453592 * 10) / 10 : rawWeight
        : null;

      const result = await updateSessionExercise(editTarget.id, {
        target_sets: editSets ? parseInt(editSets) : null,
        target_reps: editReps || null,
        target_rpe: editRpe ? parseFloat(editRpe) : null,
        target_weight_kg: weightInKg,
        rest_seconds: editRest ? parseInt(editRest) : null,
        notes: editNotes || null,
      });
      if (result.success) {
        toast.success("Updated");
        setEditTarget(null);
        const updated = await getSessionWithExercises(sessionId);
        if (updated) setSession(updated as SessionData);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleStartWorkout() {
    startLogging(async () => {
      const result = await startWorkout(sessionId);
      if (result.success) {
        router.push(`/log/${result.data}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm animate-pulse">Loading session…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div>
          <h1 className="font-semibold">Session unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been removed or is no longer accessible.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => router.replace("/workout")}>
          Back to program
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-14 items-center gap-3 px-4 border-b border-border bg-background/95 backdrop-blur-sm">
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors tap-none"
          aria-label="Go back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{session.title}</h1>
          {session.block && (
            <p className="text-xs text-muted-foreground">
              {session.block.title} · Week {session.block.order_index + 1}
            </p>
          )}
        </div>
        {isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="brand">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Exercise</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Exercise to Session</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* Exercise search */}
                <div className="space-y-1.5">
                  <Label>Exercise *</Label>
                  <Input
                    placeholder="Search exercises…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {filteredExercises.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground text-center">
                        No exercises found
                      </p>
                    )}
                    {filteredExercises.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => setSelectedExId(ex.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors tap-none ${
                          selectedExId === ex.id
                            ? "bg-primary/20 text-primary"
                            : "hover:bg-accent text-foreground"
                        }`}
                      >
                        <span className="font-medium">{ex.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground capitalize">
                          {ex.equipment}
                        </span>
                      </button>
                    ))}
                  </div>
                  {selectedExId && (
                    <p className="text-xs text-primary">
                      Selected: {allExercises.find((e) => e.id === selectedExId)?.name}
                    </p>
                  )}
                </div>

              {/* Prescription */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sets</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 4"
                    value={sets}
                    onChange={(e) => setSets(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reps</Label>
                  <Input
                    placeholder="e.g. 5 or 8-10"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Weight</Label>
                    <div className="flex rounded-lg overflow-hidden border border-border text-xs">
                      <button
                        type="button"
                        onClick={() => setUnit("kg")}
                        className={`px-2 py-0.5 transition-colors tap-none ${
                          unit === "kg"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        kg
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnit("lb")}
                        className={`px-2 py-0.5 transition-colors tap-none ${
                          unit === "lb"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        lb
                      </button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    placeholder={unit === "kg" ? "e.g. 100" : "e.g. 225"}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>RPE</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 8"
                    value={rpe}
                    onChange={(e) => setRpe(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Rest (seconds)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 180"
                    value={rest}
                    onChange={(e) => setRest(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  placeholder="Cues, tempo, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_warmup"
                  className="h-4 w-4"
                  checked={isWarmup}
                  onChange={(e) => setIsWarmup(e.target.checked)}
                />
                <Label htmlFor="is_warmup" className="font-normal text-muted-foreground">
                  Warmup set
                </Label>
              </div>

                <Button
                  type="button"
                  className="w-full"
                  loading={saving}
                  onClick={handleAdd}
                >
                  Add to Session
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit exercise dialog */}
      {isAdmin && (
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit: {editTarget?.exercise.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sets</Label>
                <Input type="number" placeholder="e.g. 4" value={editSets} onChange={(e) => setEditSets(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reps</Label>
                <Input placeholder="e.g. 5 or 8-10" value={editReps} onChange={(e) => setEditReps(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Weight</Label>
                  <div className="flex rounded-lg overflow-hidden border border-border text-xs">
                    <button type="button" onClick={() => {
                      if (editUnit === "lb" && editWeight) {
                        setEditWeight((Math.round(parseFloat(editWeight) * 0.453592 * 10) / 10).toString());
                      }
                      setEditUnit("kg");
                    }} className={`px-2 py-0.5 transition-colors tap-none ${editUnit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>kg</button>
                    <button type="button" onClick={() => {
                      if (editUnit === "kg" && editWeight) {
                        setEditWeight((Math.round(parseFloat(editWeight) * 2.20462 * 10) / 10).toString());
                      }
                      setEditUnit("lb");
                    }} className={`px-2 py-0.5 transition-colors tap-none ${editUnit === "lb" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>lb</button>
                  </div>
                </div>
                <Input type="number" placeholder={editUnit === "kg" ? "e.g. 100" : "e.g. 225"} value={editWeight} onChange={(e) => setEditWeight(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>RPE</Label>
                <Input type="number" placeholder="e.g. 8" value={editRpe} onChange={(e) => setEditRpe(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Rest (seconds)</Label>
                <Input type="number" placeholder="e.g. 180" value={editRest} onChange={(e) => setEditRest(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Coach Notes</Label>
              <Input placeholder="Cues, tempo, etc." value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
            <Button type="button" className="w-full" loading={updating} onClick={handleUpdate}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

      <Dialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove exercise?</DialogTitle>
            <DialogDescription>
              {removeTarget?.exercise.name} will be removed from this program session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={removing}
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              loading={removing}
              onClick={handleRemove}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session notes */}
      {session.notes && (
        <div className="px-4 py-3 bg-accent/30 border-b border-border">
          <p className="text-sm text-muted-foreground">{session.notes}</p>
        </div>
      )}

      {/* Exercise list */}
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full space-y-3">
        {session.can_start && session.exercises.length > 0 && (
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full"
            loading={starting}
            onClick={handleStartWorkout}
          >
            <Play className="h-4 w-4" />
            Start or resume workout
          </Button>
        )}

        {/* kg / lb toggle */}
        {session.exercises.length > 0 && (
          <div className="flex justify-end">
            <div className="flex rounded-lg overflow-hidden border border-border text-xs">
              <button
                type="button"
                onClick={() => setUnit("kg")}
                className={`px-3 py-1 transition-colors tap-none ${unit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                kg
              </button>
              <button
                type="button"
                onClick={() => setUnit("lb")}
                className={`px-3 py-1 transition-colors tap-none ${unit === "lb" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                lb
              </button>
            </div>
          </div>
        )}

        {session.exercises.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No exercises in this session.</p>
            {isAdmin ? (
              <p className="text-sm text-muted-foreground mt-1">
                Tap &quot;Add Exercise&quot; to build this session.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                Your coach has not added exercises to this session yet.
              </p>
            )}
          </div>
        ) : (
          session.exercises.map((se, idx) => {
            const weightKg = se.target_weight_kg;
            const weightDisplay = weightKg != null
              ? unit === "lb"
                ? `${Math.round(weightKg * 2.20462 * 10) / 10} lb`
                : `${weightKg} kg`
              : null;

            const restDisplay = se.rest_seconds != null
              ? se.rest_seconds >= 60
                ? `${Math.floor(se.rest_seconds / 60)} min${se.rest_seconds % 60 ? ` ${se.rest_seconds % 60} sec` : ""}`
                : `${se.rest_seconds} sec`
              : null;

            return (
              <div key={se.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Exercise header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-accent/20">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary text-xs font-bold">
                    {idx + 1}
                  </div>
                  <p className="text-sm font-semibold flex-1">{se.exercise.name}</p>
                  {se.is_warmup && (
                    <Badge variant="secondary" className="text-[10px] py-0">Warmup</Badge>
                  )}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openEdit(se)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors tap-none"
                        aria-label={`Edit ${se.exercise.name}`}
                        title="Edit exercise"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setRemoveTarget(se)}
                        disabled={removing}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors tap-none"
                        aria-label={`Remove ${se.exercise.name}`}
                        title="Remove exercise"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {/* Prescription grid */}
                <div className="grid grid-cols-2 divide-x divide-y divide-border">
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Sets × Reps</p>
                    <p className="text-sm font-semibold font-num">
                      {se.target_sets && se.target_reps
                        ? `${se.target_sets} × ${se.target_reps}`
                        : se.target_sets
                        ? `${se.target_sets} sets`
                        : "—"}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Target Weight</p>
                    <p className={`text-sm font-semibold font-num ${weightDisplay ? "text-foreground" : "text-muted-foreground"}`}>
                      {weightDisplay ?? "Not set"}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">RPE Target</p>
                    <p className={`text-sm font-semibold font-num ${se.target_rpe != null ? "text-primary" : "text-muted-foreground"}`}>
                      {se.target_rpe != null ? `RPE ${se.target_rpe} / 10` : "Not set"}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Rest Between Sets</p>
                    <p className={`text-sm font-semibold font-num ${restDisplay ? "text-foreground" : "text-muted-foreground"}`}>
                      {restDisplay ?? "Not set"}
                    </p>
                  </div>
                </div>

                {/* Coach notes */}
                {se.notes && (
                  <div className="px-4 py-2.5 border-t border-border bg-accent/10">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Coach Notes</p>
                    <p className="text-xs text-foreground">{se.notes}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
