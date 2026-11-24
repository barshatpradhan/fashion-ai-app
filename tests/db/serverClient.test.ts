import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
const createServerClient = vi.fn(() => ({}));
vi.mock('@supabase/ssr', () => ({ createServerClient }));

describe('serverClient env', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    createServerClient.mockClear();
    for (const k of ['DEMO_KEY', 'DEMO_USER_ID', 'GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
  });
  afterEach(() => { process.env = { ...saved }; });

  // Regression: it validated the whole env, so every route 500'd until seed:demo had filled DEMO_USER_ID.
  it('needs only SUPABASE_URL and SUPABASE_ANON_KEY', async () => {
    const { serverClient } = await import('@/lib/db/server');
    await expect(serverClient()).resolves.toBeDefined();
    expect(createServerClient).toHaveBeenCalledWith('https://x.supabase.co', 'anon', expect.anything());
  });
});
