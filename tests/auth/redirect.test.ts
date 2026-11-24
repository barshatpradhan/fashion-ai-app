import { describe, it, expect } from 'vitest';
import { safeNextPath, isSessionRefreshPath } from '@/lib/auth/redirect';

describe('safeNextPath', () => {
  it.each([
    ['/scan', '/scan'],
    ['/closet', '/closet'],
    ['/guide/abc/def?x=1', '/guide/abc/def?x=1'],
    ['/profile#account', '/profile'],
  ])('keeps the same-origin path %s', (raw, want) => {
    expect(safeNextPath(raw)).toBe(want);
  });

  it.each([
    [null], [undefined], [''],
    ['https://evil.example'], ['http://localhost:3000/closet'],
    ['//evil.example'], ['//evil.example/closet'],
    ['/\\evil.example'], ['\\\\evil.example'], ['/%5Cevil.example'], ['/%2F%2Fevil.example'],
    ['javascript:alert(1)'], ['data:text/html,x'],
    ['closet'], [' /closet'], ['/clo\nset'], ['/clo\tset'],
  ])('falls back to /closet for %j', (raw) => {
    expect(safeNextPath(raw as string | null | undefined)).toBe('/closet');
  });

  it('uses the given fallback', () => {
    expect(safeNextPath('https://evil.example', '/profile')).toBe('/profile');
  });

  it('never sends the user back into the auth callback', () => {
    expect(safeNextPath('/auth/callback?code=x')).toBe('/closet');
  });
});

describe('isSessionRefreshPath (middleware)', () => {
  it.each(['/', '/scan', '/closet', '/profile', '/api/closet', '/auth/callback'])('refreshes on %s', (p) => {
    expect(isSessionRefreshPath(p)).toBe(true);
  });
  it.each(['/api/cron/keepalive', '/_next/static/x.js', '/_next/image', '/favicon.ico', '/hero.png', '/a/b.webp', '/f.svg', '/f.jpg'])(
    'skips %s', (p) => {
      expect(isSessionRefreshPath(p)).toBe(false);
    },
  );
});
