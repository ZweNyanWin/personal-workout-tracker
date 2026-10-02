import Link from "next/link";
import { Building2, ChevronRight, Users, MessageSquare, Activity } from "lucide-react";
import { NewCoachBusiness } from "@/components/business/business-controls";
import { BusinessStatusBadge } from "@/components/business/business-status";

import type { CoachBusinessMetric } from "@/lib/business/schema";

export function PlatformOverview({ businesses, previewMode = false }: { businesses: CoachBusinessMetric[]; previewMode?: boolean }) {
  const totals = [
    { label: "Coach businesses", value: businesses.length, icon: Building2 },
    { label: "Active clients", value: businesses.reduce((n, b) => n + b.clients, 0), icon: Users },
    { label: "Assigned programs", value: businesses.reduce((n, b) => n + b.active_programs, 0), icon: Activity },
    { label: "Tommy messages · 30 days", value: businesses.reduce((n, b) => n + b.messages_30_days, 0), icon: MessageSquare },
  ];
  return <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">PowerBuild owner</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Your coach businesses</h1><p className="mt-2 text-sm text-muted-foreground">Monitor your coach customers and manage access from one place.</p></div>
      <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Free testing plan</span>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{totals.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><Icon className="mb-3 h-5 w-5 text-primary" /><p className="text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}</div>
    <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-semibold">Onboard a coach</h2><NewCoachBusiness disabled={previewMode} /></section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Businesses</h2>
      {businesses.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add your first verified coach account to start testing.</div>
        : <div className="grid gap-3 md:grid-cols-2">{businesses.map((business) => <Link key={business.id} href={previewMode ? `/preview/platform?business=${business.id}` : `/platform/businesses/${business.id}`} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/30">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{business.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{business.coach_name ?? business.coach_email}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{business.coach_email}</p></div><BusinessStatusBadge status={business.status} /></div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm"><div><strong className="block tabular-nums">{business.coaches}</strong><span className="text-xs text-muted-foreground">Coaches</span></div><div><strong className="block tabular-nums">{business.clients}</strong><span className="text-xs text-muted-foreground">Clients</span></div><div><strong className="block tabular-nums">{business.active_programs}</strong><span className="text-xs text-muted-foreground">Active plans</span></div></div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span>{business.messages_30_days} Tommy messages this month</span><ChevronRight className="h-4 w-4" /></div>
        </Link>)}</div>}
      <p className="text-xs leading-relaxed text-muted-foreground">This view shows business contacts and activity counts. Client chats, health notes and individual training records stay inside their coach business.</p>
    </section>
  </div>;
}
