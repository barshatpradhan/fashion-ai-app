import type { Garment, Look } from '@/lib/domain/types';

export const MAX_LOOKS = 3;
export const MIN_ITEMS = 2;
export const MAX_ITEMS = 4;
const MAX_NAME = 60;
const MAX_REASON = 280;

/** Occasions the "Style me" select offers; anything else is refused (it goes into the prompt). */
export const OCCASIONS = ['everyday', 'work', 'weekend', 'evening', 'event'] as const;
export type Occasion = (typeof OCCASIONS)[number];
export const isOccasion = (v: unknown): v is Occasion => typeof v === 'string' && (OCCASIONS as readonly string[]).includes(v);

const URL_RE = /(https?:\/\/|www\.)\S*|\b[a-z0-9-]+\.(com|net|org|io|co|uk|shop|store)\b/i;
const SHOPPING_RE = /\b(buy|buys|buying|shop|shops|shopping|store|stores)\b/i;

/** True if the text points anywhere outside the user's own closet (a URL or buying/shopping words). */
export function mentionsShopping(text: string): boolean {
  return URL_RE.test(text) || SHOPPING_RE.test(text);
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** One Look, checked against the active closet; null if it breaks a rule. */
function checkLook(raw: unknown, active: Map<string, Garment>, needUpcycled: boolean): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = clean(r.name, MAX_NAME);
  // The writer's prompt calls it "note"; Looks call it "reason".
  const reason = clean(r.reason ?? r.note, MAX_REASON);
  if (!name || !Array.isArray(r.garmentIds)) return null;
  if (!r.garmentIds.every((id) => typeof id === 'string')) return null;
  const garmentIds = [...new Set(r.garmentIds as string[])];
  // Unknown and transformed ids are both missing from the active map.
  if (!garmentIds.every((id) => active.has(id))) return null;
  if (garmentIds.length < MIN_ITEMS || garmentIds.length > MAX_ITEMS) return null;
  if (needUpcycled && !garmentIds.some((id) => active.get(id)!.isUpcycled)) return null;
  if (mentionsShopping(name) || mentionsShopping(reason)) return null;
  return { name, reason, garmentIds };
}

const activeMap = (closet: Garment[]) => new Map(closet.filter((g) => g.status === 'active').map((g) => [g.id, g]));

/**
 * Keeps the AI's Looks that use only active pieces from the closet, 2 to 4 of them, include an upcycled
 * piece when the closet has an active one, and never point to shopping or a URL. At most 3.
 */
export function validateLooks(raw: unknown, closet: Garment[]): Look[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? (raw as { looks?: unknown }).looks : null;
  if (!Array.isArray(list)) return [];
  const active = activeMap(closet);
  const needUpcycled = [...active.values()].some((g) => g.isUpcycled);
  const out: Look[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const look = checkLook(item, active, needUpcycled);
    if (!look) continue;
    const key = [...look.garmentIds].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(look);
    if (out.length >= MAX_LOOKS) break;
  }
  return out;
}

/** A Look the user wants to keep: same id and text rules, but no upcycled rule (the closet may have changed). */
export function validateSavedLook(raw: unknown, closet: Garment[]): Look | null {
  return checkLook(raw, activeMap(closet), false);
}
