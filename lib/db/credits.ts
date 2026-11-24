import 'server-only';
import { adminClient } from '@/lib/db/admin';
import {
  spend, refund, type AllowanceState, type Pool, type Tier,
} from '@/lib/domain/allowance';

export type CreditKind = 'upload' | 'look';
export type SpendReceipt = { userId: string; kind: CreditKind; pool: Pool };
/** rawRefillAt is the refill column exactly as the database returned it (never re-serialised). */
export type CreditRow = { tier: Tier; state: AllowanceState; rawRefillAt: string | null };

export class OutOfCreditsError extends Error {
  constructor(public nextCreditAt: Date) {
    super('out_of_credits');
    this.name = 'OutOfCreditsError';
  }
}
export class ConcurrentSpendError extends Error {
  constructor() {
    super('concurrent_spend');
    this.name = 'ConcurrentSpendError';
  }
}

export interface CreditRepo {
  read(userId: string, kind: CreditKind): Promise<CreditRow>;
  /** Writes `next` only if the row still holds ALL of `expectedOld`. Returns whether a row was updated. */
  conditionalUpdate(
    userId: string, kind: CreditKind, expectedOld: AllowanceState, next: AllowanceState,
    expectedRawRefillAt: string | null,
  ): Promise<boolean>;
}

const COLS = {
  upload: { used: 'free_uploads_used', credits: 'upload_credits', refill: 'uploads_refill_at' },
  look: { used: 'free_looks_used', credits: 'look_credits', refill: 'looks_refill_at' },
} as const;

export function adminCreditRepo(): CreditRepo {
  const db = adminClient();
  return {
    async read(userId, kind) {
      const c = COLS[kind];
      const { data, error } = await db
        .from('profiles')
        .select(`${c.used}, ${c.credits}, ${c.refill}, is_premium, is_demo`)
        .eq('id', userId)
        .single();
      if (error || !data) throw new Error(`profile read failed: ${error?.message ?? 'not found'}`);
      const row = data as unknown as Record<string, unknown>;
      const refill = row[c.refill] as string | null;
      return {
        tier: { premium: row.is_premium as boolean, exempt: row.is_demo as boolean },
        state: {
          freeUsed: row[c.used] as number,
          credits: row[c.credits] as number,
          refillAt: refill ? new Date(refill) : null,
        },
        rawRefillAt: refill,
      };
    },
    async conditionalUpdate(userId, kind, old, next, rawRefill) {
      const c = COLS[kind];
      let q = db
        .from('profiles')
        .update({
          [c.used]: next.freeUsed,
          [c.credits]: next.credits,
          [c.refill]: next.refillAt ? next.refillAt.toISOString() : null,
        })
        .eq('id', userId)
        .eq(c.used, old.freeUsed)
        .eq(c.credits, old.credits);
      q = rawRefill !== null ? q.eq(c.refill, rawRefill) : q.is(c.refill, null);
      const { data, error } = await q.select('id');
      if (error) throw new Error(`credit update failed: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
  };
}

/** Atomically spends one credit. Retries once on a concurrent write, then throws ConcurrentSpendError. */
export async function spendCredit(
  userId: string, kind: CreditKind, now: Date = new Date(), repo: CreditRepo = adminCreditRepo(),
): Promise<SpendReceipt> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { tier, state, rawRefillAt } = await repo.read(userId, kind);
    const r = spend(state, now, tier);
    if (!r.ok) throw new OutOfCreditsError(r.nextCreditAt);
    if (r.pool === 'unlimited') return { userId, kind, pool: 'unlimited' };
    if (await repo.conditionalUpdate(userId, kind, state, r.state, rawRefillAt)) {
      return { userId, kind, pool: r.pool };
    }
  }
  throw new ConcurrentSpendError();
}

/** Gives back a spent credit (e.g. when the AI call fails). Unlimited is a no-op. */
export async function refundCredit(
  receipt: SpendReceipt, repo: CreditRepo = adminCreditRepo(),
): Promise<void> {
  if (receipt.pool === 'unlimited') return;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { state, rawRefillAt } = await repo.read(receipt.userId, receipt.kind);
    const next = refund(state, receipt.pool);
    if (next === state || (next.freeUsed === state.freeUsed && next.credits === state.credits)) return;
    if (await repo.conditionalUpdate(receipt.userId, receipt.kind, state, next, rawRefillAt)) return;
  }
  throw new ConcurrentSpendError();
}
