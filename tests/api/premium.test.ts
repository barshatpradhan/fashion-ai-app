import { describe, it, expect, beforeAll } from 'vitest';
import { runPremiumAction, PRICE_LABEL, type PremiumRepo } from '@/lib/db/premium';
import { demoKeyMatches } from '@/lib/db/demo';
import { spendCredit, type CreditRepo } from '@/lib/db/credits';
import type { AllowanceState, Tier } from '@/lib/domain/allowance';

function repo(flags: { isPremium: boolean; isDemo: boolean }) {
  const state = { ...flags };
  const r: PremiumRepo = {
    getFlags: async () => ({ ...state }),
    setPremium: async (_id, v) => { state.isPremium = v; },
  };
  return { r, state };
}

describe('runPremiumAction', () => {
  it('upgrade sets is_premium and returns the price', async () => {
    const { r, state } = repo({ isPremium: false, isDemo: false });
    const res = await runPremiumAction('u', { action: 'upgrade' }, r);
    expect(res.status).toBe(200);
    expect(state.isPremium).toBe(true);
    expect(res.body).toMatchObject({ isPremium: true, price: '$7.99/month' });
    expect(PRICE_LABEL).toBe('$7.99/month');
  });

  it('demo_toggle from a non-demo user is 403 and changes nothing', async () => {
    const { r, state } = repo({ isPremium: false, isDemo: false });
    const res = await runPremiumAction('u', { action: 'demo_toggle' }, r);
    expect(res.status).toBe(403);
    expect(state.isPremium).toBe(false);
  });

  it('demo_toggle from the demo user flips is_premium both ways', async () => {
    const { r, state } = repo({ isPremium: true, isDemo: true });
    expect((await runPremiumAction('u', { action: 'demo_toggle' }, r)).status).toBe(200);
    expect(state.isPremium).toBe(false);
    const back = await runPremiumAction('u', { action: 'demo_toggle' }, r);
    expect(state.isPremium).toBe(true);
    expect(back.body).toMatchObject({ isPremium: true });
  });

  it('downgrade clears is_premium; unknown actions are 400', async () => {
    const { r, state } = repo({ isPremium: true, isDemo: false });
    expect((await runPremiumAction('u', { action: 'downgrade' }, r)).status).toBe(200);
    expect(state.isPremium).toBe(false);
    expect((await runPremiumAction('u', { action: 'nope' }, r)).status).toBe(400);
    expect((await runPremiumAction('u', null, r)).status).toBe(400);
  });
});

describe('demoKeyMatches', () => {
  it('accepts only the exact key', () => {
    expect(demoKeyMatches('secret', 'secret')).toBe(true);
    expect(demoKeyMatches('secreT', 'secret')).toBe(false);
    expect(demoKeyMatches('secre', 'secret')).toBe(false);
    expect(demoKeyMatches(null, 'secret')).toBe(false);
    expect(demoKeyMatches('', '')).toBe(false);
  });
});

describe('GET /demo', () => {
  beforeAll(() => {
    Object.assign(process.env, {
      SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's',
      GEMINI_API_KEY: 'g', DEMO_KEY: 'right-key', DEMO_USER_ID: 'demo-id',
    });
  });
  it('404s for a wrong or missing key', async () => {
    const { GET } = await import('@/app/demo/route');
    expect((await GET(new Request('http://x/demo?key=wrong'))).status).toBe(404);
    expect((await GET(new Request('http://x/demo'))).status).toBe(404);
  });
});

describe('demo user is exempt from credits', () => {
  it('spendCredit stays ok with pool unlimited when freeUsed 10 and credits 0', async () => {
    const state: AllowanceState = { freeUsed: 10, credits: 0, refillAt: null };
    const tier: Tier = { premium: false, exempt: true };
    const credits: CreditRepo = {
      read: async () => ({ tier, state, rawRefillAt: null }),
      conditionalUpdate: async () => { throw new Error('must not write'); },
    };
    const r = await spendCredit('demo', 'upload', new Date(), credits);
    expect(r.pool).toBe('unlimited');
  });
});
