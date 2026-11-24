import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnvFor } from '@/lib/env';

/** Acts as the signed-in user (cookie session); RLS applies. */
export async function serverClient(): Promise<SupabaseClient> {
  // Per-use: routes must not depend on DEMO_* or AI keys just to read the session.
  const e = getEnvFor(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  const store = await cookies();
  return createServerClient(e.SUPABASE_URL, e.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; safe to ignore.
        }
      },
    },
  });
}
