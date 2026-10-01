import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient({ signal }: { signal?: AbortSignal } = {}) {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(signal ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        // A late SDK retry must not send another request after the route deadline.
        signal.throwIfAborted();
        const incoming = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        return fetch(input, { ...init, signal: incoming ? AbortSignal.any([signal, incoming]) : signal });
      } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // A timed-out refresh must not mutate cookies after the response was sent.
          if (signal?.aborted) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — safe to ignore
          }
        },
      },
    }
  );
}
