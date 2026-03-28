import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllMembers } from "@/lib/actions/admin";
import { Header } from "@/components/layout/header";
import { Users, BookOpen, Dumbbell, ShieldCheck, ChevronRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/dashboard");

  const members = await getAllMembers();

  const stats = [
    { label: "Total Members", value: members.length, icon: Users },
    {
      label: "Active Plans",
      value: members.filter((m: any) => m.active_assignment).length,
      icon: BookOpen,
    },
  ];

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Admin" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Admin Dashboard</h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <Icon className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {[
            { href: "/admin/members",  icon: Users,    label: "Manage Members",       desc: "View and edit member plans" },
            { href: "/admin/programs", icon: BookOpen,  label: "Programs & Templates", desc: "Build and manage training programs" },
            { href: "/admin/exercises",icon: Dumbbell,  label: "Exercise Library",     desc: "Add or edit exercises" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-4 hover:bg-accent transition-colors tap-none"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>

        {/* Recent members */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            Members Overview
          </h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {members.map((m: any) => (
              <Link
                key={m.id}
                href={`/admin/members/${m.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors tap-none"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                  {(m.full_name ?? m.email)?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.full_name ?? m.email}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.active_assignment?.program?.title ?? "No program assigned"}
                    {m.last_workout ? ` · Last workout ${m.last_workout}` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
