import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatWeight } from "@/lib/utils";
import type { E1rmCard } from "@/types";

const LIFT_LABELS: Record<string, string> = {
  bench: "Bench",
  squat: "Squat",
  deadlift: "Deadlift",
};

interface StatsRowProps {
  e1rmCards: any[];
  weeklyVolume: number;
}

export function StatsRow({ e1rmCards, weeklyVolume }: StatsRowProps) {
  const lifts = ["bench", "squat", "deadlift"];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Weekly volume */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Weekly Vol
        </p>
        <p className="text-2xl font-bold font-num mt-1">
          {weeklyVolume >= 1000
            ? `${(weeklyVolume / 1000).toFixed(1)}k`
            : Math.round(weeklyVolume).toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">kg total</p>
      </div>

      {/* e1RM per lift */}
      {lifts.map((lift) => {
        const card = e1rmCards.find((c: any) => c.exercise?.primary_lift === lift);
        const value = card?.value ?? null;

        return (
          <div key={lift} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {LIFT_LABELS[lift]} e1RM
            </p>
            {value ? (
              <p className="text-2xl font-bold font-num mt-1">
                {formatWeight(value)}
                <span className="text-sm font-normal text-muted-foreground ml-1">kg</span>
              </p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground mt-1">—</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">estimated</p>
          </div>
        );
      })}
    </div>
  );
}
