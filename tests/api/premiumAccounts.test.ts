import { describe, it, expect, vi } from 'vitest';
import { runPremiumAction, type PremiumRepo } from '@/lib/db/premium';

function repo(isPremium = false, isDemo = false) {
  const r: PremiumRepo = {
    getFlags: vi.fn(async () => ({ isPremium, isDemo })),
    setPremium: vi.fn(async () => {}),
  };
  return r;
}

describe('runPremiumAction with accounts', () => {
  it('a guest must sign up before upgrading: 403 signup_required, nothing written', async () => {
    const r = repo();
    expect(await runPremiumAction('guest-1', { action: 'upgrade' }, r, { isGuest: true }))
      .toEqual({ status: 403, body: { error: 'signup_required' } });
    expect(r.setPremium).not.toHaveBeenCalled();
  });

  it('an account can upgrade and cancel', async () => {
    const up = repo(false);
    expect((await runPremiumAction('u-1', { action: 'upgrade' }, up, { isGuest: false })).body).toMatchObject({ isPremium: true });
    const down = repo(true);
    expect((await runPremiumAction('u-1', { action: 'downgrade' }, down, { isGuest: false })).body).toMatchObject({ isPremium: false });
    expect(down.setPremium).toHaveBeenCalledWith('u-1', false);
  });

  it('acts only on the caller, whatever ids the body carries', async () => {
    const r = repo();
    await runPremiumAction('u-1', { action: 'upgrade', userId: 'victim', id: 'victim' }, r, { isGuest: false });
    expect(r.getFlags).toHaveBeenCalledWith('u-1');
    expect(r.setPremium).toHaveBeenCalledWith('u-1', true);
  });

  it('the demo switch is unaffected (the demo account is not a guest)', async () => {
    const r = repo(true, true);
    expect((await runPremiumAction('demo', { action: 'demo_toggle' }, r, { isGuest: false })).body).toMatchObject({ isPremium: false });
  });

  it('existing callers without the option keep working (treated as an account)', async () => {
    const r = repo();
    expect((await runPremiumAction('u-1', { action: 'upgrade' }, r)).status).toBe(200);
  });
});
