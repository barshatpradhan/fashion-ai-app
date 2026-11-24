import { describe, it, expect, vi } from 'vitest';
import { normalizeDisplayName, runProfileUpdate, DISPLAY_NAME_MAX } from '@/lib/auth/profileUpdate';

describe('normalizeDisplayName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toEqual({ ok: true, value: 'Ada Lovelace' });
  });
  it(`accepts exactly ${60} characters and rejects 61`, () => {
    expect(DISPLAY_NAME_MAX).toBe(60);
    expect(normalizeDisplayName('a'.repeat(60))).toEqual({ ok: true, value: 'a'.repeat(60) });
    expect(normalizeDisplayName('a'.repeat(61))).toEqual({ ok: false, error: 'too_long' });
  });
  it('counts characters, not UTF-16 units (accented and emoji names)', () => {
    expect(normalizeDisplayName('é'.repeat(60)).ok).toBe(true);
    expect(normalizeDisplayName('🙂'.repeat(60)).ok).toBe(true);
  });
  it.each([[''], ['   '], [null], [undefined], [42], [{}]])('rejects empty or non-text %j', (v) => {
    expect(normalizeDisplayName(v)).toEqual({ ok: false, error: 'required' });
  });
  it('rejects control characters', () => {
    expect(normalizeDisplayName('Ada\u0000')).toEqual({ ok: false, error: 'invalid' });
    expect(normalizeDisplayName('A​da')).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('runProfileUpdate', () => {
  const repo = () => ({ setDisplayName: vi.fn(async () => {}) });

  it('saves a valid display name for the caller only', async () => {
    const r = repo();
    expect(await runProfileUpdate('user-1', { display_name: ' Ada ' }, r)).toEqual({ status: 200, body: { displayName: 'Ada' } });
    expect(r.setDisplayName).toHaveBeenCalledWith('user-1', 'Ada');
  });

  it.each([
    [{ display_name: 'Ada', is_premium: true }],
    [{ display_name: 'Ada', is_demo: true }],
    [{ is_premium: true }],
    [{ display_name: 'Ada', id: 'someone-else' }],
    [{ display_name: 'Ada', upload_credits: 999 }],
  ])('refuses any field other than display_name: %j', async (input) => {
    const r = repo();
    expect(await runProfileUpdate('user-1', input, r)).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(r.setDisplayName).not.toHaveBeenCalled();
  });

  it('reports why a name is invalid', async () => {
    const r = repo();
    expect(await runProfileUpdate('user-1', { display_name: 'x'.repeat(61) }, r)).toEqual({ status: 400, body: { error: 'too_long' } });
    expect(await runProfileUpdate('user-1', null, r)).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(r.setDisplayName).not.toHaveBeenCalled();
  });
});
