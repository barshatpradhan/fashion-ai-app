import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, anonCalls: 0 }));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      signInAnonymously: async () => { h.anonCalls++; const id = `guest-${h.anonCalls}`; h.session = { user: { id } }; return { data: { user: { id } }, error: null }; },
    },
  }),
}));

describe('ensureSession / resetSession', () => {
  beforeEach(() => { vi.resetModules(); h.session = null; h.anonCalls = 0; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'k'; });

  it('memoises the user id, and resetSession makes the next call read the session again', async () => {
    const { ensureSession, resetSession } = await import('@/lib/db/browser');
    expect(await ensureSession()).toBe('guest-1');
    h.session = { user: { id: 'account-7' } }; // e.g. after logging in
    expect(await ensureSession()).toBe('guest-1'); // still memoised
    resetSession();
    expect(await ensureSession()).toBe('account-7');
  });
});
