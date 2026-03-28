import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllMembers } from "@/lib/actions/admin";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { relativeDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
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

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Members" />

      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-4">
        <p className="text-sm text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>

        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {members.map((m: any) => (
            <Link
              key={m.id}
              href={`/admin/members/${m.id}`}
              className="flex items-center gap-3 px-4 py-4 hover:bg-accent transition-colors tap-none"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
                {(m.full_name ?? m.email)?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{m.full_name ?? "—"}</p>
                  <Badge variant={m.role === "admin" ? "brand" : "secondary"} className="text-[10px] py-0 capitalize">
                    {m.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {m.active_assignment
                    ? `📋 ${m.active_assignment.program?.title}`
                    : "No program"}
                  {m.last_workout ? ` · ${relativeDate(m.last_workout)}` : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
