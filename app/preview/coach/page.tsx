import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoachWorkspace } from "@/components/coach/coach-workspace";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { Profile } from "@/types";

export const metadata: Metadata = { title: "Coach Preview", robots: { index: false, follow: false } };

export default function CoachPreviewPage() {
  // Development-only, contains no private account data and performs no writes.
  if (process.env.NODE_ENV !== "development") notFound();
  const profile: Profile = { id: "preview", email: "preview@example.invalid", full_name: "Local preview",
    username: null, avatar_url: null, role: "member", created_at: "", updated_at: "" };
  return (
    <div className="flex h-dvh bg-background safe-top safe-left safe-right">
      <div className="hidden md:flex md:shrink-0"><Sidebar profile={profile} previewMode /></div>
      <main className="min-w-0 flex-1 overflow-y-auto pb-nav md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-md md:px-8"><span className="text-base font-semibold">AI Coach</span><ThemeToggle /></header>
        <CoachWorkspace />
      </main>
      <div className="md:hidden"><BottomNav previewMode /></div>
    </div>
  );
}
