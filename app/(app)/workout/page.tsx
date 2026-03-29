import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SESSION_BG_COLORS } from "@/lib/utils";
import { Play, Eye } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Workout" };
export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const { data: assignment } = await supabase
    .from("user_program_assignments")
    .select("*, program:programs(*)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  let sessions: any[] = [];
  if (assignment) {
    const { data } = await supabase
      .from("program_sessions")
      .select("*, block:program_blocks(title), exercises:session_exercises(id)")
      .eq("program_id", assignment.program_id)
      .order("session_order", { ascending: true });
    sessions = data ?? [];
  }

  const currentIdx = assignment?.current_session_index ?? 0;
  const totalSessions = sessions.length;

  return (
    <div className="flex flex-col">
      <Header profile={profile} title="Your Program" />

      <div className="flex-1 p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
        {!assignment ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No program assigned yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Your coach will assign one soon.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{(assignment as any).program?.title}</h2>
                <p className="text-sm text-muted-foreground">
                  Session {(currentIdx % totalSessions) + 1} of {totalSessions} next
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {sessions.map((session, idx) => {
                const isNext = idx === currentIdx % totalSessions;
                const colorClass = SESSION_BG_COLORS[session.title] ?? "bg-primary/20 text-primary border-primary/30";

                return (
                  <div
                    key={session.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isNext ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={colorClass} variant="outline">
                            {session.title}
                          </Badge>
                          {isNext && (
                            <Badge variant="brand" className="text-[10px]">
                              Next
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {session.exercises?.length ?? 0} exercises
                          {session.block?.title ? ` · ${session.block.title}` : ""}
                        </p>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{session.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Link href={`/workout/${session.id}`}>
                          <Button variant="ghost" size="icon-sm">
                            <Eye className="h-5 w-5" />
                          </Button>
                        </Link>
                        {isNext && (
                          <Link href={`/log/new?session=${session.id}`}>
                            <Button size="sm" variant="brand">
                              <Play className="h-4 w-4" />
                              Start
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
