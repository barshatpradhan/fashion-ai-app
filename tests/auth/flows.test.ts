import { describe, it, expect, vi } from 'vitest';
import {
  passwordRules, validateSignup, signUp, logIn, requestPasswordReset, changePassword, setNewPassword,
  LOGIN_ERROR, type AuthPort,
} from '@/lib/auth/flows';

const ORIGIN = 'http://localhost:3000';
type User = { id: string; email?: string | null; is_anonymous?: boolean };
const err = (status: number, code: string) => ({ status, code, message: `${code} (provider text)` });

function port(user: User | null, over: Partial<AuthPort> = {}): AuthPort {
  return {
    getUser: vi.fn(async () => user),
    updateUser: vi.fn(async (attrs: { email?: string; password?: string }) => ({ user: { ...user!, ...attrs.email ? { new_email: attrs.email } : {} } as User, error: null })),
    signUp: vi.fn(async () => ({ hasSession: false, error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    saveDisplayName: vi.fn(async () => true),
    ...over,
  };
}

describe('passwordRules', () => {
  it('is met at 8 characters, not at 7', () => {
    expect(passwordRules('1234567')).toEqual([{ id: 'length', label: 'At least 8 characters', met: false }]);
    expect(passwordRules('12345678')[0].met).toBe(true);
  });
});

describe('validateSignup', () => {
  const ok = { email: 'a@b.co', password: 'longenough', confirm: 'longenough', displayName: 'Ada' };
  it('accepts a valid form', () => expect(validateSignup(ok)).toEqual({}));
  it('puts each problem on its own field', () => {
    expect(validateSignup({ email: 'nope', password: 'short', confirm: 'other', displayName: ' ' })).toEqual({
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
      confirm: 'Passwords do not match.',
      displayName: 'Enter a name to show on your profile.',
    });
  });
});

describe('signUp: a guest becomes an account, keeping the same user id', () => {
  const input = { email: 'ada@example.test', password: 'longenough', displayName: 'Ada' };

  it('links the email to the anonymous user (updateUser), never creating a new user', async () => {
    const p = port({ id: 'guest-1', is_anonymous: true });
    const r = await signUp(input, p, ORIGIN);
    expect(p.signUp).not.toHaveBeenCalled();
    expect(p.updateUser).toHaveBeenCalledWith({ email: input.email }, { emailRedirectTo: `${ORIGIN}/auth/callback?next=%2Fsignup%2Fcomplete` });
    expect(p.saveDisplayName).toHaveBeenCalledWith('Ada');
    expect(r).toEqual({ kind: 'check_email' });
  });

  it('when confirmation is off and the email applies at once, sets the password in the same step', async () => {
    const p = port({ id: 'guest-1', is_anonymous: true }, {
      updateUser: vi.fn(async (attrs: { email?: string; password?: string }) => ({
        user: { id: 'guest-1', is_anonymous: false, email: attrs.email ?? 'ada@example.test' }, error: null,
      })),
    });
    expect(await signUp(input, p, ORIGIN)).toEqual({ kind: 'done' });
    expect(p.updateUser).toHaveBeenNthCalledWith(2, { password: 'longenough' });
  });

  it('the display name is saved before the email link (so it survives the round-trip)', async () => {
    const order: string[] = [];
    const p = port({ id: 'guest-1', is_anonymous: true }, {
      saveDisplayName: vi.fn(async () => { order.push('name'); return true; }),
      updateUser: vi.fn(async () => { order.push('email'); return { user: { id: 'guest-1', is_anonymous: true }, error: null }; }),
    });
    await signUp(input, p, ORIGIN);
    expect(order).toEqual(['name', 'email']);
  });

  it('an email already in use gets a neutral message, never the provider text', async () => {
    const p = port({ id: 'guest-1', is_anonymous: true }, {
      updateUser: vi.fn(async () => ({ user: null, error: err(422, 'email_exists') })),
    });
    expect(await signUp(input, p, ORIGIN)).toEqual({ kind: 'error', field: 'email', message: "We couldn't use that email. If you already have an account, log in instead." });
  });

  it('rate limiting says to wait, without revealing anything', async () => {
    const p = port({ id: 'guest-1', is_anonymous: true }, {
      updateUser: vi.fn(async () => ({ user: null, error: err(429, 'over_email_send_rate_limit') })),
    });
    expect(await signUp(input, p, ORIGIN)).toEqual({ kind: 'error', field: null, message: 'Too many attempts. Wait a minute and try again.' });
  });

  it('with no session at all, signs up a new user', async () => {
    const p = port(null);
    expect(await signUp(input, p, ORIGIN)).toEqual({ kind: 'check_email' });
    expect(p.signUp).toHaveBeenCalledWith({ email: input.email, password: input.password, emailRedirectTo: `${ORIGIN}/auth/callback?next=%2Fsignup%2Fcomplete` });
  });

  it('an existing account is told it is already signed in', async () => {
    const p = port({ id: 'u-1', is_anonymous: false, email: 'x@y.z' });
    expect(await signUp(input, p, ORIGIN)).toEqual({ kind: 'already_signed_in' });
    expect(p.updateUser).not.toHaveBeenCalled();
  });
});

describe('logIn: one generic error', () => {
  it.each([
    [err(400, 'invalid_credentials')],
    [err(400, 'email_not_confirmed')],
    [err(422, 'user_banned')],
    [err(500, 'unexpected_failure')],
  ])('%j -> the same message', async (e) => {
    const p = port(null, { signInWithPassword: vi.fn(async () => ({ error: e })) });
    expect(await logIn('a@b.co', 'whatever1', p)).toEqual({ ok: false, message: LOGIN_ERROR });
  });
  it('LOGIN_ERROR never says which part was wrong', () => {
    expect(LOGIN_ERROR).toBe('That email and password do not match. Try again or reset your password.');
  });
  it('rate limiting asks to wait', async () => {
    const p = port(null, { signInWithPassword: vi.fn(async () => ({ error: err(429, 'over_request_rate_limit') })) });
    expect(await logIn('a@b.co', 'x', p)).toEqual({ ok: false, message: 'Too many attempts. Wait a minute and try again.' });
  });
  it('success', async () => {
    expect(await logIn('a@b.co', 'longenough', port(null))).toEqual({ ok: true });
  });
});

describe('requestPasswordReset: always the same answer', () => {
  it.each([[null], [err(400, 'user_not_found')], [err(429, 'over_email_send_rate_limit')], [err(500, 'x')]])(
    'provider result %j -> "sent"', async (e) => {
      const p = port(null, { resetPasswordForEmail: vi.fn(async () => ({ error: e })) });
      expect(await requestPasswordReset('a@b.co', p, ORIGIN)).toBe('sent');
      expect(p.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', { redirectTo: `${ORIGIN}/auth/callback?next=%2Freset-password` });
    },
  );
  it('a thrown network error is still "sent"', async () => {
    const p = port(null, { resetPasswordForEmail: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await requestPasswordReset('a@b.co', p, ORIGIN)).toBe('sent');
  });
});

describe('changePassword: re-authenticate first', () => {
  const me = { id: 'u-1', is_anonymous: false, email: 'ada@example.test' };
  it('checks the current password with signInWithPassword, then sets the new one', async () => {
    const p = port(me);
    expect(await changePassword('oldpassword', 'newpassword', p)).toEqual({ ok: true });
    expect(p.signInWithPassword).toHaveBeenCalledWith({ email: me.email, password: 'oldpassword' });
    expect(p.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });
  it('a wrong current password stops before any change', async () => {
    const p = port(me, { signInWithPassword: vi.fn(async () => ({ error: err(400, 'invalid_credentials') })) });
    expect(await changePassword('wrong', 'newpassword', p)).toEqual({ ok: false, field: 'current', message: 'Your current password is not right.' });
    expect(p.updateUser).not.toHaveBeenCalled();
  });
  it('the new password must follow the rules', async () => {
    const p = port(me);
    expect(await changePassword('oldpassword', 'short', p)).toEqual({ ok: false, field: 'next', message: 'Use at least 8 characters.' });
    expect(p.signInWithPassword).not.toHaveBeenCalled();
  });
  it('the same password as before is refused clearly', async () => {
    const p = port(me, { updateUser: vi.fn(async () => ({ user: null, error: err(422, 'same_password') })) });
    expect(await changePassword('oldpassword', 'oldpassword', p)).toEqual({ ok: false, field: 'next', message: 'Choose a password you have not used here before.' });
  });
});

describe('setNewPassword (reset page and sign-up completion)', () => {
  it('needs a signed-in, non-guest user (the email link signed them in)', async () => {
    expect(await setNewPassword('newpassword', port({ id: 'g', is_anonymous: true }))).toEqual({ ok: false, field: null, message: 'This link has expired or was already used. Ask for a new one.' });
    expect(await setNewPassword('newpassword', port(null))).toEqual({ ok: false, field: null, message: 'This link has expired or was already used. Ask for a new one.' });
  });
  it('sets the password', async () => {
    const p = port({ id: 'u', is_anonymous: false, email: 'a@b.co' });
    expect(await setNewPassword('newpassword', p)).toEqual({ ok: true });
    expect(p.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });
});

import { logOut } from '@/lib/auth/flows';
describe('logOut', () => {
  it('signs out, forgets the cached user, then starts a fresh guest', async () => {
    const order: string[] = [];
    const deps = {
      signOut: vi.fn(async () => { order.push('signOut'); return { error: null }; }),
      resetSession: vi.fn(() => { order.push('reset'); }),
      startGuest: vi.fn(async () => { order.push('guest'); return 'guest-2'; }),
    };
    await logOut(deps);
    expect(order).toEqual(['signOut', 'reset', 'guest']);
  });
  it('if the global sign-out fails (offline), still signs this browser out locally', async () => {
    const signOut = vi.fn(async (o?: { scope: 'local' }) => ({ error: o ? null : { status: 0, code: 'network' } }));
    const deps = { signOut, resetSession: vi.fn(), startGuest: vi.fn(async () => 'g') };
    await logOut(deps);
    expect(signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(deps.startGuest).toHaveBeenCalled();
  });
});
