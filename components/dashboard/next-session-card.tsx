"use client";

import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  MessageCircle,
  Zap,
} from "lucide-react";
import { SESSION_BG_COLORS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProgramSession, UserProgramAssignment, Program } from "@/types";

interface NextSessionCardProps {
  session: ProgramSession | null;
  assignment: (UserProgramAssignment & { program: Program }) | null;
  totalSessions: number;
}

export function NextSessionCard({
  session,
  assignment,
  totalSessions,
}: NextSessionCardProps) {
  const router = useRouter();

  if (assignment?.status === "completed") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-5 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-5 w-5 text-success" />
          Block complete
        </h3>
        <p className="text-sm text-muted-foreground">
          You completed {assignment.program.title}. Your coach can review your
          logs and prepare your next block.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/workout")}
          >
            Review this program
          </Button>
          <Button size="sm" onClick={() => router.push("/coach")}>
            <MessageCircle className="h-3.5 w-3.5" />
            Ask Tommy
          </Button>
        </div>
      </div>
    );
  }

  if (!session || !assignment) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No active program assigned.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Ask your coach to assign a program.
        </p>
      </div>
    );
  }

  const colorClass =
    SESSION_BG_COLORS[session.title] ??
    "bg-primary/20 text-primary border-primary/30";
  const sessionNum = assignment.is_finite
    ? assignment.current_session_index + 1
    : (assignment.current_session_index % totalSessions) + 1;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-orange-500 to-orange-400" />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={colorClass} variant="outline">
                {session.title}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Session {sessionNum} of {totalSessions}
              </span>
            </div>
            <p className="text-xl font-bold truncate">
              {assignment.program.title}
            </p>
            {session.notes && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {session.notes}
              </p>
            )}
          </div>
          <div className="shrink-0">
            <Zap className="h-8 w-8 text-primary opacity-20" />
          </div>
        </div>

        <Button
          onClick={() => router.push(`/workout/${session.id}`)}
          className="w-full mt-4"
          size="lg"
          variant="brand"
        >
          <Eye className="h-4 w-4" />
          View Session
        </Button>

        <button
          onClick={() => router.push(`/workout`)}
          className="flex items-center justify-center gap-1 w-full mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors tap-none"
        >
          View all sessions
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
