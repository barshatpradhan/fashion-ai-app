import 'server-only';
import { createHash } from 'node:crypto';
import { adminClient } from '@/lib/db/admin';
import { getEnvFor } from '@/lib/env';
import { analyzeImage } from '@/lib/ai/vision';
import { GEMINI_VISION_MODEL } from '@/lib/ai/gemini';
import { withGuard } from '@/lib/ai/guard';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import { matchEntries } from '@/lib/domain/matching';
import type { VisionResult } from '@/lib/ai/visionSchema';
import { confirmedFromCorrections, hasFabricCorrection, type CorrectionRow } from '@/lib/domain/corrections';
import { redactMatch, type PublicMatch } from '@/lib/domain/redact';
import type { KbEntry, MatchResult } from '@/lib/domain/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SCAN_ERRORS = {
  unauthorized: 'unauthorized',
  badRequest: 'bad_request',
  imageNotFound: 'image_not_found',
  notAGarment: 'not_a_garment',
  dailyCap: 'daily_cap',
  aiBusy: 'ai_busy',
  serverError: 'server_error',
} as const;

/** Thrown by a ScanRepo when the Storage object is missing or unreadable. */
export class ImageNotFoundError extends Error {
  constructor(cause?: unknown) {
    super('image_not_found', { cause });
    this.name = 'ImageNotFoundError';
  }
}

export const DAILY_SCAN_CAP = 20;
export const FABRIC_CONFIRM_THRESHOLD = 0.7;
const BUCKET = 'garments';

/** imagePath / cutoutPath are null once the user deleted the scan's images (closet delete / delete_scan). */
export type ScanRow = { id: string; vision: VisionResult; imagePath?: string | null; cutoutPath?: string | null };
export type NewScan = {
  userId: string; imagePath: string; cutoutPath: string; imageHash: string; vision: VisionResult;
  fabricFinal: string; fabricSource: 'vision'; modelName: string; modelVersion: string;
};
export type MatchRow = { kbEntryId: string; score: number };

/** Persistence seam. Server-authored writes only; never touches profile credit columns. */
export interface ScanRepo {
  isDemo(userId: string): Promise<boolean>;
  isPremium(userId: string): Promise<boolean>;
  findByHash(userId: string, imageHash: string): Promise<ScanRow | null>;
  countSince(userId: string, since: Date): Promise<number>;
  download(path: string): Promise<Uint8Array>;
  insertScan(scan: NewScan): Promise<string>;
  /** Re-attach freshly uploaded images to a cached scan whose images were deleted. */
  attachImages(scanId: string, imagePath: string, cutoutPath: string): Promise<void>;
  insertMatches(scanId: string, rows: MatchRow[]): Promise<void>;
  loadReviewedEntries(): Promise<KbEntry[]>;
  /** Corrections for a scan, oldest first (later rows win). */
  listCorrections(scanId: string): Promise<CorrectionRow[]>;
}

export type AnalyzeDeps = {
  repo: ScanRepo;
  analyze: (jpeg: Uint8Array) => Promise<VisionResult>;
  now: () => Date;
  timeoutMs: number;
  guard: <T>(key: string, fn: () => Promise<T>, opts: { timeoutMs: number; demo: boolean }) => Promise<T>;
};

export type AnalyzeResult =
  | {
      status: 200;
      /** `fabric` is the effective fabric: the latest user correction, else the vision guess. */
      body: { scanId: string; vision: VisionResult; match: PublicMatch; needsFabricConfirm: boolean; fabric: string };
    }
  | { status: 400 | 422 | 429 | 503; body: { error: string } };

const fail = (status: 400 | 422 | 429 | 503, error: string): AnalyzeResult => ({ status, body: { error } });

/**
 * Premium users see every Recipe in full; everyone else only the free one. Recipe access follows
 * is_premium ONLY: the demo account is seeded Premium and its Free/Premium switch flips is_premium, so
 * the presenter can show locked Recipes live (§6.6 rule 10). Demo exemption covers limits, not access.
 */
export async function hasFullRecipeAccess(
  repo: { isPremium(u: string): Promise<boolean> },
  userId: string,
): Promise<boolean> {
  return repo.isPremium(userId);
}

/** Score = rank position (best first) within each list; an entry keeps its best score. */
export function toMatchRows(match: MatchResult): MatchRow[] {
  const rows = new Map<string, number>();
  const add = (list: KbEntry[]) =>
    list.forEach((e, i) => rows.set(e.id, Math.max(rows.get(e.id) ?? 0, list.length - i)));
  add(match.history);
  add(match.recipes);
  add(match.fabricNotes);
  return [...rows].map(([kbEntryId, score]) => ({ kbEntryId, score }));
}

export async function runAnalyze(userId: string, input: unknown, deps: AnalyzeDeps): Promise<AnalyzeResult> {
  const b = input as { imagePath?: unknown; cutoutPath?: unknown; imageHash?: unknown } | null;
  if (
    !b || typeof b.imagePath !== 'string' || typeof b.cutoutPath !== 'string' ||
    typeof b.imageHash !== 'string' || !b.imageHash
  ) {
    return fail(400, SCAN_ERRORS.badRequest);
  }
  const { imagePath, cutoutPath, imageHash } = b as { imagePath: string; cutoutPath: string; imageHash: string };
  const prefix = `${userId}/`;
  const ok = (p: string) => p.startsWith(prefix) && !p.includes('..');
  if (!ok(imagePath) || !ok(cutoutPath)) return fail(400, SCAN_ERRORS.badRequest);
  const { repo } = deps;

  /** Full match (for persistence) plus the redacted response body. */
  const build = (vision: VisionResult, entries: KbEntry[], corrections: CorrectionRow[] = []) => {
    const confirmed = confirmedFromCorrections(corrections);
    const match = matchEntries(vision, confirmed, entries);
    const needsFabricConfirm = hasFabricCorrection(corrections)
      ? false
      : vision.fabric_guess.confidence < FABRIC_CONFIRM_THRESHOLD;
    const respond = async (scanId: string): Promise<AnalyzeResult> => ({
      status: 200,
      body: {
        scanId, vision, needsFabricConfirm,
        match: redactMatch(match, await hasFullRecipeAccess(repo, userId)),
        fabric: confirmed.fabric ?? vision.fabric_guess.value,
      },
    });
    return { match, respond };
  };

  let jpeg: Uint8Array;
  try {
    jpeg = await repo.download(imagePath);
  } catch (err) {
    if (err instanceof ImageNotFoundError) return fail(400, SCAN_ERRORS.imageNotFound);
    throw err;
  }
  // Server-side hash of the actual bytes; the client-supplied imageHash is never trusted.
  const hash = createHash('sha256').update(jpeg).digest('hex');

  // Hash cache first: no cap check, no AI call.
  const existing = await repo.findByHash(userId, hash);
  if (existing) {
    if (!existing.vision.is_garment) return fail(422, SCAN_ERRORS.notAGarment);
    // The user deleted this scan's images earlier: this request's upload becomes the scan's images again.
    if (existing.imagePath === null || existing.cutoutPath === null) {
      await repo.attachImages(existing.id, imagePath, cutoutPath);
    }
    // Rebuild from the scan's corrections so a re-upload shows what the user already confirmed.
    const [entries, corrections] = await Promise.all([repo.loadReviewedEntries(), repo.listCorrections(existing.id)]);
    return build(existing.vision, entries, corrections).respond(existing.id);
  }

  const demo = await repo.isDemo(userId);
  if (!demo) {
    const n = deps.now();
    const dayStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    if ((await repo.countSince(userId, dayStart)) >= DAILY_SCAN_CAP) return fail(429, SCAN_ERRORS.dailyCap);
  }

  let vision: VisionResult;
  try {
    vision = await deps.guard(`scan:${hash}`, () => deps.analyze(jpeg), { timeoutMs: deps.timeoutMs, demo });
  } catch (err) {
    if (err instanceof AiRateLimitError || err instanceof AiTimeoutError || err instanceof AiBadOutputError) {
      return fail(503, SCAN_ERRORS.aiBusy);
    }
    throw err;
  }

  const newScan = (): NewScan => ({
    userId, imagePath, cutoutPath, imageHash: hash, vision,
    fabricFinal: vision.fabric_guess.value, fabricSource: 'vision',
    modelName: GEMINI_VISION_MODEL, modelVersion: GEMINI_VISION_MODEL,
  });
  if (!vision.is_garment) {
    // Persist so the attempt counts toward the daily cap and a re-upload hits the cache.
    await repo.insertScan(newScan());
    return fail(422, SCAN_ERRORS.notAGarment);
  }

  const entries = await repo.loadReviewedEntries();
  const built = build(vision, entries);
  const scanId = await repo.insertScan(newScan());
  const rows = toMatchRows(built.match);
  if (rows.length) await repo.insertMatches(scanId, rows);
  return built.respond(scanId);
}

export function toKbEntry(r: Record<string, unknown>): KbEntry {
  return {
    id: r.id as string,
    kind: r.kind as KbEntry['kind'],
    title: r.title as string,
    body: (r.body as string | null) ?? '',
    tags: (r.tags as string[] | null) ?? [],
    difficulty: (r.difficulty as KbEntry['difficulty'] | null) ?? undefined,
    tools: typeof r.tools === 'string' && r.tools ? r.tools.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    steps: (r.steps as string[] | null) ?? undefined,
    sources: (r.sources as KbEntry['sources'] | null) ?? undefined,
    status: r.status as KbEntry['status'],
  };
}

export async function loadIsPremium(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('profiles').select('is_premium').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.is_premium === true;
}

export async function loadIsDemo(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('profiles').select('is_demo').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.is_demo === true;
}

export async function listCorrectionRows(db: SupabaseClient, scanId: string): Promise<CorrectionRow[]> {
  const { data, error } = await db.from('corrections').select('field, ai_value, user_value, created_at')
    .eq('scan_id', scanId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    field: r.field as CorrectionRow['field'],
    aiValue: (r.ai_value as string | null) ?? null,
    userValue: (r.user_value as string | null) ?? null,
  }));
}

export function supabaseScanRepo(): ScanRepo {
  const db = adminClient();
  return {
    isDemo: (userId) => loadIsDemo(db, userId),
    isPremium: (userId) => loadIsPremium(db, userId),
    async findByHash(userId, imageHash) {
      const { data, error } = await db.from('scans').select('id, vision_json, image_path, cutout_path')
        .eq('user_id', userId).eq('image_hash', imageHash).not('vision_json', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id as string, vision: data.vision_json as VisionResult,
            imagePath: (data.image_path as string | null) ?? null, cutoutPath: (data.cutout_path as string | null) ?? null,
          }
        : null;
    },
    async countSince(userId, since) {
      const { count, error } = await db.from('scans').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async download(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new ImageNotFoundError(error);
      return new Uint8Array(await data.arrayBuffer());
    },
    async insertScan(s) {
      const { data, error } = await db.from('scans').insert({
        user_id: s.userId, image_path: s.imagePath, cutout_path: s.cutoutPath, image_hash: s.imageHash,
        vision_json: s.vision, model_name: s.modelName, model_version: s.modelVersion,
        fabric_final: s.fabricFinal, fabric_source: s.fabricSource,
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    async attachImages(scanId, imagePath, cutoutPath) {
      const { error } = await db.from('scans').update({ image_path: imagePath, cutout_path: cutoutPath })
        .eq('id', scanId).or('image_path.is.null,cutout_path.is.null');
      if (error) throw error;
    },
    async insertMatches(scanId, rows) {
      const { error } = await db.from('scan_matches').insert(
        rows.map((r) => ({ scan_id: scanId, kb_entry_id: r.kbEntryId, score: r.score, method: 'tag' })),
      );
      if (error) throw error;
    },
    async loadReviewedEntries() {
      const { data, error } = await db.from('kb_entries').select('*').eq('status', 'reviewed');
      if (error) throw error;
      return (data ?? []).map(toKbEntry);
    },
    listCorrections: (scanId) => listCorrectionRows(db, scanId),
  };
}

export function defaultAnalyzeDeps(): AnalyzeDeps {
  return {
    repo: supabaseScanRepo(), analyze: analyzeImage, now: () => new Date(),
    timeoutMs: getEnvFor(['AI_TIMEOUT_MS']).AI_TIMEOUT_MS, guard: withGuard,
  };
}
