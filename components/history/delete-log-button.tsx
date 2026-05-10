"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWorkoutLog } from "@/lib/actions/workout";

export function DeleteLogButton({ logId }: { logId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWorkoutLog(logId);
      if (result.success) toast.success("Workout removed");
      else toast.error(result.error);
    });
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.preventDefault()}>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs px-2 py-1 hover:bg-destructive/20 transition-colors disabled:opacity-50 tap-none"
        >
          {pending ? "…" : "Confirm"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="rounded-md border border-border text-muted-foreground text-xs px-2 py-1 hover:bg-accent transition-colors tap-none"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); setConfirm(true); }}
      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors tap-none"
      title="Delete workout"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
