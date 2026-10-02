"use client";

import { useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExercisePrescription, ProgramDraft } from "@/lib/coach/program";
import { formatRestMinutes } from "@/lib/rest-minutes";

function dose(exercise: ExercisePrescription) {
  const range = exercise.dose.kind === "hold" ? exercise.dose.seconds : exercise.dose.range;
  const amount = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  return `${exercise.sets} × ${amount}${exercise.dose.kind === "hold" ? " sec" : exercise.dose.perSide ? " / side" : " reps"}`;
}

export function ProgramDraftView({ program }: { program: ProgramDraft }) {
  const [selected, setSelected] = useState(0);
  const week = program.weeks[selected];
  return <section className="rounded-2xl border border-primary/25 bg-card p-5 space-y-5" aria-label="Example program draft">
    <div><span className="text-xs font-medium text-primary">EXAMPLE DRAFT · NOT ASSIGNED</span><h3 className="mt-1 font-semibold">{program.title}</h3><p className="mt-1 text-xs text-muted-foreground">{program.weeks.length} weeks · {week.days.length} days per week · all working sets detailed</p></div>
    <details className="rounded-xl bg-muted/60 p-3"><summary className="cursor-pointer text-sm font-medium">Assumptions and equipment</summary><ul className="mt-3 space-y-2 list-disc pl-4 text-xs leading-relaxed text-muted-foreground">{program.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
    <div className="flex items-center justify-between gap-2"><Button variant="outline" size="icon" aria-label="Previous week" disabled={selected === 0} onClick={() => setSelected((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button><div className="text-center"><p className="flex items-center justify-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" />Week {week.number}</p><p className="mt-1 text-xs text-muted-foreground">{week.focus}</p></div><Button variant="outline" size="icon" aria-label="Next week" disabled={selected === program.weeks.length - 1} onClick={() => setSelected((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a week">{program.weeks.map((item, index) => <button key={item.number} type="button" onClick={() => setSelected(index)} aria-pressed={index === selected} className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold transition-colors ${index === selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"}`}>W{item.number}</button>)}</div>
    <div className="space-y-4">{week.days.map((day) => <article key={day.number} className="overflow-hidden rounded-xl border border-border"><div className="bg-muted/50 p-3"><h4 className="text-sm font-semibold">Day {day.number} · {day.title}</h4><p className="mt-2 text-xs leading-relaxed text-muted-foreground"><span className="font-medium">Warm-up:</span> {day.warmup}</p></div><div className="divide-y divide-border">{day.exercises.map((exercise, index) => <div key={`${exercise.name}-${index}`} className="p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{exercise.name}</p><span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold font-num text-primary">{dose(exercise)}</span></div><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{exercise.loadOrAssistance}</p><p className="mt-2 text-xs text-muted-foreground">{exercise.effort} · rest {formatRestMinutes(exercise.restSeconds, exercise.restRangeMinutes)}</p></div>)}</div></article>)}</div>
    <div className="space-y-3 border-t border-border pt-4 text-xs leading-relaxed"><p><span className="font-semibold">When to progress:</span> <span className="text-muted-foreground">{program.progression}</span></p><p><span className="font-semibold">When to ease back:</span> <span className="text-muted-foreground">{program.regression}</span></p></div>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 shrink-0" />Nothing has been added to your program or workout history.</p>
  </section>;
}
