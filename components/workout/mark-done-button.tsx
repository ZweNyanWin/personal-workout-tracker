"use client";

import { useState, useTransition } from "react";
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
  const [done, setDone] = useState(isDone);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (done) {
        const result = await unmarkSessionDone(sessionId);
        if (result.success) {
          setDone(false);
          toast.success("Unmarked — ready to log fresh");
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await markSessionDone(sessionId);
        if (result.success) {
          setDone(true);
          toast.success("Session marked as done");
        } else {
          toast.error(result.error);
        }
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={done ? "Unmark as done" : "Mark as done"}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors tap-none disabled:opacity-50 ${
        done
          ? "text-success hover:bg-success/10"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {done ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <Circle className="h-5 w-5" />
      )}
    </button>
  );
}
