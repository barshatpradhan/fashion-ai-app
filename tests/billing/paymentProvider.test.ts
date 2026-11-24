import { describe, it, expect, vi, afterEach } from 'vitest';
import { demoNoPaymentProvider, PLANS } from '@/lib/billing/paymentProvider';

afterEach(() => vi.unstubAllGlobals());

describe('demoNoPaymentProvider (placeholder until a real payment provider plugs in)', () => {
  it('says plainly that no payment is taken', () => {
    expect(demoNoPaymentProvider.notice).toBe('Demo: no payment is taken.');
  });
  it('upgrade and cancel call the existing /api/premium toggle', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ isPremium: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await demoNoPaymentProvider.upgrade()).toEqual({ ok: true });
    expect(await demoNoPaymentProvider.cancel()).toEqual({ ok: true });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies).toEqual([{ action: 'upgrade' }, { action: 'downgrade' }]);
    expect(fetchMock.mock.calls.every((c) => (c as unknown as [string])[0] === '/api/premium')).toBe(true);
  });
  it('a guest is told to sign up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'signup_required' }), { status: 403 })));
    expect(await demoNoPaymentProvider.upgrade()).toEqual({ ok: false, error: 'signup_required' });
  });
});

describe('PLANS', () => {
  it('describes Free and Premium from the spec, with the only price $7.99/month', () => {
    expect(PLANS.free.includes).toEqual(['1 free recipe per scan', '10 free uploads and 10 free looks, then a weekly refill']);
    expect(PLANS.premium.includes).toEqual(['Every recipe and guide', 'Unlimited uploads and looks']);
    expect(PLANS.premium.price).toBe('$7.99/month');
    expect(JSON.stringify(PLANS).match(/\$\d[\d.,]*/g)).toEqual(['$7.99']);
  });
});
