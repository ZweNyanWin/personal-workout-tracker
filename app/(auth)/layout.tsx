import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg brand-glow">
          <Dumbbell className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">PowerBuild</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tracker</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          {children}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Private app — invite only
      </p>
    </div>
  );
}
