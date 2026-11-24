import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/db/server', () => ({ serverClient: async () => ({ auth: { getUser } }) }));
const runCorrect = vi.fn();
vi.mock('@/lib/db/corrections', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/corrections')>()),
  runCorrect: (...a: unknown[]) => runCorrect(...a),
  supabaseCorrectionRepo: () => ({}),
}));

import { POST } from '@/app/api/correct/route';

const req = (body = '{"a":1}') => new Request('http://x/api/correct', { method: 'POST', body });

describe('POST /api/correct', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('401 when no user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
  it('400 on malformed JSON', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(req('{nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });
  it('500 server_error JSON when the service throws', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    runCorrect.mockRejectedValue(new Error('db'));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
  });
  it('passes through service result and the user id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    runCorrect.mockResolvedValue({ status: 404, body: { error: 'not_found' } });
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(runCorrect.mock.calls[0][0]).toBe('u');
  });
});
