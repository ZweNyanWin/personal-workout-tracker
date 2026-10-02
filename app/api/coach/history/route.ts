import { createClient } from "@/lib/supabase/server";
import { buildClientContext } from "@/lib/coach/context";
import { coachJson } from "@/lib/coach/gateway-client";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const supabase = await createClient({ signal: AbortSignal.timeout(12000) });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError && (authError.name === "AuthRetryableFetchError" || !authError.status || authError.status >= 500 || authError.status === 429)) throw new Error("Sign-in service unavailable");
    if (authError || !user) return coachJson({ error: "Sign in to view your conversation." }, 401);
    const [history, context] = await Promise.all([
      supabase.from("coach_chat_turns").select("question,answer,created_at").eq("user_id", user.id)
        .not("answer", "is", null).order("created_at", { ascending: false }).limit(30),
      buildClientContext(user.id, supabase),
    ]);
    if (history.error) throw new Error("History unavailable");
    const messages = (history.data ?? []).reverse().flatMap((turn) => [
      { role: "user", content: turn.question }, { role: "assistant", content: turn.answer },
    ]);
    return coachJson({ messages, context: context.summary });
  } catch { return coachJson({ error: "Could not load your saved conversation and program. Please retry." }, 503); }
}
