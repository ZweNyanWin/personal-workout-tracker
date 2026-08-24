"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Standard gym plates in kg (per side), largest first
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function calcPlates(targetKg: number, barKg: number): { plate: number; count: number }[] {
  let remaining = (targetKg - barKg) / 2;
  const result: { plate: number; count: number }[] = [];
  for (const p of PLATES) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / p);
    if (count > 0) {
      result.push({ plate: p, count });
      remaining = Math.round((remaining - count * p) * 1000) / 1000;
    }
  }
  return result;
}

const BAR_OPTIONS = [
  { label: "Olympic", value: 20 },
  { label: "Women's", value: 15 },
  { label: "Light", value: 10 },
];

export default function PlateCalculatorPage() {
  const [target, setTarget] = useState("");
  const [barKg, setBarKg] = useState(20);

  const targetNum = parseFloat(target);
  const valid = !isNaN(targetNum) && targetNum >= barKg;
  const plates = valid ? calcPlates(targetNum, barKg) : [];
  const achievable = valid
    ? barKg + plates.reduce((s, { plate, count }) => s + plate * count * 2, 0)
    : null;
  const isExact = achievable !== null && Math.abs(achievable - targetNum) < 0.001;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/95 backdrop-blur-sm px-4">
        <h1 className="text-base font-semibold">Plate Calculator</h1>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-md mx-auto w-full space-y-6">
        {/* Inputs */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Target weight (kg)</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 102.5"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="flex-1 text-lg font-num"
              />
              <span className="text-sm text-muted-foreground shrink-0">kg</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Bar weight</Label>
            <div className="flex gap-2">
              {BAR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBarKg(opt.value)}
                  aria-pressed={barKg === opt.value}
                  className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-sm transition-colors tap-none ${
                    barKg === opt.value
                      ? "border-primary/60 bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <span className="font-medium">{opt.value} kg</span>
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        {valid && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Each side</p>
              {plates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Just the bar ({barKg} kg)</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {plates.map(({ plate, count }) =>
                    Array.from({ length: count }).map((_, i) => (
                      <span
                        key={`${plate}-${i}`}
                        className="inline-flex items-center justify-center rounded-full border-2 border-primary/50 bg-primary/10 text-primary font-bold font-num text-sm px-3 py-1.5 min-w-12"
                      >
                        {plate}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total on bar</span>
              <span className={`font-bold font-num ${isExact ? "text-success" : "text-amber-500"}`}>
                {achievable} kg{!isExact && ` (closest to ${targetNum})`}
              </span>
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="flex justify-between">
                <span>Bar</span>
                <span className="font-num">{barKg} kg</span>
              </div>
              {plates.map(({ plate, count }) => (
                <div key={plate} className="flex justify-between">
                  <span>{count} × {plate} kg per side</span>
                  <span className="font-num">+{plate * count * 2} kg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {target && !valid && (
          <p className="text-sm text-destructive text-center">
            Target must be at least {barKg} kg (bar weight).
          </p>
        )}
      </div>
    </div>
  );
}
