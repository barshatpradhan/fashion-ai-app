import { describe, it, expect } from 'vitest';
import { accountView } from '@/lib/auth/account';

describe('accountView', () => {
  it('a guest is an anonymous user; no member-since date', () => {
    expect(accountView({ is_anonymous: true, created_at: '2026-11-01T00:00:00Z' }, null))
      .toEqual({ isGuest: true, displayName: null, memberSince: null });
  });
  it('an account shows its name and the day it was created', () => {
    expect(accountView({ is_anonymous: false, created_at: '2026-11-01T10:00:00Z' }, 'Ada'))
      .toEqual({ isGuest: false, displayName: 'Ada', memberSince: '2026-11-01T10:00:00Z' });
  });
  it('treats a missing is_anonymous flag as an account', () => {
    expect(accountView({ created_at: '2026-11-01T10:00:00Z' }, null).isGuest).toBe(false);
  });
});
