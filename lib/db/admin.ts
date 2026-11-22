import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnvFor } from '@/lib/env';

/** Service role, bypasses RLS. Scripts, server-authored writes and credit spend only. */
export function adminClient(): SupabaseClient {
  // Per-use: scripts (kb:import, seed:demo) only need these two keys.
  const e = getEnvFor(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
