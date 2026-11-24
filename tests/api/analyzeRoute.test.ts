import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/db/server', () => ({ serverClient: async () => ({ auth: { getUser } }) }));
const runAnalyze = vi.fn();
vi.mock('@/lib/db/scans', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/scans')>()),
  runAnalyze: (...a: unknown[]) => runAnalyze(...a),
  defaultAnalyzeDeps: () => ({}),
}));

import { POST } from '@/app/api/analyze/route';

const req = () => new Request('http://x/api/analyze', { method: 'POST', body: JSON.stringify({ a: 1 }) });

describe('POST /api/analyze', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('401 when no user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('500 server_error JSON when the service throws', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    runAnalyze.mockRejectedValue(new Error('db down'));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
  });

  it('passes through service result', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    runAnalyze.mockResolvedValue({ status: 429, body: { error: 'daily_cap' } });
    const res = await POST(req());
    expect(res.status).toBe(429);
  });
});
