'use client';
import { browserClient, ensureSession, resetSession } from '@/lib/db/browser';
import type { AuthPort, LogOutDeps, PortUser } from '@/lib/auth/flows';

const toUser = (u: { id: string; email?: string | null; new_email?: string | null; is_anonymous?: boolean } | null | undefined): PortUser | null =>
  u ? { id: u.id, email: u.email ?? null, new_email: u.new_email ?? null, is_anonymous: u.is_anonymous === true } : null;

/** The real Supabase Auth client behind the AuthPort used by lib/auth/flows. */
export function browserAuthPort(): AuthPort {
  const auth = browserClient().auth;
  return {
    async getUser() {
      const { data } = await auth.getUser();
      return toUser(data.user);
    },
    async updateUser(attrs, options) {
      const { data, error } = await auth.updateUser(attrs, options);
      return { user: toUser(data.user), error };
    },
    async signUp({ email, password, emailRedirectTo }) {
      const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo } });
      return { hasSession: Boolean(data.session), error };
    },
    async signInWithPassword(input) {
      const { error } = await auth.signInWithPassword(input);
      return { error };
    },
    async resetPasswordForEmail(email, options) {
      const { error } = await auth.resetPasswordForEmail(email, options);
      return { error };
    },
    async saveDisplayName(name) {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: name }),
      }).catch(() => null);
      return Boolean(res?.ok);
    },
  };
}

export function browserLogOutDeps(): LogOutDeps {
  const auth = browserClient().auth;
  return {
    signOut: async (options) => ({ error: (await auth.signOut(options)).error }),
    resetSession,
    startGuest: ensureSession,
  };
}

/** How many Garments the current (guest) user has saved: RLS limits the count to their own rows. */
export async function savedPieceCount(): Promise<number> {
  const { count, error } = await browserClient().from('garments').select('id', { count: 'exact', head: true });
  return error ? 0 : count ?? 0;
}
