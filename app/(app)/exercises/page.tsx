import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllExercises } from "@/lib/actions/admin";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus, Settings } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Exercises" };
export const dynamic = "force-dynamic";

const MUSCLE_COLORS: Record<string, string> = {
  chest: "bg-red-500/20 text-red-400 border-red-500/30",
  triceps: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  lats: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  quads: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  hamstrings: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  glutes: "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

export default async function ExercisesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const isAdmin = profile.role === "admin";
  const exercises = await getAllExercises(isAdmin);

  // Group by movement type
  const grouped = exercises.reduce((acc: Record<string, typeof exercises>, ex) => {
    const key = ex.movement_type ?? "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

  const ORDER = ["push", "pull", "squat", "hinge", "carry", "accessory", "other"];
  const LABELS: Record<string, string> = {
    push: "Push", pull: "Pull", squat: "Squat", hinge: "Hinge",
    carry: "Carry", accessory: "Accessory", other: "Other",
  };

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between px-4 border-b border-border bg-background/95 backdrop-blur-sm">
        <h1 className="text-base font-semibold">Exercise Library</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link href="/admin/exercises">
              <Button size="sm" variant="brand">
                <Plus className="h-4 w-4" />
                Add Exercise
              </Button>
            </Link>
            <Link href="/admin/programs">
              <Button size="sm" variant="outline">
                <Settings className="h-4 w-4" />
                Programs
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-2xl mx-auto w-full">
        {ORDER.filter((k) => grouped[k]?.length).map((type) => (
          <div key={type}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
              {LABELS[type]}
            </h3>
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {grouped[type].map((ex) => (
                <div key={ex.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{ex.name}</p>
                        {ex.is_compound && (
                          <Badge variant="brand" className="text-[10px] py-0">Compound</Badge>
                        )}
                        {ex.primary_lift && (
                          <Badge variant="outline" className="text-[10px] py-0 capitalize">
                            {ex.primary_lift}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {ex.muscle_groups.slice(0, 3).map((m) => (
                          <span
                            key={m}
                            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                              MUSCLE_COLORS[m] ?? "bg-secondary text-secondary-foreground border-transparent"
                            }`}
                          >
                            {m.replace("_", " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {ex.equipment ?? "—"}
                    </span>
                  </div>
                  {ex.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{ex.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {exercises.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No exercises in the library yet.</p>
            {isAdmin && (
              <Link href="/admin/exercises" className="mt-3 inline-block">
                <Button size="sm" variant="brand">
                  <Plus className="h-4 w-4" />
                  Add First Exercise
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
