"use client";

import { cn } from "@/lib/utils";

interface FrequencyHeatmapProps {
  data: { date: string; count: number }[];
}

function getLast12Weeks(): string[] {
  const weeks: string[] = [];
  const today = new Date();
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    weeks.push(d.toISOString().split("T")[0]);
  }
  return weeks;
}

function getWeekDayLabel(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

export function FrequencyHeatmap({ data }: FrequencyHeatmapProps) {
  const countMap = new Map(data.map((d) => [d.date, d.count]));
  const days = getLast12Weeks();

  // Group into weeks (chunks of 7)
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  function intensity(count: number): string {
    if (count === 0) return "bg-muted";
    if (count === 1) return "bg-success/30";
    if (count === 2) return "bg-success/60";
    return "bg-success";
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => {
              const count = countMap.get(day) ?? 0;
              return (
                <div
                  key={day}
                  title={`${day}: ${count} workout${count !== 1 ? "s" : ""}`}
                  className={cn(
                    "h-3 w-3 rounded-sm transition-colors",
                    intensity(count)
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <span>Less</span>
        {["bg-muted", "bg-success/30", "bg-success/60", "bg-success"].map((c) => (
          <div key={c} className={cn("h-3 w-3 rounded-sm", c)} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
