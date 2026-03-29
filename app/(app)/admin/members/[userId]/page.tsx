import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMemberDetail, assignProgram, updateMemberRole, getAllPrograms } from "@/lib/actions/admin";
import type { Tables } from "@/types/database";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInitials, relativeDate, formatMinutes, SESSION_BG_COLORS } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2, ChevronRight, Pencil, History } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Member Detail" };
export const dynamic = "force-dynamic";

export default async function MemberDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "admin") redirect("/dashboard");

  const [detail, programs] = await Promise.all([
    getMemberDetail(userId),
    getAllPrograms(),
  ]);

  if (!detail.profile) redirect("/admin/members");

  const member = detail.profile as Tables<"profiles">;
  const assignments = (detail.assignments ?? []) as any[];
  const recentLogs = (detail.recentLogs ?? []) as any[];
  const activeAssignment = assignments.find((a: any) => a.is_active);

  return (
    <div className="flex flex-col">
      <Header profile={adminProfile} title="Member Detail" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-2xl mx-auto w-full">
        {/* Member card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg bg-primary/20 text-primary">
                {getInitials(member!.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-bold">{member!.full_name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{member!.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={member!.role === "admin" ? "brand" : "secondary"} className="capitalize text-[10px]">
                  {member!.role}
                </Badge>
                <span className="text-xs text-muted-foreground">@{member!.username ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Current program */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Active Program</h3>
          {activeAssignment ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{(activeAssignment as any).program?.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Session index: {activeAssignment.current_session_index}
                </p>
              </div>
              <Link href={`/admin/programs/${activeAssignment.program_id}`}>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Program
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No program assigned</p>
          )}

          {/* Assign program */}
          <form className="mt-3">
            <input type="hidden" name="userId" value={userId} />
            <div className="flex gap-2">
              <select
                name="programId"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                defaultValue={activeAssignment?.program_id ?? ""}
              >
                <option value="">Select program…</option>
                {programs.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <Button
                formAction={async (fd: FormData) => {
                  "use server";
                  const pid = fd.get("programId") as string;
                  if (pid) await assignProgram(userId, pid);
                }}
                type="submit"
                size="sm"
                variant="brand"
              >
                Assign
              </Button>
            </div>
          </form>
        </div>

        {/* Recent logs */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            Recent Workouts
          </h3>
          {recentLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No workouts recorded.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {recentLogs.slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{log.title ?? "Workout"}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeDate(log.date)}
                      {log.duration_minutes ? ` · ${formatMinutes(log.duration_minutes)}` : ""}
                    </p>
                  </div>
                  {log.session?.title && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${SESSION_BG_COLORS[log.session.title] ?? ""}`}
                    >
                      {log.session.title}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Program assignment history */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            Program History
          </h3>
          {assignments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No programs assigned yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {assignments.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <History className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.program?.title ?? "Unknown program"}</p>
                    <p className="text-xs text-muted-foreground">
                      Assigned {relativeDate(a.created_at?.split("T")[0])}
                      {" · "}Session {a.current_session_index}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.is_active && (
                      <Badge variant="brand" className="text-[10px]">Active</Badge>
                    )}
                    <Link href={`/admin/programs/${a.program_id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
