import 'server-only';
import { adminClient } from '@/lib/db/admin';
import { getEnv } from '@/lib/env';
import { SCAN_ERRORS, hasFullRecipeAccess } from '@/lib/db/scans';
import { loadScanState, supabaseCorrectionRepo, type CorrectionRepo } from '@/lib/db/corrections';
import { matchEntries } from '@/lib/domain/matching';
import { writeGuide } from '@/lib/ai/writer';
import { generateConceptImage } from '@/lib/ai/imageGen';
import { withGuard } from '@/lib/ai/guard';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

export const GUIDE_ERRORS = { notFound: 'not_found', premiumRequired: 'premium_required' } as const;
const BUCKET = 'garments';
const SIGNED_URL_TTL_S = 60 * 10;

export type GuideBody = { steps: string[]; tools: string[]; historyRefs: string[] };
export type StoredGuide = { id: string; body: GuideBody; afterImagePath: string | null; outdated: boolean };

export interface GuideRepo extends CorrectionRepo {
  getGuide(scanId: string, kbEntryId: string): Promise<StoredGuide | null>;
  /** Insert or replace the guide text for (scan, recipe); clears `outdated`. Keeps any stored image. */
  saveGuide(scanId: string, kbEntryId: string, body: GuideBody): Promise<void>;
  /** Record the image on the guide row, creating an outdated placeholder row if none exists yet. */
  saveImage(scanId: string, kbEntryId: string, path: string, provider: string): Promise<void>;
  upload(path: string, png: Uint8Array): Promise<void>;
  signedUrl(path: string): Promise<string>;
}

export type GuideDeps = {
  repo: GuideRepo;
  write: (v: VisionResult, recipe: KbEntry, history: KbEntry[]) => Promise<GuideBody>;
  generateImage: (v: VisionResult, recipe: KbEntry) => Promise<Uint8Array>;
  imageProvider: string;
  timeoutMs: number;
  guard: <T>(key: string, fn: () => Promise<T>, opts: { timeoutMs: number; demo: boolean }) => Promise<T>;
};

type Fail = { status: 400 | 402 | 404 | 503; body: { error: string } };
const fail = (status: Fail['status'], error: string): Fail => ({ status, body: { error } });

export type GuideResult =
  | { status: 200; body: { steps: string[]; tools: string[]; history: KbEntry[]; outdated: false } }
  | Fail;
export type RenderResult = { status: 200; body: { imageUrl: string } } | Fail;

type Resolved = { scanId: string; vision: VisionResult; recipe: KbEntry; history: KbEntry[]; demo: boolean };

/** Shared by guide and render: validates input, ownership, the CURRENT match and the Premium gate. */
async function resolve(userId: string, input: unknown, repo: GuideRepo): Promise<Resolved | Fail> {
  const b = input as { scanId?: unknown; recipeId?: unknown } | null;
  if (!b || typeof b.scanId !== 'string' || !b.scanId || typeof b.recipeId !== 'string' || !b.recipeId) {
    return fail(400, SCAN_ERRORS.badRequest);
  }
  const state = await loadScanState(repo, b.scanId);
  if (!state || state.scan.userId !== userId || !state.scan.vision.is_garment) return fail(404, GUIDE_ERRORS.notFound);
  const entries = await repo.loadReviewedEntries();
  const match = matchEntries(state.scan.vision, state.confirmed, entries);
  const recipe = match.recipes.find((r) => r.id === b.recipeId);
  if (!recipe) return fail(404, GUIDE_ERRORS.notFound);
  const [access, demo] = await Promise.all([hasFullRecipeAccess(repo, userId), repo.isDemo(userId)]);
  if (recipe.id !== match.freeRecipeId && !access) return fail(402, GUIDE_ERRORS.premiumRequired);
  return { scanId: b.scanId, vision: state.scan.vision, recipe, history: match.history, demo };
}

const isFail = (r: Resolved | Fail): r is Fail => 'body' in r;
const isAiError = (e: unknown) =>
  e instanceof AiRateLimitError || e instanceof AiTimeoutError || e instanceof AiBadOutputError;

export async function runGuide(userId: string, input: unknown, deps: GuideDeps): Promise<GuideResult> {
  const r = await resolve(userId, input, deps.repo);
  if (isFail(r)) return r;
  const { repo } = deps;
  const stored = await repo.getGuide(r.scanId, r.recipe.id);
  let body: GuideBody;
  if (stored && !stored.outdated && stored.body?.steps?.length) {
    body = stored.body;
  } else {
    try {
      body = await deps.guard(
        `guide:${r.scanId}:${r.recipe.id}`,
        () => deps.write(r.vision, r.recipe, r.history),
        { timeoutMs: deps.timeoutMs, demo: r.demo },
      );
    } catch (err) {
      if (isAiError(err)) return fail(503, SCAN_ERRORS.aiBusy);
      throw err;
    }
    await repo.saveGuide(r.scanId, r.recipe.id, body);
  }
  const refs = new Set(body.historyRefs ?? []);
  return {
    status: 200,
    body: { steps: body.steps, tools: body.tools, history: r.history.filter((h) => refs.has(h.id)), outdated: false },
  };
}

export async function runRender(userId: string, input: unknown, deps: GuideDeps): Promise<RenderResult> {
  const r = await resolve(userId, input, deps.repo);
  if (isFail(r)) return r;
  const { repo } = deps;
  const stored = await repo.getGuide(r.scanId, r.recipe.id);
  if (stored?.afterImagePath) return { status: 200, body: { imageUrl: await repo.signedUrl(stored.afterImagePath) } };

  const path = `${userId}/concept-${r.scanId}-${r.recipe.id}.png`;
  let savedPath: string;
  try {
    // Only the path (a string) goes through the JSON-only demo cache, never the image bytes.
    savedPath = await deps.guard(
      `render:${r.scanId}:${r.recipe.id}`,
      async () => {
        const png = await deps.generateImage(r.vision, r.recipe);
        await repo.upload(path, png);
        return path;
      },
      { timeoutMs: deps.timeoutMs, demo: r.demo },
    );
  } catch (err) {
    if (isAiError(err)) return fail(503, SCAN_ERRORS.aiBusy);
    throw err;
  }
  await repo.saveImage(r.scanId, r.recipe.id, savedPath, deps.imageProvider);
  return { status: 200, body: { imageUrl: await repo.signedUrl(savedPath) } };
}

export function supabaseGuideRepo(): GuideRepo {
  const db = adminClient();
  const base = supabaseCorrectionRepo();
  const find = async (scanId: string, kbEntryId: string): Promise<StoredGuide | null> => {
    const { data, error } = await db.from('guides').select('id, body, after_image_path, outdated')
      .eq('scan_id', scanId).eq('kb_entry_id', kbEntryId).order('id').limit(1).maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data.id as string, body: data.body as GuideBody,
          afterImagePath: (data.after_image_path as string | null) ?? null, outdated: data.outdated === true,
        }
      : null;
  };
  return {
    ...base,
    getGuide: find,
    async saveGuide(scanId, kbEntryId, body) {
      const existing = await find(scanId, kbEntryId);
      const res = existing
        ? await db.from('guides').update({ body, outdated: false }).eq('id', existing.id)
        : await db.from('guides').insert({ scan_id: scanId, kb_entry_id: kbEntryId, body, outdated: false });
      if (res.error) throw res.error;
    },
    async saveImage(scanId, kbEntryId, path, provider) {
      const existing = await find(scanId, kbEntryId);
      const res = existing
        ? await db.from('guides').update({ after_image_path: path, image_provider: provider }).eq('id', existing.id)
        : await db.from('guides').insert({
            scan_id: scanId, kb_entry_id: kbEntryId, body: { steps: [], tools: [], historyRefs: [] },
            after_image_path: path, image_provider: provider, outdated: true,
          });
      if (res.error) throw res.error;
    },
    async upload(path, png) {
      const { error } = await db.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true });
      if (error) throw error;
    },
    async signedUrl(path) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_S);
      if (error || !data) throw error ?? new Error('sign failed');
      return data.signedUrl;
    },
  };
}

export function defaultGuideDeps(): GuideDeps {
  const e = getEnv();
  return {
    repo: supabaseGuideRepo(), write: writeGuide, generateImage: generateConceptImage,
    imageProvider: e.IMAGE_PROVIDER, timeoutMs: e.AI_TIMEOUT_MS, guard: withGuard,
  };
}
