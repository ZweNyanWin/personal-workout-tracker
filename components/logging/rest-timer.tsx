"use client";

import { Timer, X } from "lucide-react";
import { useRestTimer } from "@/lib/hooks/use-workout-timer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface RestTimerProps {
  defaultSeconds?: number;
}

export function RestTimer({ defaultSeconds = 180 }: RestTimerProps) {
  const { seconds, running, formatted, start, stop } = useRestTimer();

  const presets = [60, 90, 120, 180, 240, 300];

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 transition-colors",
      running ? "border-primary/40 bg-primary/5" : "border-border"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Timer className={cn("h-4 w-4", running ? "text-primary animate-pulse" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Rest Timer</span>
        </div>
        {running && (
          <Button variant="ghost" size="icon-sm" onClick={stop}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {running ? (
        <div className="space-y-2">
          <p className="text-3xl font-bold font-num text-center tabular-nums">{formatted}</p>
          <Progress value={0} className="h-1.5" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {presets.map((s) => (
            <button
              key={s}
              onClick={() => start(s)}
              className="flex-1 min-w-[48px] rounded-lg border border-border bg-background py-1.5 text-xs font-medium hover:bg-accent hover:border-primary/40 transition-colors tap-none"
            >
              {s >= 60 ? `${s / 60}m` : `${s}s`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
