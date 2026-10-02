import { cn } from "@/lib/utils";

export function BusinessStatusBadge({ status }: { status: "trial" | "active" | "paused" }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", status === "paused" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : status === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300")}>{status === "trial" ? "Testing" : status === "active" ? "Active" : "Paused"}</span>;
}
