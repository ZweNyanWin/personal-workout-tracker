import Link from "next/link";
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteLogButton } from "@/components/history/delete-log-button";
import { formatMinutes, relativeDate, SESSION_BG_COLORS } from "@/lib/utils";
import { WORKOUT_HISTORY_PAGE_SIZE, workoutHistoryHref, workoutHistoryLogHref } from "@/lib/history/workout-history-query";
import type { WorkoutHistoryPageResult } from "@/lib/actions/workout-history";

export function WorkoutHistoryList({ history, preview = false, basePath = "/history" }: { history: WorkoutHistoryPageResult; preview?: boolean; basePath?: "/history" | "/preview/history" }) {
  const { logs, filters, totalCount, pageCount, isOwnHistory } = history;
  const hasFilters = !!(filters.q || filters.from || filters.to);
  const grouped = logs.reduce<Record<string, typeof logs>>((groups, log) => {
    const month = new Date(`${log.date}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    (groups[month] ??= []).push(log);
    return groups;
  }, {});
  const first = totalCount ? (filters.page - 1) * WORKOUT_HISTORY_PAGE_SIZE + 1 : 0;
  const fieldClass = "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      <form action={basePath} method="get" className="rounded-xl border border-border bg-card p-4 space-y-3" role="search" aria-label="Filter workout history">
        {filters.memberId && <input type="hidden" name="memberId" value={filters.memberId} />}
        <div>
          <label htmlFor="history-search" className="block text-xs font-medium mb-1.5">Search workouts</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input id="history-search" name="q" type="search" maxLength={80} defaultValue={filters.q} placeholder="Workout or session name" className={`${fieldClass} pl-9`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="history-from" className="block text-xs font-medium mb-1.5">From date</label><input id="history-from" name="from" type="date" defaultValue={filters.from} max={filters.to || undefined} className={fieldClass} /></div>
          <div><label htmlFor="history-to" className="block text-xs font-medium mb-1.5">To date</label><input id="history-to" name="to" type="date" defaultValue={filters.to} min={filters.from || undefined} className={fieldClass} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="brand" className="gap-1.5"><Search className="h-3.5 w-3.5" />Apply filters</Button>
          {hasFilters && <Button asChild size="sm" variant="ghost" className="gap-1.5"><Link href={workoutHistoryHref({ ...filters, q: "", from: "", to: "" }, 1, basePath)}><X className="h-3.5 w-3.5" />Clear</Link></Button>}
        </div>
      </form>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground" aria-live="polite">
        <p>{totalCount ? `Showing ${first}–${first + logs.length - 1} of ${totalCount} workouts` : "0 workouts"}</p><p>{WORKOUT_HISTORY_PAGE_SIZE} per page</p>
      </div>
      {!logs.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
          <p className="font-medium text-sm">{hasFilters ? "No workouts match these filters." : "No workouts yet."}</p>
          <p className="text-sm text-muted-foreground mt-1">{hasFilters ? "Try another name or a wider date range." : "Completed sessions will appear here."}</p>
        </div>
      ) : Object.entries(grouped).map(([month, monthLogs]) => (
        <section key={month} aria-label={month}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">{month}</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {monthLogs.map((log) => {
              const content = <>
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-medium">{log.title ?? "Workout"}</p>{log.session?.title && <Badge className={`${SESSION_BG_COLORS[log.session.title] ?? ""} text-[10px] py-0`} variant="outline">{log.session.title}</Badge>}</div>
                    <p className="text-xs text-muted-foreground">{relativeDate(log.date)}{log.duration_minutes ? ` · ${formatMinutes(log.duration_minutes)}` : ""}</p>
                  </div>
                  {!preview && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />}
                </>;
              const rowClass = "flex-1 flex items-center gap-3 px-4 py-3.5 min-w-0 tap-none";
              return <div key={log.id} className="flex items-center hover:bg-accent transition-colors">
                {preview ? <div className={rowClass}>{content}</div> : <Link href={workoutHistoryLogHref(log.id, filters)} className={rowClass}>{content}</Link>}
                {isOwnHistory && !preview && <div className="pr-3"><DeleteLogButton logId={log.id} /></div>}
              </div>
            })}
          </div>
        </section>
      ))}
      {pageCount > 1 && <nav aria-label="Workout history pages" className="flex items-center justify-between gap-3 border-t border-border pt-4">
        {filters.page > 1 ? <Button asChild size="sm" variant="outline"><Link href={workoutHistoryHref(filters, filters.page - 1, basePath)} rel="prev"><ChevronLeft className="h-4 w-4" />Previous</Link></Button> : <Button size="sm" variant="outline" disabled><ChevronLeft className="h-4 w-4" />Previous</Button>}
        <span className="text-xs text-muted-foreground">Page {filters.page} of {pageCount}</span>
        {filters.page < pageCount ? <Button asChild size="sm" variant="outline"><Link href={workoutHistoryHref(filters, filters.page + 1, basePath)} rel="next">Next<ChevronRight className="h-4 w-4" /></Link></Button> : <Button size="sm" variant="outline" disabled>Next<ChevronRight className="h-4 w-4" /></Button>}
      </nav>}
    </div>
  );
}
