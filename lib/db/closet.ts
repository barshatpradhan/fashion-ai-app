import 'server-only';
import { adminClient } from '@/lib/db/admin';
import { SCAN_ERRORS, listCorrectionRows } from '@/lib/db/scans';
import {
  spendCredit, refundCredit, adminCreditRepo, OutOfCreditsError, ConcurrentSpendError,
  type CreditRepo, type SpendReceipt,
} from '@/lib/db/credits';
import { resolveGuide, isFail, supabaseGuideRepo, GUIDE_ERRORS } from '@/lib/db/guides';
import { peek, displayTier as display } from '@/lib/domain/allowance';
import { confirmedFromCorrections, type CorrectionRow } from '@/lib/domain/corrections';
import { FABRICS, GENERIC_TAGS, NAMED_STYLES } from '@/lib/domain/vocabulary';
import type { VisionResult } from '@/lib/ai/visionSchema';

export const CLOSET_ERRORS = {
  notFound: 'not_found',
  alreadySaved: 'already_saved',
  noUploads: 'no_uploads',
  notActive: 'not_active',
  scanInUse: 'scan_in_use',
  busy: 'concurrent_spend',
} as const;

const BUCKET = 'garments';
const SIGNED_URL_TTL_S = 60 * 10;
const MAX_TAGS = 20;
const MAX_NAME = 60;

export type GarmentStatus = 'active' | 'transformed';
export type GarmentRow = {
  id: string; userId: string; scanId: string | null; category: 'clothing' | 'accessory'; name: string | null;
  /** The original photo (quick add / accessory / saved scan). Null for made-this pieces. */
  imagePath: string | null;
  /** What the rail shows: the cut-out, or for a made-this piece its photo or concept image. */
  cutoutPath: string | null;
  imageKind: 'photo' | 'concept'; tags: string[]; status: GarmentStatus;
  sourceGarmentId: string | null; recipeId: string | null; createdAt: string;
};

/**
 * An Upcycled Garment is one made with a Recipe ("I made this"). Derived from recipe_id as well as
 * source_garment_id: both FKs are ON DELETE SET NULL, and deleting the original must not un-upcycle it.
 */
export const isUpcycledRow = (g: Pick<GarmentRow, 'sourceGarmentId' | 'recipeId'>): boolean =>
  g.recipeId !== null || g.sourceGarmentId !== null;

export type NewGarment = Omit<GarmentRow, 'id' | 'status' | 'createdAt'>;
export type ClosetScan = {
  id: string; userId: string; vision: VisionResult; fabricFinal: string | null;
  imagePath: string | null; cutoutPath: string | null;
};

/** What the browser gets: no Storage paths, just a short-lived signed URL. */
export type ClosetGarment = {
  id: string; category: GarmentRow['category']; name: string; imageKind: GarmentRow['imageKind'];
  tags: string[]; status: GarmentStatus; isUpcycled: boolean; scanId: string | null; recipeId: string | null;
  createdAt: string; imageUrl: string | null;
};
export type AllowanceOut = { remaining: number | 'unlimited'; nextCreditAt: string | null };

/** Thrown by a ClosetRepo when a second garment would reference the same scan (unique index). */
export class DuplicateGarmentError extends Error {
  constructor(cause?: unknown) {
    super('already_saved', { cause });
    this.name = 'DuplicateGarmentError';
  }
}

/** Persistence seam. All writes go through the service role (garments/activity are client select-only). */
export interface ClosetRepo {
  loadScan(scanId: string): Promise<ClosetScan | null>;
  listCorrections(scanId: string): Promise<CorrectionRow[]>;
  getGarment(id: string): Promise<GarmentRow | null>;
  listGarments(userId: string): Promise<GarmentRow[]>;
  /** Ids of garments that reference the scan. */
  garmentsForScan(scanId: string): Promise<string[]>;
  /** Throws DuplicateGarmentError if the scan is already linked to a garment. */
  insertGarment(g: NewGarment): Promise<string>;
  /** Throws DuplicateGarmentError if the scan is already linked to a garment. */
  linkScan(garmentId: string, scanId: string, tags: string[]): Promise<void>;
  /** Compare-and-set on status. Returns whether the row changed. */
  setStatus(garmentId: string, from: GarmentStatus, to: GarmentStatus): Promise<boolean>;
  deleteGarment(garmentId: string): Promise<void>;
  insertActivity(userId: string, kind: 'upload' | 'reconstruct', garmentId: string | null): Promise<void>;
  /** Null the scan's image paths; text, vision and corrections stay. */
  clearScanImages(scanId: string): Promise<void>;
  removeObjects(paths: string[]): Promise<void>;
  signedUrls(paths: string[]): Promise<Record<string, string>>;
}

export type RecipeGate = (
  userId: string, scanId: string, recipeId: string,
) => Promise<
  | { ok: true; recipeTitle: string; conceptPath: string | null }
  | { ok: false; status: 400 | 402 | 404 | 503; error: string }
>;

export type ClosetDeps = { repo: ClosetRepo; credits: CreditRepo; now: () => Date; recipeGate: RecipeGate };

type Status = 200 | 400 | 402 | 404 | 409 | 503;
export type ClosetResult = { status: Status; body: Record<string, unknown> };
const fail = (status: Status, error: string, extra: Record<string, unknown> = {}): ClosetResult =>
  ({ status, body: { error, ...extra } });
const bad = () => fail(400, SCAN_ERRORS.badRequest);

const VOCAB = new Set<string>([...GENERIC_TAGS, ...NAMED_STYLES, ...FABRICS].map((t) => t.toLowerCase()));

/** Keep only fixed-vocabulary tags, lowercased, deduped, capped. Anything else (or a non-array) yields []. */
export function filterTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== 'string') continue;
    const v = t.trim().toLowerCase();
    if (VOCAB.has(v) && !out.includes(v)) out.push(v);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const ownedPath = (userId: string, p: unknown): p is string =>
  str(p) && p.startsWith(`${userId}/`) && !p.includes('..') && !p.includes('\\');
const cleanName = (v: unknown, fallback: string) =>
  (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) : '') || fallback;
const humanize = (s: string) => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Tags a scan contributes: type, fabric, vision tags and accepted named styles (vocabulary only). */
function scanTags(scan: ClosetScan, corrections: CorrectionRow[]): { tags: string[]; garmentType: string } {
  const c = confirmedFromCorrections(corrections);
  const garmentType = c.garmentType ?? scan.vision.garment_type;
  const fabric = c.fabric ?? scan.fabricFinal ?? scan.vision.fabric_guess.value;
  return {
    garmentType,
    tags: filterTags([garmentType, fabric, scan.vision.pattern, ...scan.vision.tags, ...c.namedStyles]),
  };
}

/** Loads a scan the user owns that is a garment; null otherwise. */
async function ownGarmentScan(repo: ClosetRepo, userId: string, scanId: string) {
  const scan = await repo.loadScan(scanId);
  return scan && scan.userId === userId && scan.vision.is_garment ? scan : null;
}

/**
 * Spends one Upload first, then runs the writes. On a write failure the Upload is refunded; a failing
 * refund is logged so it never masks the original error.
 */
async function withUpload(
  userId: string, deps: ClosetDeps, write: () => Promise<ClosetResult>,
): Promise<ClosetResult> {
  let receipt: SpendReceipt;
  try {
    receipt = await spendCredit(userId, 'upload', deps.now(), deps.credits);
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return fail(402, CLOSET_ERRORS.noUploads, { nextCreditAt: err.nextCreditAt.toISOString() });
    }
    if (err instanceof ConcurrentSpendError) return fail(409, CLOSET_ERRORS.busy);
    throw err;
  }
  const giveBack = async () => {
    try {
      await refundCredit(receipt, deps.credits);
    } catch (refundErr) {
      console.error('closet: upload refund failed', refundErr);
    }
  };
  let result: ClosetResult;
  try {
    result = await write();
  } catch (err) {
    await giveBack();
    if (err instanceof DuplicateGarmentError) return fail(409, CLOSET_ERRORS.alreadySaved);
    throw err;
  }
  if (result.status !== 200) await giveBack();
  return result;
}

/** Inserts the garment and its `upload` activity; removes the garment again if the activity write fails. */
async function insertUploaded(userId: string, repo: ClosetRepo, g: NewGarment): Promise<ClosetResult> {
  const id = await repo.insertGarment(g);
  try {
    await repo.insertActivity(userId, 'upload', id);
  } catch (err) {
    await repo.deleteGarment(id).catch((e) => console.error('closet: rollback of garment failed', e));
    throw err;
  }
  return { status: 200, body: { garmentId: id } };
}

type Body = Record<string, unknown>;

async function saveScan(userId: string, b: Body, deps: ClosetDeps): Promise<ClosetResult> {
  if (!str(b.scanId)) return bad();
  const { repo } = deps;
  const scan = await ownGarmentScan(repo, userId, b.scanId);
  if (!scan) return fail(404, CLOSET_ERRORS.notFound);
  if (!scan.cutoutPath && !scan.imagePath) return fail(400, SCAN_ERRORS.imageNotFound);
  // Checked before spending so a double tap never costs an Upload (the unique index still backs it up).
  if ((await repo.garmentsForScan(scan.id)).length) return fail(409, CLOSET_ERRORS.alreadySaved);
  const { tags, garmentType } = scanTags(scan, await repo.listCorrections(scan.id));
  return withUpload(userId, deps, () => insertUploaded(userId, repo, {
    userId, scanId: scan.id, category: 'clothing', name: humanize(garmentType),
    imagePath: scan.imagePath, cutoutPath: scan.cutoutPath ?? scan.imagePath, imageKind: 'photo', tags,
    sourceGarmentId: null, recipeId: null,
  }));
}

async function addPhoto(userId: string, b: Body, deps: ClosetDeps, category: 'clothing' | 'accessory') {
  if (!ownedPath(userId, b.imagePath) || !ownedPath(userId, b.cutoutPath)) return bad();
  const { imagePath, cutoutPath } = b as { imagePath: string; cutoutPath: string };
  return withUpload(userId, deps, () => insertUploaded(userId, deps.repo, {
    userId, scanId: null, category, name: cleanName(b.name, category === 'accessory' ? 'Accessory' : 'New piece'),
    imagePath, cutoutPath, imageKind: 'photo', tags: filterTags(b.tags), sourceGarmentId: null, recipeId: null,
  }));
}

async function fullScan(userId: string, b: Body, deps: ClosetDeps): Promise<ClosetResult> {
  if (!str(b.garmentId) || !str(b.scanId)) return bad();
  const { repo } = deps;
  const g = await repo.getGarment(b.garmentId);
  if (!g || g.userId !== userId) return fail(404, CLOSET_ERRORS.notFound);
  if (g.scanId) return fail(409, CLOSET_ERRORS.alreadySaved);
  if (g.category !== 'clothing') return bad();
  const scan = await ownGarmentScan(repo, userId, b.scanId);
  if (!scan) return fail(404, CLOSET_ERRORS.notFound);
  if ((await repo.garmentsForScan(scan.id)).length) return fail(409, CLOSET_ERRORS.alreadySaved);
  const { tags } = scanTags(scan, await repo.listCorrections(scan.id));
  try {
    await repo.linkScan(g.id, scan.id, filterTags([...g.tags, ...tags]));
  } catch (err) {
    if (err instanceof DuplicateGarmentError) return fail(409, CLOSET_ERRORS.alreadySaved);
    throw err;
  }
  return { status: 200, body: { garmentId: g.id } };
}

async function madeThis(userId: string, b: Body, deps: ClosetDeps): Promise<ClosetResult> {
  if (!str(b.sourceGarmentId) || !str(b.recipeId)) return bad();
  if (b.photoPath !== undefined && b.photoPath !== null && !ownedPath(userId, b.photoPath)) return bad();
  if (b.conceptPath !== undefined && b.conceptPath !== null && !ownedPath(userId, b.conceptPath)) return bad();
  const photoPath = str(b.photoPath) ? b.photoPath : null;
  const { repo } = deps;
  const src = await repo.getGarment(b.sourceGarmentId);
  if (!src || src.userId !== userId) return fail(404, CLOSET_ERRORS.notFound);
  if (src.status !== 'active') return fail(409, CLOSET_ERRORS.notActive);
  // Recipes come from a scan's match, so the source must be linked to one.
  if (!src.scanId) return fail(404, CLOSET_ERRORS.notFound);
  const gate = await deps.recipeGate(userId, src.scanId, b.recipeId);
  if (!gate.ok) return fail(gate.status, gate.error);
  // The concept image is the guide's own; a client-sent path must match it.
  if (str(b.conceptPath) && b.conceptPath !== gate.conceptPath) return bad();

  // Claim the source first so two taps can't both rework it.
  if (!(await repo.setStatus(src.id, 'active', 'transformed'))) return fail(409, CLOSET_ERRORS.notActive);
  let id: string | null = null;
  try {
    id = await repo.insertGarment({
      userId, scanId: null, category: src.category, name: cleanName(gate.recipeTitle, 'Reworked piece'),
      imagePath: null, cutoutPath: photoPath ?? gate.conceptPath, imageKind: photoPath ? 'photo' : 'concept',
      tags: src.tags, sourceGarmentId: src.id, recipeId: b.recipeId,
    });
    await repo.insertActivity(userId, 'reconstruct', id);
  } catch (err) {
    if (id) await repo.deleteGarment(id).catch((e) => console.error('closet: rollback of garment failed', e));
    await repo.setStatus(src.id, 'transformed', 'active').catch((e) => console.error('closet: status revert failed', e));
    throw err;
  }
  return { status: 200, body: { garmentId: id } };
}

async function deleteGarment(userId: string, b: Body, deps: ClosetDeps): Promise<ClosetResult> {
  if (!str(b.garmentId)) return bad();
  const { repo } = deps;
  const g = await repo.getGarment(b.garmentId);
  if (!g || g.userId !== userId) return fail(404, CLOSET_ERRORS.notFound);

  // A concept image belongs to the guide, not the garment: never remove it here.
  const paths = new Set<string>();
  if (g.imagePath) paths.add(g.imagePath);
  if (g.cutoutPath && g.imageKind === 'photo') paths.add(g.cutoutPath);

  let clearScan = false;
  if (g.scanId) {
    const others = (await repo.garmentsForScan(g.scanId)).filter((id) => id !== g.id);
    if (others.length) {
      // Another garment still shows the scan's images: keep them.
      const scan = await repo.loadScan(g.scanId);
      if (scan?.imagePath) paths.delete(scan.imagePath);
      if (scan?.cutoutPath) paths.delete(scan.cutoutPath);
    } else {
      clearScan = true;
      const scan = await repo.loadScan(g.scanId);
      if (scan?.imagePath) paths.add(scan.imagePath);
      if (scan?.cutoutPath) paths.add(scan.cutoutPath);
    }
  }

  await repo.deleteGarment(g.id); // never refunds the Upload
  if (clearScan && g.scanId) await repo.clearScanImages(g.scanId);
  const own = [...paths].filter((p) => ownedPath(userId, p));
  if (own.length) {
    try {
      await repo.removeObjects(own);
    } catch (err) {
      // The garment is already gone; an orphaned object is not worth failing the request for.
      console.error('closet: storage removal failed', err);
    }
  }
  return { status: 200, body: { deleted: g.id } };
}

async function deleteScan(userId: string, b: Body, deps: ClosetDeps): Promise<ClosetResult> {
  if (!str(b.scanId)) return bad();
  const { repo } = deps;
  const scan = await repo.loadScan(b.scanId);
  if (!scan || scan.userId !== userId) return fail(404, CLOSET_ERRORS.notFound);
  if ((await repo.garmentsForScan(scan.id)).length) return fail(409, CLOSET_ERRORS.scanInUse);
  const paths = [...new Set([scan.imagePath, scan.cutoutPath].filter((p): p is string => ownedPath(userId, p)))];
  await repo.clearScanImages(scan.id);
  if (paths.length) await repo.removeObjects(paths);
  return { status: 200, body: { deleted: scan.id } };
}

export async function runClosetAction(userId: string, input: unknown, deps: ClosetDeps): Promise<ClosetResult> {
  if (!input || typeof input !== 'object') return bad();
  const b = input as Body;
  switch (b.action) {
    case 'save_scan': return saveScan(userId, b, deps);
    case 'quick_add': return addPhoto(userId, b, deps, 'clothing');
    case 'accessory': return addPhoto(userId, b, deps, 'accessory');
    case 'full_scan': return fullScan(userId, b, deps);
    case 'made_this': return madeThis(userId, b, deps);
    case 'delete': return deleteGarment(userId, b, deps);
    case 'delete_scan': return deleteScan(userId, b, deps);
    default: return bad();
  }
}

/** Every garment the user owns (never capped by tier: a downgrade hides nothing), active first. */
export async function loadCloset(
  userId: string, deps: ClosetDeps,
): Promise<{ status: 200; body: { garments: ClosetGarment[]; allowance: { uploads: AllowanceOut; looks: AllowanceOut } } }> {
  const { repo, credits } = deps;
  const now = deps.now();
  const [rows, up, look] = await Promise.all([
    repo.listGarments(userId), credits.read(userId, 'upload'), credits.read(userId, 'look'),
  ]);
  const sorted = [...rows].sort((a, b) =>
    a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'active' ? -1 : 1);
  const paths = [...new Set(sorted.map((g) => g.cutoutPath).filter((p): p is string => ownedPath(userId, p)))];
  const urls = paths.length ? await repo.signedUrls(paths) : {};
  const out = (p: ReturnType<typeof peek>): AllowanceOut =>
    ({ remaining: p.remaining, nextCreditAt: p.nextCreditAt ? p.nextCreditAt.toISOString() : null });
  return {
    status: 200,
    body: {
      garments: sorted.map((g) => ({
        id: g.id, category: g.category, name: g.name ?? 'Untitled piece', imageKind: g.imageKind, tags: g.tags,
        status: g.status, isUpcycled: isUpcycledRow(g), scanId: g.scanId, recipeId: g.recipeId,
        createdAt: g.createdAt, imageUrl: g.cutoutPath ? urls[g.cutoutPath] ?? null : null,
      })),
      allowance: { uploads: out(peek(up.state, now, display(up.tier))), looks: out(peek(look.state, now, display(look.tier))) },
    },
  };
}

// ------------------------------------------------------------------ Supabase

const GARMENT_COLS =
  'id, user_id, scan_id, category, name, image_path, cutout_path, image_kind, tags, status, source_garment_id, recipe_id, created_at';

function toGarmentRow(r: Record<string, unknown>): GarmentRow {
  return {
    id: r.id as string, userId: r.user_id as string, scanId: (r.scan_id as string | null) ?? null,
    category: r.category as GarmentRow['category'], name: (r.name as string | null) ?? null,
    imagePath: (r.image_path as string | null) ?? null, cutoutPath: (r.cutout_path as string | null) ?? null,
    imageKind: r.image_kind as GarmentRow['imageKind'], tags: (r.tags as string[] | null) ?? [],
    status: r.status as GarmentStatus, sourceGarmentId: (r.source_garment_id as string | null) ?? null,
    recipeId: (r.recipe_id as string | null) ?? null, createdAt: r.created_at as string,
  };
}

const isUniqueViolation = (e: { code?: string } | null) => e?.code === '23505';
const isBadUuid = (e: { code?: string } | null) => e?.code === '22P02';

export function supabaseClosetRepo(): ClosetRepo {
  const db = adminClient();
  return {
    async loadScan(scanId) {
      const { data, error } = await db.from('scans')
        .select('id, user_id, vision_json, fabric_final, image_path, cutout_path').eq('id', scanId).maybeSingle();
      if (error) {
        if (isBadUuid(error)) return null;
        throw error;
      }
      if (!data || !data.vision_json) return null;
      return {
        id: data.id as string, userId: data.user_id as string, vision: data.vision_json as VisionResult,
        fabricFinal: (data.fabric_final as string | null) ?? null,
        imagePath: (data.image_path as string | null) ?? null, cutoutPath: (data.cutout_path as string | null) ?? null,
      };
    },
    listCorrections: (scanId) => listCorrectionRows(db, scanId),
    async getGarment(id) {
      const { data, error } = await db.from('garments').select(GARMENT_COLS).eq('id', id).maybeSingle();
      if (error) {
        if (isBadUuid(error)) return null;
        throw error;
      }
      return data ? toGarmentRow(data) : null;
    },
    async listGarments(userId) {
      const { data, error } = await db.from('garments').select(GARMENT_COLS)
        .eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toGarmentRow);
    },
    async garmentsForScan(scanId) {
      const { data, error } = await db.from('garments').select('id').eq('scan_id', scanId);
      if (error) throw error;
      return (data ?? []).map((r) => r.id as string);
    },
    async insertGarment(g) {
      const { data, error } = await db.from('garments').insert({
        user_id: g.userId, scan_id: g.scanId, category: g.category, name: g.name, image_path: g.imagePath,
        cutout_path: g.cutoutPath, image_kind: g.imageKind, tags: g.tags,
        source_garment_id: g.sourceGarmentId, recipe_id: g.recipeId,
      }).select('id').single();
      if (error) {
        if (isUniqueViolation(error)) throw new DuplicateGarmentError(error);
        throw error;
      }
      return data.id as string;
    },
    async linkScan(garmentId, scanId, tags) {
      const { error } = await db.from('garments').update({ scan_id: scanId, tags }).eq('id', garmentId).is('scan_id', null);
      if (error) {
        if (isUniqueViolation(error)) throw new DuplicateGarmentError(error);
        throw error;
      }
    },
    async setStatus(garmentId, from, to) {
      const { data, error } = await db.from('garments').update({ status: to })
        .eq('id', garmentId).eq('status', from).select('id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    async deleteGarment(garmentId) {
      const { error } = await db.from('garments').delete().eq('id', garmentId);
      if (error) throw error;
    },
    async insertActivity(userId, kind, garmentId) {
      const { error } = await db.from('activity').insert({ user_id: userId, kind, garment_id: garmentId });
      if (error) throw error;
    },
    async clearScanImages(scanId) {
      const { error } = await db.from('scans').update({ image_path: null, cutout_path: null }).eq('id', scanId);
      if (error) throw error;
    },
    async removeObjects(paths) {
      const { error } = await db.storage.from(BUCKET).remove(paths);
      if (error) throw error;
    },
    async signedUrls(paths) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_S);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
      return out;
    },
  };
}

/** Reuses the guide's gate (ownership, current match, Premium) and returns the guide's concept image. */
export function guideRecipeGate(): RecipeGate {
  const guides = supabaseGuideRepo();
  return async (userId, scanId, recipeId) => {
    const r = await resolveGuide(userId, { scanId, recipeId }, guides);
    if (isFail(r)) {
      const status = r.status === 402 ? 402 : r.status === 400 ? 400 : r.status === 503 ? 503 : 404;
      return { ok: false, status, error: r.status === 402 ? GUIDE_ERRORS.premiumRequired : r.body.error };
    }
    const stored = await guides.getGuide(scanId, recipeId);
    return { ok: true, recipeTitle: r.recipe.title, conceptPath: stored?.afterImagePath ?? null };
  };
}

export function defaultClosetDeps(): ClosetDeps {
  return { repo: supabaseClosetRepo(), credits: adminCreditRepo(), now: () => new Date(), recipeGate: guideRecipeGate() };
}
