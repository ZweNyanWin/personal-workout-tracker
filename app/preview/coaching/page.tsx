import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberCoachingWorkspace } from "@/components/coaching/coaching-workspace";
import { createExampleBlock } from "@/lib/coach/program";
import type { CoachingDraftRecord } from "@/lib/coach/workflow-schema";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = {
  title: "Coaching workflow preview",
  robots: { index: false, follow: false },
};

export default function CoachingWorkflowPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const content = createExampleBlock(4, 3, "gym");
  content.title = "Technique block · authored preview";
  const draft: CoachingDraftRecord = {
    id: "preview-draft",
    member_id: "preview",
    coach_id: "preview",
    brief:
      "Four weeks, three nonconsecutive days. Practice familiar barbell technique, preserve exact exercise variations, and use completed performance to select starting loads.",
    scope: { startWeek: 1, weekCount: 4, daysPerWeek: 3 },
    content,
    revision: 1,
    status: "draft",
    generation_job_id: null,
    generation_revision: null,
    assignment_id: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  return (
    <main className="min-h-dvh bg-background safe-top safe-left safe-right">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-8">
        <h1 className="text-base font-semibold">Client coaching workflow</h1>
        <ThemeToggle />
      </header>
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <MemberCoachingWorkspace
          memberId="preview"
          hasActiveProgram
          previewData={{
            drafts: [draft],
            profile: {
              member_id: "preview",
              training_context:
                "Adult athlete, three days per week, gym equipment. This is fictional UI data.",
              coach_rules:
                "Preserve exercise variations and review load changes before assignment.",
              nutrition_targets: "",
            },
          }}
        />
      </div>
    </main>
  );
}
