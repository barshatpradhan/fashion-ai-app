/** Closet copy helpers (client-safe, no server imports). */

/** Allowance as `GET /api/closet` sends it: `peek()` with the date serialised. */
export type AllowanceView = { remaining: number | 'unlimited'; nextCreditAt: string | null };

/** Whole hours until `iso`, rounded up, at least 1. Null for an unparseable date. */
export function hoursUntil(iso: string, now: Date = new Date()): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(1, Math.ceil((t - now.getTime()) / 3_600_000));
}

/** "{n} uploads left · next in {h}h", or "Unlimited". */
export function allowanceLabel(a: AllowanceView, now: Date = new Date()): string {
  if (a.remaining === 'unlimited') return 'Unlimited';
  const left = `${a.remaining} ${a.remaining === 1 ? 'upload' : 'uploads'} left`;
  const h = a.nextCreditAt ? hoursUntil(a.nextCreditAt, now) : null;
  return h === null ? left : `${left} · next in ${h}h`;
}

/** Friendly copy for a 402 `no_uploads`. */
export function noUploadsMessage(nextCreditAt: string | null | undefined, now: Date = new Date()): string {
  const base = "You're out of uploads for now.";
  const h = nextCreditAt ? hoursUntil(nextCreditAt, now) : null;
  return h === null ? base : `${base} Your next one arrives in ${h}h.`;
}
