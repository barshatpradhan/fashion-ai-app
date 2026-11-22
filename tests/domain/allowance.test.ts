import { describe, it, expect } from 'vitest';
import {
  REFILL_MS, peek, spend, refund,
  type AllowanceState, type Tier,
} from '@/lib/domain/allowance';
import {
  spendCredit, refundCredit, OutOfCreditsError,
  type CreditRepo, type CreditRow,
} from '@/lib/db/credits';

const T = new Date('2026-12-01T00:00:00Z');
const at = (ms: number) => new Date(T.getTime() + ms);
const free: Tier = { premium: false, exempt: false };

describe('allowance pure functions', () => {
  it('spends from the free pool', () => {
    const r = spend({ freeUsed: 3, credits: 0, refillAt: null }, T, free);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.pool).toBe('free'); expect(r.state.freeUsed).toBe(4); }
  });

  it('starts the weekly pool at 0 when free runs out', () => {
    const r = spend({ freeUsed: 9, credits: 0, refillAt: null }, T, free);
    expect(r.ok && r.state).toEqual({ freeUsed: 10, credits: 0, refillAt: T });
  });

  const empty: AllowanceState = { freeUsed: 10, credits: 0, refillAt: T };

  it('refuses before the first refill period and reports nextCreditAt', () => {
    const r = spend(empty, at(REFILL_MS - 1), free);
    expect(r).toEqual({ ok: false, nextCreditAt: at(REFILL_MS) });
  });

  it('allows exactly at the refill period', () => {
    const r = spend(empty, at(REFILL_MS), free);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.pool).toBe('weekly'); expect(r.state.credits).toBe(0); }
  });

  it('caps at 5 with no stacking', () => {
    expect(peek(empty, at(30 * 86_400_000), free).remaining).toBe(5);
  });

  it('premium and exempt are unlimited with unchanged state', () => {
    for (const t of [{ premium: true, exempt: false }, { premium: false, exempt: true }]) {
      const r = spend(empty, T, t);
      expect(r.ok && r.pool).toBe('unlimited');
      expect(r.ok && r.state).toEqual(empty);
      expect(peek(empty, T, t).remaining).toBe('unlimited');
    }
  });

  it('refunds free and weekly', () => {
    const r = spend({ freeUsed: 3, credits: 0, refillAt: null }, T, free);
    if (!r.ok) throw new Error('x');
    expect(refund(r.state, 'free').freeUsed).toBe(3);
    expect(refund({ freeUsed: 0, credits: 0, refillAt: null }, 'free').freeUsed).toBe(0);
    expect(refund({ freeUsed: 10, credits: 2, refillAt: T }, 'weekly').credits).toBe(3);
    expect(refund({ freeUsed: 10, credits: 5, refillAt: T }, 'weekly').credits).toBe(5);
    const s = { freeUsed: 10, credits: 1, refillAt: T };
    expect(refund(s, 'unlimited')).toEqual(s);
  });
});

function fakeRepo(initial: CreditRow) {
  let row = { ...initial };
  const repo: CreditRepo = {
    async read() { await Promise.resolve(); return { ...row }; },
    async conditionalUpdate(_u, _k, old, next) {
      await Promise.resolve();
      if (
        row.state.freeUsed !== old.freeUsed ||
        row.state.credits !== old.credits ||
        row.state.refillAt?.getTime() !== old.refillAt?.getTime()
      ) return false;
      row = { ...row, state: { ...next } };
      return true;
    },
  };
  return { repo, get: () => row };
}

describe('spendCredit / refundCredit', () => {
  it('double-tap on 1 weekly credit: exactly one succeeds', async () => {
    const { repo } = fakeRepo({
      tier: free,
      state: { freeUsed: 10, credits: 1, refillAt: T },
    });
    const res = await Promise.allSettled([
      spendCredit('u', 'look', T, repo),
      spendCredit('u', 'look', T, repo),
    ]);
    const ok = res.filter((r) => r.status === 'fulfilled');
    const bad = res.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(OutOfCreditsError);
  });

  it('refund restores the credit', async () => {
    const f = fakeRepo({ tier: free, state: { freeUsed: 10, credits: 1, refillAt: T } });
    const receipt = await spendCredit('u', 'upload', T, f.repo);
    expect(f.get().state.credits).toBe(0);
    await refundCredit(receipt, f.repo);
    expect(f.get().state.credits).toBe(1);
  });
});
