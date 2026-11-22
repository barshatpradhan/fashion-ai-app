import 'server-only';
import { adminClient } from '@/lib/db/admin';
import { getEnv } from '@/lib/env';
import { analyzeImage } from '@/lib/ai/vision';
import { GEMINI_VISION_MODEL } from '@/lib/ai/gemini';
import { withGuard } from '@/lib/ai/guard';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import { matchEntries } from '@/lib/domain/matching';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry, MatchResult } from '@/lib/domain/types';

export const DAILY_SCAN_CAP = 20;
export const FABRIC_CONFIRM_THRESHOLD = 0.7;
const BUCKET = 'garments';

export type ScanRow = { id: string; vision: VisionResult };
export type NewScan = {
  userId: string; imagePath: string; cutoutPath: string; imageHash: string; vision: VisionResult;
  fabricFinal: string; fabricSource: 'vision'; modelName: string; modelVersion: string;
};
export type MatchRow = { kbEntryId: string; score: number };

/** Persistence seam. Server-authored writes only; never touches profile credit columns. */
export interface ScanRepo {
  isDemo(userId: string): Promise<boolean>;
  findByHash(userId: string, imageHash: string): Promise<ScanRow | null>;
  countSince(userId: string, since: Date): Promise<number>;
  download(path: string): Promise<Uint8Array>;
  insertScan(scan: NewScan): Promise<string>;
  insertMatches(scanId: string, rows: MatchRow[]): Promise<void>;
  loadReviewedEntries(): Promise<KbEntry[]>;
}

export type AnalyzeDeps = {
  repo: ScanRepo;
  analyze: (jpeg: Uint8Array) => Promise<VisionResult>;
  now: () => Date;
  timeoutMs: number;
  guard: <T>(key: string, fn: () => Promise<T>, opts: { timeoutMs: number; demo: boolean }) => Promise<T>;
};

export type AnalyzeResult =
  | { status: 200; body: { scanId: string; vision: VisionResult; match: MatchResult; needsFabricConfirm: boolean } }
  | { status: 400 | 422 | 429 | 503; body: { error: string } };

const fail = (status: 400 | 422 | 429 | 503, error: string): AnalyzeResult => ({ status, body: { error } });

/** Score = rank position (best first) within each list; an entry keeps its best score. */
function toMatchRows(match: MatchResult): MatchRow[] {
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
    return fail(400, 'bad_request');
  }
  const { imagePath, cutoutPath, imageHash } = b as { imagePath: string; cutoutPath: string; imageHash: string };
  const prefix = `${userId}/`;
  const ok = (p: string) => p.startsWith(prefix) && !p.includes('..');
  if (!ok(imagePath) || !ok(cutoutPath)) return fail(400, 'bad_request');
  const { repo } = deps;

  const respond = (scanId: string, vision: VisionResult, entries: KbEntry[]): AnalyzeResult => ({
    status: 200,
    body: {
      scanId,
      vision,
      match: matchEntries(vision, { namedStyles: [] }, entries),
      needsFabricConfirm: vision.fabric_guess.confidence < FABRIC_CONFIRM_THRESHOLD,
    },
  });

  // Hash cache first: no cap check, no AI call.
  const existing = await repo.findByHash(userId, imageHash);
  if (existing) return respond(existing.id, existing.vision, await repo.loadReviewedEntries());

  const demo = await repo.isDemo(userId);
  if (!demo) {
    const n = deps.now();
    const dayStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    if ((await repo.countSince(userId, dayStart)) >= DAILY_SCAN_CAP) return fail(429, 'daily_cap');
  }

  let vision: VisionResult;
  try {
    const jpeg = await repo.download(imagePath);
    vision = await deps.guard(`scan:${imageHash}`, () => deps.analyze(jpeg), { timeoutMs: deps.timeoutMs, demo });
  } catch (err) {
    if (err instanceof AiRateLimitError || err instanceof AiTimeoutError || err instanceof AiBadOutputError) {
      return fail(503, 'ai_busy');
    }
    throw err;
  }
  if (!vision.is_garment) return fail(422, 'not_a_garment');

  const entries = await repo.loadReviewedEntries();
  const result = respond('', vision, entries);
  const scanId = await repo.insertScan({
    userId, imagePath, cutoutPath, imageHash, vision,
    fabricFinal: vision.fabric_guess.value, fabricSource: 'vision',
    modelName: GEMINI_VISION_MODEL, modelVersion: GEMINI_VISION_MODEL,
  });
  const rows = toMatchRows((result.body as { match: MatchResult }).match);
  if (rows.length) await repo.insertMatches(scanId, rows);
  return { ...result, body: { ...(result.body as object), scanId } } as AnalyzeResult;
}

function toKbEntry(r: Record<string, unknown>): KbEntry {
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

export function supabaseScanRepo(): ScanRepo {
  const db = adminClient();
  return {
    async isDemo(userId) {
      const { data, error } = await db.from('profiles').select('is_demo').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data?.is_demo === true;
    },
    async findByHash(userId, imageHash) {
      const { data, error } = await db.from('scans').select('id, vision_json')
        .eq('user_id', userId).eq('image_hash', imageHash).not('vision_json', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, vision: data.vision_json as VisionResult } : null;
    },
    async countSince(userId, since) {
      const { count, error } = await db.from('scans').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async download(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw error ?? new Error('download failed');
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
  };
}

export function defaultAnalyzeDeps(): AnalyzeDeps {
  return {
    repo: supabaseScanRepo(), analyze: analyzeImage, now: () => new Date(),
    timeoutMs: getEnv().AI_TIMEOUT_MS, guard: withGuard,
  };
}
