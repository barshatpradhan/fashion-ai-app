import 'server-only';
import { createHash } from 'node:crypto';
import { adminClient } from '@/lib/db/admin';
import { getEnvFor } from '@/lib/env';
import { withGuard } from '@/lib/ai/guard';
import { AiBadOutputError } from '@/lib/ai/errors';
import { styleLooks } from '@/lib/ai/writer';
import { SCAN_ERRORS, loadIsDemo } from '@/lib/db/scans';
import { CLOSET_ERRORS, supabaseClosetRepo, isUpcycledRow, type GarmentRow } from '@/lib/db/closet';
import {
  spendCredit, refundCredit, adminCreditRepo, OutOfCreditsError, ConcurrentSpendError,
  type CreditKind, type SpendReceipt,
} from '@/lib/db/credits';
import { validateLooks, validateSavedLook, isOccasion, MIN_ITEMS } from '@/lib/domain/outfits';
import { DEFAULT_STYLE_PROFILE, type Garment, type Look, type StyleProfile } from '@/lib/domain/types';

export const OUTFIT_ERRORS = {
  closetTooSmall: 'closet_too_small',
  noLooks: 'no_looks',
  aiBusy: SCAN_ERRORS.aiBusy,
  invalidLook: 'invalid_look',
  busy: CLOSET_ERRORS.busy,
} as const;

/** The AI answered, but none of its Looks passed validation. */
export class NoValidLooksError extends AiBadOutputError {
  constructor() {
    super('no valid looks');
    this.name = 'NoValidLooksError';
  }
}

/** Persistence seam. Writes go through the service role. */
export interface OutfitRepo {
  listGarments(userId: string): Promise<GarmentRow[]>;
  /** The stored `profiles.style_profile`, or null. */
  loadStyleProfile(userId: string): Promise<unknown>;
  isDemo(userId: string): Promise<boolean>;
  insertActivity(userId: string, kind: 'style'): Promise<void>;
  insertOutfit(o: { userId: string; items: string[]; reason: string; occasion: string | null }): Promise<string>;
}

export type OutfitDeps = {
  repo: OutfitRepo;
  spend: (userId: string, kind: CreditKind) => Promise<SpendReceipt>;
  refund: (receipt: SpendReceipt) => Promise<void>;
  style: (closet: Garment[], profile: StyleProfile, occasion?: string) => Promise<unknown>;
  guard: <T>(key: string, fn: () => Promise<T>, opts: { timeoutMs: number; demo: boolean }) => Promise<T>;
  timeoutMs: number;
  now: () => Date;
};

type Status = 200 | 400 | 402 | 409 | 503;
export type OutfitResult = { status: Status; body: Record<string, unknown> };
const fail = (status: Status, error: string, extra: Record<string, unknown> = {}): OutfitResult =>
  ({ status, body: { error, ...extra } });
const bad = () => fail(400, SCAN_ERRORS.badRequest);

export function toGarment(r: GarmentRow): Garment {
  return {
    id: r.id, category: r.category, status: r.status, isUpcycled: isUpcycledRow(r), tags: r.tags,
    name: r.name ?? 'Untitled piece', cutoutPath: r.cutoutPath ?? '', imageKind: r.imageKind,
  };
}

const strings = (v: unknown, fallback: string[]) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback;

/** A stored style profile, field by field, over the default. */
export function toStyleProfile(raw: unknown): StyleProfile {
  if (!raw || typeof raw !== 'object') return DEFAULT_STYLE_PROFILE;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_STYLE_PROFILE;
  return {
    styles: strings(r.styles, d.styles),
    avoidColors: strings(r.avoidColors, d.avoidColors),
    occasions: strings(r.occasions, d.occasions),
    climate: typeof r.climate === 'string' && r.climate ? r.climate : d.climate,
  };
}

async function activeCloset(userId: string, repo: OutfitRepo): Promise<Garment[]> {
  return (await repo.listGarments(userId)).filter((g) => g.userId === userId && g.status === 'active').map(toGarment);
}

async function style(userId: string, b: Record<string, unknown>, deps: OutfitDeps): Promise<OutfitResult> {
  if (b.occasion !== undefined && b.occasion !== null && !isOccasion(b.occasion)) return bad();
  const occasion = isOccasion(b.occasion) ? b.occasion : undefined;
  const { repo } = deps;
  const closet = await activeCloset(userId, repo);
  // Checked before spending: a closet that can't make a Look never costs one.
  if (closet.length < MIN_ITEMS) return fail(400, OUTFIT_ERRORS.closetTooSmall);
  const [rawProfile, demo] = await Promise.all([repo.loadStyleProfile(userId), repo.isDemo(userId)]);
  const profile = toStyleProfile(rawProfile);

  let receipt: SpendReceipt;
  try {
    receipt = await deps.spend(userId, 'look');
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return fail(402, OUTFIT_ERRORS.noLooks, { nextCreditAt: err.nextCreditAt.toISOString() });
    }
    if (err instanceof ConcurrentSpendError) return fail(409, OUTFIT_ERRORS.busy);
    throw err;
  }
  const giveBack = async () => {
    try {
      await deps.refund(receipt);
    } catch (refundErr) {
      console.error('outfits: look refund failed', refundErr);
    }
  };

  const ids = createHash('sha256').update(closet.map((g) => g.id).sort().join(',')).digest('hex').slice(0, 32);
  const key = `looks:${ids}:${occasion ?? 'everyday'}`;
  // Validation runs INSIDE the guard: only usable Looks are ever cached, and an unusable answer counts as a
  // failure (so a demo falls back to its last good Looks). Whatever comes back, cached or fresh, is
  // re-validated against the current closet.
  const guarded = () => deps.guard(key, async () => {
    const valid = validateLooks(await deps.style(closet, profile, occasion), closet);
    if (!valid.length) throw new NoValidLooksError();
    return valid;
  }, { timeoutMs: deps.timeoutMs, demo });
  const attempt = async () => validateLooks(await guarded(), closet);

  let looks: Look[] = [];
  try {
    try {
      looks = await attempt();
    } catch (err) {
      // Only an unusable answer earns the one retry; a failing AI call does not.
      if (!(err instanceof NoValidLooksError)) throw err;
    }
    if (!looks.length) looks = await attempt();
  } catch (err) {
    console.error('outfits: styling failed', err);
    await giveBack();
    return fail(503, OUTFIT_ERRORS.aiBusy);
  }
  if (!looks.length) {
    await giveBack();
    return fail(503, OUTFIT_ERRORS.aiBusy);
  }

  try {
    await repo.insertActivity(userId, 'style');
  } catch (err) {
    // The Looks were made and the credit spent; a missing log row is not worth failing the user for.
    console.error('outfits: style activity write failed', err);
  }
  return { status: 200, body: { looks } };
}

async function save(userId: string, b: Record<string, unknown>, deps: OutfitDeps): Promise<OutfitResult> {
  if (!b.look || typeof b.look !== 'object') return bad();
  if (b.occasion !== undefined && b.occasion !== null && !isOccasion(b.occasion)) return bad();
  const look = validateSavedLook(b.look, await activeCloset(userId, deps.repo));
  if (!look) return fail(400, OUTFIT_ERRORS.invalidLook);
  const outfitId = await deps.repo.insertOutfit({
    userId, items: look.garmentIds, reason: look.reason, occasion: isOccasion(b.occasion) ? b.occasion : null,
  });
  return { status: 200, body: { outfitId } };
}

export async function runOutfitsAction(userId: string, input: unknown, deps: OutfitDeps): Promise<OutfitResult> {
  if (!input || typeof input !== 'object') return bad();
  const b = input as Record<string, unknown>;
  switch (b.action) {
    case 'style': return style(userId, b, deps);
    case 'save': return save(userId, b, deps);
    default: return bad();
  }
}

// ------------------------------------------------------------------ Supabase

export function supabaseOutfitRepo(): OutfitRepo {
  const db = adminClient();
  const closet = supabaseClosetRepo();
  return {
    listGarments: (userId) => closet.listGarments(userId),
    async loadStyleProfile(userId) {
      const { data, error } = await db.from('profiles').select('style_profile').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data?.style_profile ?? null;
    },
    isDemo: (userId) => loadIsDemo(db, userId),
    async insertActivity(userId, kind) {
      const { error } = await db.from('activity').insert({ user_id: userId, kind });
      if (error) throw error;
    },
    async insertOutfit(o) {
      const { data, error } = await db.from('outfits')
        .insert({ user_id: o.userId, items: o.items, reason: o.reason || null, occasion: o.occasion })
        .select('id').single();
      if (error) throw error;
      return data.id as string;
    },
  };
}

export function defaultOutfitDeps(): OutfitDeps {
  const credits = adminCreditRepo();
  return {
    repo: supabaseOutfitRepo(),
    spend: (userId, kind) => spendCredit(userId, kind, new Date(), credits),
    refund: (receipt) => refundCredit(receipt, credits),
    style: styleLooks,
    guard: withGuard,
    timeoutMs: getEnvFor(['AI_TIMEOUT_MS']).AI_TIMEOUT_MS,
    now: () => new Date(),
  };
}
