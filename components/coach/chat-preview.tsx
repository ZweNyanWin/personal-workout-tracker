import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChatMessage, TommyChatHeading, TommyThinking } from "@/components/coach/chat-message";

const SAMPLE_MESSAGES = [
  { role: "user" as const, content: "Hi Tommy! Can you help me think through my next four weeks of training?" },
  { role: "assistant" as const, content: "Hi! Let’s start with the details that would shape your block.\n\n1. What are you working toward?\n2. How many days can you train each week?\n3. Which equipment do you have?\n4. What did your recent sessions look like?\n\nShare what you know, and flag anything you’re unsure about. We can talk through the options together." },
  { role: "user" as const, content: "I have three days a week and a barbell. I’d like to spend more time on technique." },
  { role: "assistant" as const, content: "That gives us a starting point. Tell me which lifts you’re practicing and the sets, reps, and effort from a recent session.\n\nFor a week-by-week plan, I’d also ask:\n\n• Which days can you usually train?\n• Which parts of each lift feel inconsistent?\n• How long can each session be?\n• Are there any movements you currently avoid?\n\nI don’t have your saved workout history here, so I’ll use the details you share in this conversation." },
];

export function ChatPreview({ stress = false }: { stress?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-6 md:p-8">
      <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">Local layout preview. This conversation is an authored example, not model output or your workout history. No messages are sent.</p>
      <div className="min-w-0 rounded-2xl border border-border bg-card p-5 md:p-6">
        <TommyChatHeading />
        <div className="my-5 space-y-5" role="log" aria-label="Example conversation with Tommy">
          {SAMPLE_MESSAGES.map((message, index) => <ChatMessage key={index} {...message} />)}
          {stress && <ChatMessage role="assistant" content={`Long-word layout check:\n${"training-note-".repeat(30)}\n\n${"This is additional authored preview text to check how long replies wrap on a small phone screen. ".repeat(12)}`} />}
          <ChatMessage role="user" content="Can we include a technique-focused session?" />
        </div>
        <TommyThinking sending={false} elapsed={17}><Button type="button" variant="outline" size="sm" disabled><Square className="h-3 w-3" />Stop</Button></TommyThinking>
        <div className="space-y-2">
          <Label htmlFor="preview-coach-question">Message Tommy</Label>
          <textarea id="preview-coach-question" placeholder="Ask Tommy about your training…" readOnly rows={3} className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed md:text-sm" />
          <div className="flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">Preview only</p><Button type="button" disabled><Send className="h-4 w-4" />Send</Button></div>
        </div>
      </div>
    </div>
  );
}
