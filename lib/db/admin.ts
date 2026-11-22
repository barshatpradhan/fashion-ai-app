import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

/** Service role, bypasses RLS. Scripts, server-authored writes and credit spend only. */
export function adminClient(): SupabaseClient {
  const e = getEnv();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
