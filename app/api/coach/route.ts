import { createClient } from "@/lib/supabase/server";
import { createCoachHandler } from "@/lib/coach/relay";
import { buildClientContext } from "@/lib/coach/context";

export const runtime = "nodejs";
export const maxDuration = 30;

const handle = createCoachHandler({
  authenticate: async (_request, signal) => {
    const supabase = await createClient({ signal });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error && (error.name === "AuthRetryableFetchError" || !error.status || error.status === 429 || error.status >= 500)) throw new Error("Auth service unavailable");
    if (error || !user) return null;
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("id", user.id).single();
    if (profileError && profileError.code !== "PGRST116") throw new Error("Profile verification unavailable");
    if (profileError || !profile) return null;
    return { id: user.id };
  },
  config: () => ({
    url: process.env.COACH_GATEWAY_URL,
    token: process.env.COACH_GATEWAY_TOKEN,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    development: process.env.NODE_ENV === "development",
  }),
  context: async (userId, question) => {
    const context = await buildClientContext(userId, undefined, { question });
    return { text: context.text, assignmentId: context.summary.assignmentId };
  },
  accepted: async (userId, jobId, question, assignmentId) => {
    const supabase = await createClient();
    const { error } = await supabase.from("coach_chat_turns").insert({ user_id: userId, job_id: jobId, question, assignment_id: assignmentId });
    if (error) throw new Error("Chat could not be saved");
  },
  completed: async (userId, jobId, answer) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("coach_chat_turns").update({ answer })
      .eq("user_id", userId).eq("job_id", jobId).is("answer", null).select("id");
    if (error) throw new Error("Chat could not be saved");
    if (!data?.length) {
      const { data: existing } = await supabase.from("coach_chat_turns").select("id").eq("user_id", userId).eq("job_id", jobId).not("answer", "is", null).maybeSingle();
      if (!existing) throw new Error("Unknown conversation request");
    }
  },
});

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
