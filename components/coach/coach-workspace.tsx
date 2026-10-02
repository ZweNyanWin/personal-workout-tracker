"use client";

import Link from "next/link";
import { ClipboardList, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachChat } from "@/components/coach/coach-chat";

export function CoachWorkspace() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-6 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ClipboardList className="h-3.5 w-3.5" />
            Today&apos;s workout
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/history">
            <History className="h-3.5 w-3.5" />
            Completed sessions
          </Link>
        </Button>
      </div>
      <CoachChat active />
      {process.env.NODE_ENV === "development" && (
        <p className="text-xs">
          <Link
            href="/preview/ollama"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Local model status and training
          </Link>
        </p>
      )}
    </div>
  );
}
