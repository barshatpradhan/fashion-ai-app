export const REFILL_MS = 120_960_000; // 33.6h
export const FREE_START = 10;
export const WEEKLY_CAP = 5;

export type AllowanceState = { freeUsed: number; credits: number; refillAt: Date | null };
export type Tier = { premium: boolean; exempt: boolean };
export type Pool = 'free' | 'weekly' | 'unlimited';

function periods(s: AllowanceState, now: Date): number {
  if (!s.refillAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - s.refillAt.getTime()) / REFILL_MS));
}

function weeklyAvailable(s: AllowanceState, now: Date): number {
  return Math.min(WEEKLY_CAP, s.credits + periods(s, now));
}

function nextRefill(s: AllowanceState, now: Date): Date {
  const base = s.refillAt ?? now;
  return new Date(base.getTime() + (periods(s, now) + 1) * REFILL_MS);
}

/**
 * Tier for DISPLAYING an allowance. The demo account's exemption applies to spending and the scan cap
 * only, so a demo user switched to Free sees the real free counters (§6.6 rule 10); spends still never block.
 */
export function displayTier(t: Tier): Tier {
  return { premium: t.premium, exempt: false };
}

export function peek(
  s: AllowanceState, now: Date, t: Tier,
): { remaining: number | 'unlimited'; nextCreditAt: Date | null } {
  if (t.premium || t.exempt) return { remaining: 'unlimited', nextCreditAt: null };
  if (s.freeUsed < FREE_START) {
    return { remaining: FREE_START - s.freeUsed, nextCreditAt: null };
  }
  const avail = weeklyAvailable(s, now);
  return { remaining: avail, nextCreditAt: avail >= WEEKLY_CAP ? null : nextRefill(s, now) };
}

export function spend(
  s: AllowanceState, now: Date, t: Tier,
):
  | { ok: true; state: AllowanceState; pool: Pool }
  | { ok: false; nextCreditAt: Date } {
  if (t.premium || t.exempt) return { ok: true, state: s, pool: 'unlimited' };

  if (s.freeUsed < FREE_START) {
    const freeUsed = s.freeUsed + 1;
    // Free credits just ran out: weekly pool starts empty, clock starts now.
    const state: AllowanceState =
      freeUsed >= FREE_START ? { freeUsed, credits: 0, refillAt: now } : { ...s, freeUsed };
    return { ok: true, state, pool: 'free' };
  }

  const k = periods(s, now);
  const avail = weeklyAvailable(s, now);
  if (avail < 1) return { ok: false, nextCreditAt: nextRefill(s, now) };
  const atCap = s.credits + k >= WEEKLY_CAP;
  const refillAt = atCap || !s.refillAt ? now : new Date(s.refillAt.getTime() + k * REFILL_MS);
  return {
    ok: true,
    state: { freeUsed: s.freeUsed, credits: avail - 1, refillAt },
    pool: 'weekly',
  };
}

export function refund(s: AllowanceState, pool: Pool): AllowanceState {
  if (pool === 'unlimited') return s;
  if (pool === 'free') return { ...s, freeUsed: Math.max(0, s.freeUsed - 1) };
  return { ...s, credits: Math.min(WEEKLY_CAP, s.credits + 1) };
}
