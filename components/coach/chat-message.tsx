import type { ReactNode } from "react";
import { LoaderCircle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function TommyAvatar({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white", className)}>T</span>;
}

export function TommyChatHeading() {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <TommyAvatar className="h-10 w-10 text-base" />
      <div className="min-w-0">
        <h2 className="font-semibold">Talk with Tommy</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your experimental AI coach, running on your Mac.</p>
      </div>
    </div>
  );
}

export function ChatMessage({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex min-w-0", isUser ? "justify-end" : "justify-start")} data-chat-role={role}>
      <article className={cn(
        "min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "max-w-[90%] rounded-br-sm bg-primary text-primary-foreground shadow-sm dark:bg-red-700 sm:max-w-[85%]"
          : "max-w-[96%] rounded-bl-sm border border-teal-200 bg-teal-50 text-teal-950 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-50 sm:max-w-[94%]",
      )}>
        <div className="mb-2 flex items-center gap-2">
          {isUser
            ? <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15"><UserRound className="h-3.5 w-3.5" /></span>
            : <TommyAvatar />}
          <p className="text-xs font-semibold">{isUser ? "You" : "Tommy"}</p>
          {!isUser && <span className="rounded-full border border-teal-200 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 dark:border-teal-700 dark:text-teal-200">AI coach</span>}
        </div>
        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</div>
      </article>
    </div>
  );
}

export function TommyThinking({ sending, elapsed, children }: { sending: boolean; elapsed: number; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-800 dark:bg-teal-950/40">
      <div className="flex min-w-0 items-center gap-2.5" role="status">
        <TommyAvatar />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-teal-950 dark:text-teal-50"><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />{sending ? "Sending to Tommy…" : "Tommy is thinking…"}</p>
          <p className="mt-0.5 text-[11px] text-teal-800 dark:text-teal-200" aria-hidden="true">{elapsed}s elapsed</p>
        </div>
      </div>
      {children}
    </div>
  );
}
