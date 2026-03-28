import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { relativeDate, formatMinutes } from "@/lib/utils";
import type { WorkoutLog } from "@/types";

interface RecentWorkoutsProps {
  logs: WorkoutLog[];
}

export function RecentWorkouts({ logs }: RecentWorkoutsProps) {
  if (!logs.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">No workouts yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Complete your first session to see history here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {logs.slice(0, 4).map((log) => (
        <Link
          key={log.id}
          href={`/log/${log.id}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors tap-none"
        >
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{log.title ?? "Workout"}</p>
            <p className="text-xs text-muted-foreground">{relativeDate(log.date)}</p>
          </div>
          {log.duration_minutes && (
            <span className="text-xs text-muted-foreground font-num shrink-0">
              {formatMinutes(log.duration_minutes)}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      ))}
    </div>
  );
}
