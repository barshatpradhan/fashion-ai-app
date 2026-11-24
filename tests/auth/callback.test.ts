import { describe, it, expect, vi } from 'vitest';
import { runAuthCallback, type CallbackAuth } from '@/lib/auth/callback';

const ORIGIN = 'http://localhost:3000';
const auth = (over: Partial<CallbackAuth> = {}): CallbackAuth => ({
  exchangeCodeForSession: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async () => ({ error: null })),
  ...over,
});
const run = (qs: string, a = auth()) => runAuthCallback(new URL(`${ORIGIN}/auth/callback${qs}`), a);

describe('runAuthCallback', () => {
  it('exchanges the code and goes to the safe next path', async () => {
    const a = auth();
    expect(await run('?code=abc&next=%2Freset-password', a)).toBe(`${ORIGIN}/reset-password`);
    expect(a.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('defaults to /closet without next', async () => {
    expect(await run('?code=abc')).toBe(`${ORIGIN}/closet`);
  });

  it('ignores an off-site next', async () => {
    expect(await run('?code=abc&next=https%3A%2F%2Fevil.example')).toBe(`${ORIGIN}/closet`);
    expect(await run('?code=abc&next=%2F%2Fevil.example')).toBe(`${ORIGIN}/closet`);
  });

  it('verifies a token_hash link (email templates that use {{ .TokenHash }})', async () => {
    const a = auth();
    expect(await run('?token_hash=th&type=recovery&next=%2Freset-password', a)).toBe(`${ORIGIN}/reset-password`);
    expect(a.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' });
  });

  it('rejects an unknown token type', async () => {
    const a = auth();
    expect(await run('?token_hash=th&type=magic-everything', a)).toBe(`${ORIGIN}/login?error=link`);
    expect(a.verifyOtp).not.toHaveBeenCalled();
  });

  it('sends a failed or missing link to /login?error=link (no personal data in the URL)', async () => {
    expect(await run('?code=abc', auth({ exchangeCodeForSession: async () => ({ error: new Error('expired') }) })))
      .toBe(`${ORIGIN}/login?error=link`);
    expect(await run('')).toBe(`${ORIGIN}/login?error=link`);
    expect(await run('?error=access_denied&error_description=Email+link+is+invalid')).toBe(`${ORIGIN}/login?error=link`);
  });

  it('a thrown exchange is a failed link, not a crash', async () => {
    expect(await run('?code=abc', auth({ exchangeCodeForSession: async () => { throw new Error('network'); } })))
      .toBe(`${ORIGIN}/login?error=link`);
  });
});
