import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BusinessStatusControl } from "@/components/business/business-controls";
import { BusinessStatusBadge } from "@/components/business/business-status";

import type { CoachBusinessMetric } from "@/lib/business/schema";

export function BusinessOverview({ business, previewMode = false }: { business: CoachBusinessMetric; previewMode?: boolean }) {
  return <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
    <Link href={previewMode ? "/preview/platform" : "/platform"} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Coach businesses</Link>
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Business overview</p><h1 className="mt-1 text-2xl font-bold">{business.name}</h1><p className="mt-2 text-sm text-muted-foreground">{business.coach_name ?? "Business owner"} · {business.coach_email}</p></div><BusinessStatusBadge status={business.status} /></header>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[
      ["Coaches", business.coaches], ["Clients", business.clients], ["Active programs", business.active_programs],
      ["Drafts · 30 days", business.drafts_30_days], ["Messages · 30 days", business.messages_30_days], ["Plan", "Free testing"],
    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><p className="text-xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}</section>
    <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-semibold">Manage access</h2><BusinessStatusControl business={business} disabled={previewMode} /></section>
    <section className="rounded-2xl border border-border bg-card p-5 text-sm"><h2 className="mb-3 font-semibold">Activity</h2><p className="text-muted-foreground">Last workout activity: {business.last_workout_at ? new Date(business.last_workout_at).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "No workouts yet"}</p><p className="mt-2 text-muted-foreground">Created: {new Date(business.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</p><p className="mt-4 text-xs text-muted-foreground">The coach manages their clients in their own workspace. Individual client data is kept out of this owner portal.</p></section>
  </div>;
}
