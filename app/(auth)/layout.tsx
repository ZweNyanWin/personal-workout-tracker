import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="fixed right-4 top-4 z-10 safe-top">
        <ThemeToggle />
      </div>

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary shadow-lg brand-glow">
          <Dumbbell className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">PowerBuild</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tracker</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-card p-6 shadow-xl shadow-black/5 dark:shadow-black/20">
          {children}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Private training workspace. Invite-only access.
      </p>
    </div>
  );
}
