import 'server-only';
import { createHash } from 'node:crypto';
import { adminClient } from '@/lib/db/admin';
import { getEnvFor } from '@/lib/env';
import { SCAN_ERRORS, hasFullRecipeAccess } from '@/lib/db/scans';
import { loadScanState, supabaseCorrectionRepo, type CorrectionRepo } from '@/lib/db/corrections';
import { matchEntries } from '@/lib/domain/matching';
import { writeGuide } from '@/lib/ai/writer';
import { generateConceptImage } from '@/lib/ai/imageGen';
import { withGuard } from '@/lib/ai/guard';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry, Confirmed } from '@/lib/domain/types';

export const GUIDE_ERRORS = { notFound: 'not_found', premiumRequired: 'premium_required' } as const;
const BUCKET = 'garments';
const SIGNED_URL_TTL_S = 60 * 10;

export type GuideBody = { steps: string[]; tools: string[]; historyRefs: string[] };
export type StoredGuide = { id: string; body: GuideBody; afterImagePath: string | null; imageProvider?: string | null; outdated: boolean };

/**
 * How Concepts are made. Stored with the provider ("openai:photo-v1"); a Concept made another way (the old
 * text-only prompt) is regenerated once, the next time someone opens that guide.
 */
export const CONCEPT_VERSION = 'photo-v1';
const isCurrentConcept = (g: StoredGuide | null) => Boolean(g?.afterImagePath && g.imageProvider?.endsWith(`:${CONCEPT_VERSION}`));

export interface GuideRepo extends CorrectionRepo {
  getGuide(scanId: string, kbEntryId: string): Promise<StoredGuide | null>;
  /** Insert or replace the guide text for (scan, recipe); clears `outdated`. Keeps any stored image. */
  saveGuide(scanId: string, kbEntryId: string, body: GuideBody): Promise<void>;
  /** Record the image on the guide row, creating an outdated placeholder row if none exists yet. */
  saveImage(scanId: string, kbEntryId: string, path: string, provider: string): Promise<void>;
  upload(path: string, png: Uint8Array): Promise<void>;
  /** The scan's original photo (never the cut-out), or null when its images were deleted. */
  scanPhoto(scanId: string): Promise<Uint8Array | null>;
  signedUrl(path: string): Promise<string>;
}

export type GuideDeps = {
  repo: GuideRepo;
  write: (v: VisionResult, recipe: KbEntry, history: KbEntry[]) => Promise<GuideBody>;
  generateImage: (v: VisionResult, recipe: KbEntry, photo: Uint8Array | null) => Promise<Uint8Array>;
  imageProvider: string;
  /** Text (guide writer) timeout. */
  timeoutMs: number;
  /** Image generation timeout: separate and longer (image models often exceed the text timeout). */
  renderTimeoutMs: number;
  guard: <T>(key: string, fn: () => Promise<T>, opts: { timeoutMs: number; demo: boolean }) => Promise<T>;
};

type Fail = { status: 400 | 402 | 404 | 503; body: { error: string } };
const fail = (status: Fail['status'], error: string): Fail => ({ status, body: { error } });

export type GuideResult =
  | { status: 200; body: { steps: string[]; tools: string[]; history: KbEntry[]; historyRefs: string[]; outdated: false; story: { garmentType: string; fabric: string; recipeTitle: string; difficulty: KbEntry['difficulty'] | null } } }
  | Fail;
export type RenderResult = { status: 200; body: { imageUrl: string } } | Fail;

type Resolved = { scanId: string; vision: VisionResult; recipe: KbEntry; history: KbEntry[]; demo: boolean; stateKey: string; garmentType: string; fabric: string };

/** Short hash of the effective corrected state; versions demo cache keys so a cached fallback never answers for another state. */
export function stateKeyOf(c: Confirmed): string {
  const norm = [c.fabric ?? '', c.garmentType ?? '', [...c.namedStyles].sort(), [...(c.rejectedStyles ?? [])].sort()];
  return createHash('sha1').update(JSON.stringify(norm)).digest('hex').slice(0, 10);
}

/**
 * Shared by guide, render and the closet's "I made this": validates input, ownership, the CURRENT match
 * and the Premium gate.
 */
export async function resolveGuide(userId: string, input: unknown, repo: CorrectionRepo): Promise<Resolved | Fail> {
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
  return {
    scanId: b.scanId, vision: state.scan.vision, recipe, history: match.history, demo, stateKey: stateKeyOf(state.confirmed),
    garmentType: state.confirmed.garmentType ?? state.scan.vision.garment_type,
    fabric: state.confirmed.fabric ?? state.scan.fabricFinal ?? state.scan.vision.fabric_guess.value,
  };
}

export const isFail = (r: Resolved | Fail): r is Fail => 'body' in r;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/** No links in AI-written guide text (§6.6 rule 8): strip URLs, tidy what is left, drop empty lines. */
export function stripUrls(lines: string[]): string[] {
  return lines
    .map((l) => l.replace(URL_RE, '').replace(/\(\s*\)/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim())
    .filter((l) => l.length > 0 && /[a-z0-9]/i.test(l));
}
const isAiError = (e: unknown) =>
  e instanceof AiRateLimitError || e instanceof AiTimeoutError || e instanceof AiBadOutputError;

/** The AI reading with the user's corrections applied: what the writer and the image generator must describe. */
function correctedVision(r: Resolved): VisionResult {
  return { ...r.vision, garment_type: r.garmentType, fabric_guess: { ...r.vision.fabric_guess, value: r.fabric } };
}

export async function runGuide(userId: string, input: unknown, deps: GuideDeps): Promise<GuideResult> {
  const r = await resolveGuide(userId, input, deps.repo);
  if (isFail(r)) return r;
  const { repo } = deps;
  const stored = await repo.getGuide(r.scanId, r.recipe.id);
  let body: GuideBody;
  if (stored && !stored.outdated && stored.body?.steps?.length) {
    body = stored.body;
  } else {
    try {
      body = await deps.guard(
        `guide:${r.scanId}:${r.recipe.id}:${r.stateKey}`,
        () => deps.write(correctedVision(r), r.recipe, r.history),
        { timeoutMs: deps.timeoutMs, demo: r.demo },
      );
    } catch (err) {
      if (isAiError(err)) return fail(503, SCAN_ERRORS.aiBusy);
      throw err;
    }
    await repo.saveGuide(r.scanId, r.recipe.id, body);
  }
  // The sources section and Story card always get the full verified (reviewed, tag-matched) history; the
  // writer's historyRefs only highlight which entries the guide drew on.
  const refs = new Set(body.historyRefs ?? []);
  return {
    status: 200,
    body: {
      steps: stripUrls(body.steps), tools: stripUrls(body.tools ?? []),
      history: r.history, historyRefs: r.history.filter((h) => refs.has(h.id)).map((h) => h.id), outdated: false,
      story: { garmentType: r.garmentType, fabric: r.fabric, recipeTitle: r.recipe.title, difficulty: r.recipe.difficulty ?? null },
    },
  };
}

export async function runRender(userId: string, input: unknown, deps: GuideDeps): Promise<RenderResult> {
  const r = await resolveGuide(userId, input, deps.repo);
  if (isFail(r)) return r;
  const { repo } = deps;
  const stored = await repo.getGuide(r.scanId, r.recipe.id);
  if (stored && isCurrentConcept(stored)) return { status: 200, body: { imageUrl: await repo.signedUrl(stored.afterImagePath!) } };

  const path = `${userId}/concept-${r.scanId}-${r.recipe.id}.png`;
  let savedPath: string;
  try {
    // Only the path (a string) goes through the JSON-only demo cache, never the image bytes.
    savedPath = await deps.guard(
      `render:${CONCEPT_VERSION}:${r.scanId}:${r.recipe.id}:${r.stateKey}`,
      async () => {
        // The real garment goes to the image model, so the Concept keeps its colours and print.
        const photo = await repo.scanPhoto(r.scanId).catch(() => null);
        const png = await deps.generateImage(correctedVision(r), r.recipe, photo);
        await repo.upload(path, png);
        return path;
      },
      { timeoutMs: deps.renderTimeoutMs, demo: r.demo },
    );
  } catch (err) {
    if (isAiError(err)) return fail(503, SCAN_ERRORS.aiBusy);
    throw err;
  }
  await repo.saveImage(r.scanId, r.recipe.id, savedPath, `${deps.imageProvider}:${CONCEPT_VERSION}`);
  return { status: 200, body: { imageUrl: await repo.signedUrl(savedPath) } };
}

export function supabaseGuideRepo(): GuideRepo {
  const db = adminClient();
  const base = supabaseCorrectionRepo();
  const find = async (scanId: string, kbEntryId: string): Promise<StoredGuide | null> => {
    const { data, error } = await db.from('guides').select('id, body, after_image_path, image_provider, outdated')
      .eq('scan_id', scanId).eq('kb_entry_id', kbEntryId).order('id').limit(1).maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data.id as string, body: data.body as GuideBody,
          afterImagePath: (data.after_image_path as string | null) ?? null, imageProvider: (data.image_provider as string | null) ?? null, outdated: data.outdated === true,
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
    async scanPhoto(scanId) {
      const { data, error } = await db.from('scans').select('image_path').eq('id', scanId).maybeSingle();
      if (error || !data?.image_path) return null;
      const file = await db.storage.from(BUCKET).download(data.image_path as string);
      return file.data ? new Uint8Array(await file.data.arrayBuffer()) : null;
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
  const e = getEnvFor(['IMAGE_PROVIDER', 'AI_TIMEOUT_MS', 'RENDER_TIMEOUT_MS']);
  return {
    repo: supabaseGuideRepo(), write: writeGuide, generateImage: generateConceptImage,
    imageProvider: e.IMAGE_PROVIDER, timeoutMs: e.AI_TIMEOUT_MS, renderTimeoutMs: e.RENDER_TIMEOUT_MS, guard: withGuard,
  };
}
