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
        else toast.success("Unmarked — ready to log fresh");
      } else {
        const result = await markSessionDone(sessionId);
        if (!result.success) toast.error(result.error);
        else toast.success("Session marked as done");
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={displayDone ? "Unmark as done" : "Mark as done"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors tap-none disabled:opacity-50 ${
        displayDone
          ? "text-success hover:bg-success/10"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {displayDone ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <Circle className="h-5 w-5" />
      )}
    </button>
  );
}
