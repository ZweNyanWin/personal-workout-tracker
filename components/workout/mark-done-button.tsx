"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { markSessionDone, unmarkSessionDone } from "@/lib/actions/workout";

export function MarkDoneButton({
  sessionId,
  isDone,
}: {
  sessionId: string;
  isDone: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // While the action is in-flight, show the optimistic opposite state
  const displayDone = pending ? !isDone : isDone;

  function toggle() {
    startTransition(async () => {
      if (isDone) {
        const result = await unmarkSessionDone(sessionId);
        if (!result.success) toast.error(result.error);
        else toast.success("Marked as not done");
      } else {
        const result = await markSessionDone(sessionId);
        if (!result.success) toast.error(result.error);
        else toast.success("Session complete");
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={displayDone ? "Unmark as done" : "Mark as done"}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors tap-none disabled:opacity-50 ${
        displayDone
          ? "border-success/40 bg-success/15 text-success hover:bg-success/20"
          : "border-border bg-secondary/60 text-secondary-foreground hover:border-success/40 hover:bg-success/10 hover:text-success"
      }`}
    >
      {displayDone ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Done
        </>
      ) : (
        <>
          <Circle className="h-4 w-4" />
          Mark Done
        </>
      )}
    </button>
  );
}
