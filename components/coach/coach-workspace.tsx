"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ClipboardList, Layers3, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createExampleBlock, type ProgramDraft } from "@/lib/coach/program";
import { ProgramDraftView } from "@/components/coach/program-draft";
import { CoachChat } from "@/components/coach/coach-chat";

export function CoachWorkspace() {
  const [tab, setTab] = useState("ask");
  const [review, setReview] = useState(false);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [equipment, setEquipment] = useState<"gym" | "bodyweight">("gym");
  const [days, setDays] = useState("4");
  const [weeks, setWeeks] = useState("4");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-6 md:p-8">
      <p className="text-sm text-muted-foreground">Talk through your training, review a session, or explore a block.</p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-12 w-full grid-cols-3">
          <TabsTrigger value="ask" className="h-full gap-2"><MessageCircle className="h-4 w-4" />Ask</TabsTrigger>
          <TabsTrigger value="review" className="h-full gap-2"><ClipboardList className="h-4 w-4" />Review</TabsTrigger>
          <TabsTrigger value="build" className="h-full gap-2"><Layers3 className="h-4 w-4" />Build</TabsTrigger>
        </TabsList>

        <div className="mt-5 min-w-0">
          <TabsContent forceMount value="ask" className="mt-0 data-[state=inactive]:hidden">
            <CoachChat active={tab === "ask"} />
          </TabsContent>

          <TabsContent value="review" className="mt-0 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Review a session</h2>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">EXAMPLE</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">See how a session review could work. This example does not read your saved workouts.</p>
              <Button type="button" className="mt-5 w-full" onClick={() => setReview(true)}><Sparkles className="h-4 w-4" />Show example review<ArrowUpRight className="ml-auto h-4 w-4" /></Button>
            </div>
            {review && <div className="rounded-2xl border border-primary/25 bg-card p-5 space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Example review</h3><p className="text-sm leading-relaxed">A session review compares completed sets with planned targets, including reps, load, and effort. Missed reps or unexpectedly high effort call for a closer look at rest, recovery, and technique before increasing the workload.</p><p className="text-xs leading-relaxed text-muted-foreground">To discuss your session with Tommy, share the exercise, planned and completed sets, effort, and anything that felt unusual.</p><Button type="button" variant="outline" onClick={() => setTab("ask")}>Discuss a session with Tommy<ArrowUpRight className="h-4 w-4" /></Button></div>}
          </TabsContent>

          <TabsContent value="build" className="mt-0 space-y-4">
            <form className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-5" onSubmit={(event) => { event.preventDefault(); setDraft(createExampleBlock(Number(weeks), Number(days), equipment)); }}>
              <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Explore a training block</h2><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground">EXAMPLE</span></div>
              <p className="text-xs leading-relaxed text-muted-foreground">Choose a schedule and equipment to preview an authored example with every week&apos;s sets and reps. For advice based on your own training, ask Tommy.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="coach-weeks">Block length</Label><select id="coach-weeks" value={weeks} onChange={(e) => { setWeeks(e.target.value); setDraft(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm"><option value="4">4 weeks</option><option value="8">8 weeks</option><option value="16">16 weeks</option></select></div>
                <div className="space-y-2"><Label htmlFor="coach-days">Days per week</Label><select id="coach-days" value={days} onChange={(e) => { setDays(e.target.value); setDraft(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm">{[2, 3, 4].map((day) => <option key={day} value={day}>{day} days</option>)}</select></div>
              </div>
              <div className="space-y-2"><Label htmlFor="coach-equipment">Equipment</Label><select id="coach-equipment" value={equipment} onChange={(e) => { setEquipment(e.target.value as "gym" | "bodyweight"); setDraft(null); }} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm"><option value="gym">Gym · barbell, dumbbells, machines</option><option value="bodyweight">Calisthenics · secure bar, rings, floor</option></select></div>
              <Button type="submit" className="w-full"><Sparkles className="h-4 w-4" />Preview program draft</Button>
            </form>
            {draft && <ProgramDraftView key={`${weeks}-${days}-${equipment}`} program={draft} />}
          </TabsContent>
        </div>
      </Tabs>
      {process.env.NODE_ENV === "development" && <p className="text-xs"><Link href="/preview/ollama" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">Local model status and training</Link></p>}
    </div>
  );
}
