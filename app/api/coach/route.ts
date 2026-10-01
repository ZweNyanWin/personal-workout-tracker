import { createClient } from "@/lib/supabase/server";
import { createCoachHandler } from "@/lib/coach/relay";

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
});

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
