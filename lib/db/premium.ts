import 'server-only';
import { adminClient } from '@/lib/db/admin';

export const PRICE_LABEL = '$7.99/month';

export type PremiumFlags = { isPremium: boolean; isDemo: boolean };
export interface PremiumRepo {
  getFlags(userId: string): Promise<PremiumFlags>;
  setPremium(userId: string, value: boolean): Promise<void>;
}
export type PremiumResult = {
  status: 200 | 400 | 403;
  body: { isPremium: boolean; price: string } | { error: string };
};

/**
 * Premium is a toggle, not a payment. `upgrade`/`downgrade` act on the caller; `demo_toggle` is the
 * presenter's switch and only works for the demo account. Downgrading never touches Garments.
 */
export async function runPremiumAction(
  userId: string, input: unknown, repo: PremiumRepo, opts: { isGuest: boolean } = { isGuest: false },
): Promise<PremiumResult> {
  const action = (input as { action?: unknown } | null)?.action;
  if (action !== 'upgrade' && action !== 'downgrade' && action !== 'demo_toggle') {
    return { status: 400, body: { error: 'bad_request' } };
  }
  // A guest (anonymous user) must create an account first, so Premium is never tied to a throwaway session.
  if (action === 'upgrade' && opts.isGuest) return { status: 403, body: { error: 'signup_required' } };
  const flags = await repo.getFlags(userId);
  let next: boolean;
  if (action === 'demo_toggle') {
    if (!flags.isDemo) return { status: 403, body: { error: 'forbidden' } };
    next = !flags.isPremium;
  } else {
    next = action === 'upgrade';
  }
  if (next !== flags.isPremium) await repo.setPremium(userId, next);
  return { status: 200, body: { isPremium: next, price: PRICE_LABEL } };
}

export function supabasePremiumRepo(): PremiumRepo {
  const db = adminClient();
  return {
    async getFlags(userId) {
      const { data, error } = await db.from('profiles').select('is_premium, is_demo').eq('id', userId).single();
      if (error || !data) throw new Error(`profile read failed: ${error?.message ?? 'not found'}`);
      return { isPremium: Boolean(data.is_premium), isDemo: Boolean(data.is_demo) };
    },
    async setPremium(userId, value) {
      const { error } = await db.from('profiles').update({ is_premium: value }).eq('id', userId);
      if (error) throw new Error(`premium update failed: ${error.message}`);
    },
  };
}
