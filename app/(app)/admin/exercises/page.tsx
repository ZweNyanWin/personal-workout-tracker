"use client";

import { useState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  createExercise,
  updateExercise,
  deleteExercise,
  getAllExercises,
} from "@/lib/actions/admin";
import { exerciseSchema, type ExerciseInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Dumbbell, Pencil, Trash2 } from "lucide-react";
import type { Exercise } from "@/types";

const MUSCLE_OPTIONS = [
  "chest", "triceps", "front_delt", "side_delt", "rear_delt",
  "lats", "rhomboids", "biceps", "traps",
  "quads", "hamstrings", "glutes", "lower_back", "abs", "core",
  "rotator_cuff",
];
const MOVEMENT_OPTIONS = ["push", "pull", "squat", "hinge", "carry", "accessory", "other"];
const EQUIPMENT_OPTIONS = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "bands", "other"];

function ExerciseForm({
  defaultValues,
  onSubmit,
  saving,
}: {
  defaultValues?: Partial<ExerciseInput>;
  onSubmit: (v: ExerciseInput) => void;
  saving: boolean;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<ExerciseInput>({
      resolver: zodResolver(exerciseSchema),
      defaultValues: { muscle_groups: [], is_compound: false, ...defaultValues },
    });

  const selectedMuscles = watch("muscle_groups");

  function toggleMuscle(m: string) {
    const current = selectedMuscles ?? [];
    setValue(
      "muscle_groups",
      current.includes(m) ? current.filter((x) => x !== m) : [...current, m]
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input placeholder="Competition Bench Press" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea placeholder="Brief description…" {...register("description")} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Muscle Groups *</Label>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMuscle(m)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors tap-none ${
                selectedMuscles?.includes(m)
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {m.replace("_", " ")}
            </button>
          ))}
        </div>
        {errors.muscle_groups && <p className="text-xs text-destructive">{errors.muscle_groups.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Movement Type *</Label>
          <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" {...register("movement_type")}>
            <option value="">Select…</option>
            {MOVEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Equipment *</Label>
          <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" {...register("equipment")}>
            <option value="">Select…</option>
            {EQUIPMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Primary Lift</Label>
          <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" {...register("primary_lift")}>
            <option value="">None</option>
            <option value="bench">Bench</option>
            <option value="squat">Squat</option>
            <option value="deadlift">Deadlift</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Compound</Label>
          <div className="flex items-center gap-2 h-10">
            <input type="checkbox" id="is_compound" className="h-4 w-4" {...register("is_compound")} />
            <Label htmlFor="is_compound" className="font-normal text-muted-foreground">Is compound</Label>
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" loading={saving}>
        Save Exercise
      </Button>
    </form>
  );
}

export default function AdminExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Exercise | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  function reload() {
    getAllExercises(true).then(setExercises);
  }

  useEffect(() => { reload(); }, []);

  function onAdd(values: ExerciseInput) {
    startSave(async () => {
      const result = await createExercise({ ...values, primary_lift: values.primary_lift || undefined });
      if (result.success) {
        toast.success("Exercise created");
        setAddOpen(false);
        reload();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onEdit(values: ExerciseInput) {
    if (!editTarget) return;
    startSave(async () => {
      const result = await updateExercise(editTarget.id, {
        ...values,
        primary_lift: (values.primary_lift as any) || null,
      });
      if (result.success) {
        toast.success("Exercise updated");
        setEditTarget(null);
        reload();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDelete(ex: Exercise) {
    startDelete(async () => {
      const result = await deleteExercise(ex.id);
      if (result.success) {
        toast.success(`Deleted ${ex.name}`);
        setDeleteTarget(null);
        reload();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur-sm">
        <h1 className="text-base font-semibold">Exercise Library</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand">
              <Plus className="h-4 w-4" />
              Add Exercise
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Exercise</DialogTitle></DialogHeader>
            <ExerciseForm onSubmit={onAdd} saving={saving} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {exercises.length === 0 && (
            <div className="p-8 text-center">
              <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No exercises yet.</p>
            </div>
          )}
          {exercises.map((ex) => (
            <div key={ex.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{ex.name}</p>
                    {ex.is_compound && <Badge variant="brand" className="text-[10px] py-0">Compound</Badge>}
                    {!ex.is_compound && ex.movement_type && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] py-0 capitalize ${
                          ex.movement_type === "accessory"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            : ""
                        }`}
                      >
                        {ex.movement_type}
                      </Badge>
                    )}
                    {ex.primary_lift && (
                      <Badge variant="outline" className="text-[10px] py-0 capitalize">{ex.primary_lift}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ex.muscle_groups.slice(0, 5).map((m) => (
                      <span key={m} className="text-[10px] bg-secondary rounded px-1.5 py-0.5 text-secondary-foreground">
                        {m.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                  {ex.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ex.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground capitalize mr-2">{ex.equipment}</span>
                  {/* Edit */}
                  <button
                    onClick={() => setEditTarget(ex)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors tap-none"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => setDeleteTarget(ex)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors tap-none"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Exercise</DialogTitle></DialogHeader>
          {editTarget && (
            <ExerciseForm
              defaultValues={{
                name: editTarget.name,
                description: editTarget.description ?? "",
                muscle_groups: editTarget.muscle_groups,
                movement_type: editTarget.movement_type ?? undefined,
                equipment: editTarget.equipment ?? undefined,
                is_compound: editTarget.is_compound,
                primary_lift: editTarget.primary_lift ?? "",
              }}
              onSubmit={onEdit}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Exercise</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            Delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={deleting}
              onClick={() => deleteTarget && onDelete(deleteTarget)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
