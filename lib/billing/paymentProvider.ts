/**
 * PAYMENT PROVIDER PLUG-IN POINT.
 *
 * Premium is a toggle today: no payment is taken, there are no card fields, checkout or invoices.
 * A real provider (for example a hosted checkout) would implement `PaymentProvider` and replace
 * `demoNoPaymentProvider` where the subscription panel uses it. Its server side should then flip
 * profiles.is_premium only from a verified provider webhook, never from the browser.
 */

export type PaymentResult = { ok: true } | { ok: false; error: 'signup_required' | 'failed' };

export interface PaymentProvider {
  /** Shown next to the plan actions. */
  notice: string;
  upgrade(): Promise<PaymentResult>;
  cancel(): Promise<PaymentResult>;
}

async function togglePremium(action: 'upgrade' | 'downgrade'): Promise<PaymentResult> {
  try {
    const res = await fetch('/api/premium', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: json.error === 'signup_required' ? 'signup_required' : 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** The only provider today: flips the plan through the existing /api/premium toggle. */
export const demoNoPaymentProvider: PaymentProvider = {
  notice: 'Demo: no payment is taken.',
  upgrade: () => togglePremium('upgrade'),
  cancel: () => togglePremium('downgrade'),
};

export const PLANS = {
  free: {
    name: 'Free',
    includes: ['1 free recipe per scan', '10 free uploads and 10 free looks, then a weekly refill'],
  },
  premium: {
    name: 'Premium',
    price: '$7.99/month',
    includes: ['Every recipe and guide', 'Unlimited uploads and looks'],
  },
} as const;
