import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/** Browser Supabase client (anon key, cookie session shared with the API routes); RLS applies. */
export function browserClient(): SupabaseClient {
  if (client) return client;
  // Literal process.env.NEXT_PUBLIC_* references so Next inlines them at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  client = createBrowserClient(url, key);
  return client;
}

let session: Promise<string> | undefined;

/**
 * Resolves the signed-in user's id, starting an anonymous session on first visit (no sign-up wall).
 * Memoised so a double-mounted effect never creates two anonymous users.
 */
export function ensureSession(): Promise<string> {
  session ??= (async () => {
    const sb = browserClient();
    const { data } = await sb.auth.getSession();
    if (data.session?.user) return data.session.user.id;
    const res = await sb.auth.signInAnonymously();
    if (res.error || !res.data.user) throw res.error ?? new Error('anonymous sign-in failed');
    return res.data.user.id;
  })().catch((err) => {
    session = undefined; // allow a retry
    throw err;
  });
  return session;
}

/** Forget the memoised user id: call after logging in or out so ensureSession() reads the new session. */
export function resetSession(): void {
  session = undefined;
}
