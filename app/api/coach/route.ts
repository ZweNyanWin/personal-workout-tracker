import { createClient } from "@/lib/supabase/server";
import { createCoachHandler } from "@/lib/coach/relay";

export const runtime = "nodejs";
export const maxDuration = 30;

const handle = createCoachHandler({
  authenticate: async () => {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("id", user.id).single();
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
