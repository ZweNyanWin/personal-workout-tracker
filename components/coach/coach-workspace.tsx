"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, BookOpen, ChevronRight, ClipboardList,
  Dumbbell, Layers3, MessageCircle, Sparkles, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createExampleBlock, type ProgramDraft } from "@/lib/coach/program";
import { ProgramDraftView } from "@/components/coach/program-draft";
import { CoachChat } from "@/components/coach/coach-chat";

const REFERENCES = [
  { title: "Example 16-week plan", detail: "Bench peak · squat focus · 4 days/week", kind: "Preview reference" },
  { title: "70's Powerlifter", detail: "Strength program", kind: "PDF reference" },
  { title: "100 lbs in 10 weeks", detail: "Spreadsheet · 5 populated weeks supplied", kind: "Spreadsheet reference" },
  { title: "Barndoor back", detail: "Back training", kind: "PDF reference" },
  { title: "Bullmastiff", detail: "Strength program", kind: "PDF reference" },
  { title: "KK deadlift", detail: "Deadlift program", kind: "PDF reference" },
  { title: "Exercise science", detail: "ACSM · NSCA · ACE guidance", kind: "Reviewed sources" },
  { title: "Calisthenics coaching", detail: "GMB · Steven Low · basic to advanced", kind: "Reviewed sources" },
];

function PreviewNote() {
  return <p className="text-xs leading-relaxed text-muted-foreground">Example response for this preview. Your workout history is not connected yet.</p>;
}

export function CoachWorkspace() {
  const [tab, setTab] = useState("review");
  const [review, setReview] = useState(false);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [equipment, setEquipment] = useState<"gym" | "bodyweight">("gym");
  const [goal, setGoal] = useState("Build strength and muscle");
  const [days, setDays] = useState("4");
  const [weeks, setWeeks] = useState("4");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-6 md:p-8">
      <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        Experimental AI chat · Review and Build examples · nothing is saved to your workouts
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-3.5 w-3.5" /> PowerBuild Coach</div>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">Train with a little<br className="md:hidden" /> more direction.</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Review your lifts, shape your next block, or talk through your training.</p>
        </div>
        <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 sm:flex"><Sparkles className="h-6 w-6 text-primary" /></div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-12 w-full grid-cols-3 md:max-w-md">
          <TabsTrigger value="review" className="h-full gap-2"><ClipboardList className="h-4 w-4" />Review</TabsTrigger>
          <TabsTrigger value="build" className="h-full gap-2"><Layers3 className="h-4 w-4" />Build</TabsTrigger>
          <TabsTrigger value="ask" className="h-full gap-2"><MessageCircle className="h-4 w-4" />Ask</TabsTrigger>
        </TabsList>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <TabsContent value="review" className="mt-0 space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
                <div className="mb-5 flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Your next session, in context</h2>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">PREVIEW</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Example block</p><p className="mt-1 text-xl font-bold font-num">4 <span className="text-sm font-normal">weeks</span></p></div>
                  <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Available history</p><p className="mt-1 text-xl font-bold">Not connected</p></div>
                </div>
                <div className="my-5 flex gap-3 rounded-xl border border-border p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Target className="h-4 w-4 text-primary" /></div>
                  <div><p className="text-sm font-medium">Example: bench strength + hypertrophy</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">This sample 16-week plan illustrates a reference. Its 130 kg bench attempt is a target, not a completed PR or your saved goal.</p></div>
                </div>
                <Button type="button" className="w-full" onClick={() => setReview(true)}><Sparkles className="h-4 w-4" />Preview session review<ArrowUpRight className="ml-auto h-4 w-4" /></Button>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This authored example does not read completed sets, RPE, or your active program.</p>
              </div>
              {review && <div className="rounded-2xl border border-primary/25 bg-card p-5 space-y-3"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Example review</div><p className="text-sm leading-relaxed">The sample reference starts with three building weeks and a deload in week four. A personalized review would compare your completed lifts against your own planned targets. With no logs connected here, this example cannot establish progress or choose your next working weight.</p><PreviewNote /><Button type="button" variant="ghost" className="px-0" onClick={() => setTab("ask")}>Talk through your last workout<ChevronRight className="h-4 w-4" /></Button></div>}
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTab("build")} className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"><Layers3 className="mb-3 h-5 w-5 text-primary" /><span className="block text-sm font-semibold">Plan your next block</span><span className="mt-1 block text-xs text-muted-foreground">Start with four weeks</span></button>
                <button type="button" onClick={() => setTab("ask")} className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"><MessageCircle className="mb-3 h-5 w-5 text-primary" /><span className="block text-sm font-semibold">Ask your coach</span><span className="mt-1 block text-xs text-muted-foreground">One question at a time</span></button>
              </div>
            </TabsContent>

            <TabsContent value="build" className="mt-0 space-y-4">
              <form className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5" onSubmit={(event) => { event.preventDefault(); setDraft(createExampleBlock(Number(weeks), Number(days), equipment)); }}>
                <div><h2 className="font-semibold">Explore an example block</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">This authored example uses your schedule and equipment. It does not use the AI, your entered goal, or saved workout history.</p></div>
                <div className="space-y-2"><Label htmlFor="coach-goal">What are you working toward?</Label><Input id="coach-goal" value={goal} onChange={(e) => { setGoal(e.target.value); setDraft(null); }} required maxLength={200} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label htmlFor="coach-weeks">Block length</Label><select id="coach-weeks" value={weeks} onChange={(e) => { setWeeks(e.target.value); setDraft(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm"><option value="4">4 weeks</option><option value="8">8 weeks</option><option value="16">16 weeks</option></select></div>
                  <div className="space-y-2"><Label htmlFor="coach-days">Days per week</Label><select id="coach-days" value={days} onChange={(e) => { setDays(e.target.value); setDraft(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm">{[2, 3, 4].map((day) => <option key={day} value={day}>{day} days</option>)}</select></div>
                </div>
                <div className="space-y-2"><Label htmlFor="coach-equipment">Example equipment</Label><select id="coach-equipment" value={equipment} onChange={(e) => { setEquipment(e.target.value as "gym" | "bodyweight"); setDraft(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm"><option value="gym">Gym · barbell, dumbbells, machines</option><option value="bodyweight">Calisthenics · secure bar, rings, floor</option></select></div>
                <div className="rounded-xl bg-muted/60 p-4 flex gap-3"><Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-xs leading-relaxed text-muted-foreground">Every week includes sets and reps. These examples need adjustment to your current ability; ask the experimental AI about changes in the Ask tab.</p></div>
                <Button type="submit" className="w-full"><Sparkles className="h-4 w-4" />Preview program draft</Button>
              </form>
              {draft && <ProgramDraftView key={`${weeks}-${days}-${equipment}`} program={draft} />}
            </TabsContent>

            <TabsContent forceMount value="ask" className="mt-0 data-[state=inactive]:hidden">
              <CoachChat active={tab === "ask"} />
            </TabsContent>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Example reference library</h2></div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">A preview of how program references will appear. These examples are not your uploaded files or completed workouts.</p>
            <div className="mt-4 divide-y divide-border">{REFERENCES.map((source) => <div key={source.title} className="py-3"><p className="text-sm font-medium">{source.title}</p><p className="mt-1 text-xs text-muted-foreground">{source.detail}</p><span className="mt-2 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{source.kind}</span></div>)}</div>
            <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">Library layout preview. Local training uses reviewed examples; this screen does not retrieve the source files.</p>
            {process.env.NODE_ENV === "development" && <Button asChild variant="outline" className="mt-4 w-full"><Link href="/preview/ollama">See local model training<ArrowUpRight className="h-4 w-4" /></Link></Button>}
          </aside>
        </div>
      </Tabs>
    </div>
  );
}
