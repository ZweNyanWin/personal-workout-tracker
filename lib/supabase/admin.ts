import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Only server routes with their own authenticated identity checks may use this client. */
export function createAdminClient({ signal }: { signal?: AbortSignal } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The server database client is not configured");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(signal ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      signal.throwIfAborted();
      const incoming = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return fetch(input, { ...init, signal: incoming ? AbortSignal.any([signal, incoming]) : signal });
    } } } : {}),
  });
}
