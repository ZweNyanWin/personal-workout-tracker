import Link from "next/link";
import { ArrowLeft, Building2, Users } from "lucide-react";
import { requireBusinessCoach } from "@/lib/business/access";
import { AddBusinessClient } from "@/components/business/business-controls";
import { BusinessStatusBadge } from "@/components/business/business-status";

export const dynamic = "force-dynamic";

export default async function MyBusinessPage() {
  const { supabase, user, access } = await requireBusinessCoach();
  const [organization, memberships] = await Promise.all([
    supabase.from("coach_organizations").select("id,name,status,plan,owner_user_id").eq("id", access.organizationId!).single(),
    supabase.from("coach_memberships").select("user_id,role,status").eq("organization_id", access.organizationId!),
  ]);
  if (!organization.data) throw new Error("Your coach business could not be loaded");
  const business = organization.data;
  const clients = memberships.data?.filter((m) => m.role === "client" && m.status === "active").length ?? 0;
  return <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
    <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Coach workspace</Link>
    <header className="flex items-start justify-between gap-3"><div><Building2 className="mb-3 h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">{business.name}</h1><p className="mt-2 text-sm text-muted-foreground">Your own client roster, training programs and Tommy workspace.</p></div><BusinessStatusBadge status={business.status} /></header>
    <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><p><strong>{clients}</strong> active clients</p></div><p className="mt-3 text-xs text-muted-foreground">Free testing plan · no payment required</p></div>
    {business.owner_user_id === user.id && <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-semibold">Add a client</h2><AddBusinessClient /></section>}
    <Link href="/admin/members" className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">View clients &amp; team</Link>
  </div>;
}
