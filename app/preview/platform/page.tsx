import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformOverview } from "@/components/business/platform-overview";
import { BusinessOverview } from "@/components/business/business-overview";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { CoachBusinessMetric } from "@/lib/business/schema";
import type { Profile } from "@/types";

export const metadata: Metadata = { title: "Owner portal preview", robots: { index: false, follow: false } };

const businesses: CoachBusinessMetric[] = [
  { id: "e0000000-0000-4000-8000-000000000001", name: "Northside Strength", status: "trial", plan: "free_test",
    created_at: "2026-10-01T12:00:00Z", owner_user_id: "e1000000-0000-4000-8000-000000000001",
    coach_email: "alex@example.invalid", coach_name: "Alex Morgan", coaches: 2, clients: 12, active_programs: 10,
    drafts_30_days: 8, messages_30_days: 38, last_workout_at: "2026-10-02T06:00:00Z" },
  { id: "e0000000-0000-4000-8000-000000000002", name: "Everyday Movement", status: "active", plan: "free_test",
    created_at: "2026-09-28T12:00:00Z", owner_user_id: "e1000000-0000-4000-8000-000000000002",
    coach_email: "sam@example.invalid", coach_name: "Sam Lee", coaches: 1, clients: 8, active_programs: 6,
    drafts_30_days: 5, messages_30_days: 24, last_workout_at: "2026-10-01T17:00:00Z" },
];

export default async function PlatformPreviewPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  // This exact development route uses only fictional data and disables writes.
  // Production owner pages always use authenticated database permission checks.
  if (process.env.NODE_ENV !== "development") notFound();
  const { business: businessId } = await searchParams;
  const selected = businessId ? businesses.find((business) => business.id === businessId) : undefined;
  if (businessId && !selected) notFound();
  const profile: Profile = { id: "preview", email: "owner@example.invalid", full_name: "Local owner preview",
    username: null, avatar_url: null, role: "admin", created_at: "", updated_at: "" };
  return <div className="flex h-dvh bg-background safe-top safe-left safe-right">
    <div className="hidden md:flex md:shrink-0"><Sidebar profile={profile} isCoach isPlatformOwner /></div>
    <main className="min-w-0 flex-1 overflow-y-auto pb-nav md:pb-0">
      <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur-md md:px-8"><p className="text-xs text-muted-foreground">Local preview · fictional businesses · actions disabled</p><ThemeToggle /></header>
      {selected ? <BusinessOverview business={selected} previewMode /> : <PlatformOverview businesses={businesses} previewMode />}
    </main>
    <div className="md:hidden"><BottomNav isAdmin isPlatformOwner /></div>
  </div>;
}
