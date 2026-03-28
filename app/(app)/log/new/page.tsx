"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { startWorkout } from "@/lib/actions/workout";

// Quick-start redirect page: /log/new?session=<id>
export default function NewWorkoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session");

  useEffect(() => {
    if (!sessionId) {
      router.push("/workout");
      return;
    }

    startWorkout(sessionId).then((result) => {
      if (result.success) {
        router.replace(`/log/${result.data}`);
      } else {
        toast.error(result.error);
        router.push("/workout");
      }
    });
  }, [sessionId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground text-sm animate-pulse">Starting workout…</p>
    </div>
  );
}
