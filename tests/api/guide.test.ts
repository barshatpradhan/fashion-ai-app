import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runGuide, runRender, type GuideRepo, type GuideDeps, type StoredGuide, type GuideBody } from '@/lib/db/guides';
import { AiTimeoutError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

const U = 'user-1';
const SID = 'scan-1';
const vision: VisionResult = {
  is_garment: true, garment_type: 'shirt', category: 'top', parts: {}, pattern: '', colors: [],
  fabric_guess: { value: 'cotton', confidence: 0.9, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: [], named_styles: [{ style: 'paisley', confidence: 0.9 }],
};
const kb = (id: string, kind: KbEntry['kind'], tags: string[]): KbEntry => ({
  id, kind, title: id, body: `${id} body.`, tags, status: 'reviewed',
});
const ENTRIES = [
  kb('h-1', 'history', ['paisley']),
  kb('h-2', 'history', ['paisley']),
  { ...kb('r-free', 'redesign', ['shirt']), difficulty: 'beginner' as const },
  kb('r-other', 'redesign', ['shirt']),
  kb('r-nomatch', 'redesign', ['coat']),
];

function setup(opts: { premium?: boolean; demo?: boolean; owner?: string; guide?: StoredGuide | null; refs?: string[]; rows?: import('@/lib/domain/corrections').CorrectionRow[] } = {}) {
  let guide: StoredGuide | null = opts.guide ?? null;
  const repo: GuideRepo = {
    loadScan: vi.fn(async () => ({ id: SID, userId: opts.owner ?? U, vision, fabricFinal: 'cotton' })),
    listCorrections: vi.fn(async () => opts.rows ?? []),
    insertCorrection: vi.fn(), setFabricFinal: vi.fn(), replaceMatches: vi.fn(), outdateGuides: vi.fn(),
    loadReviewedEntries: vi.fn(async () => ENTRIES),
    isDemo: vi.fn(async () => opts.demo ?? false),
    isPremium: vi.fn(async () => opts.premium ?? false),
    getGuide: vi.fn(async () => guide),
    saveGuide: vi.fn(async (_s, _k, body: GuideBody) => { guide = { id: 'g', body, afterImagePath: guide?.afterImagePath ?? null, outdated: false }; }),
    saveImage: vi.fn(async () => {}),
    upload: vi.fn(async () => {}),
    signedUrl: vi.fn(async (p: string) => `https://signed/${p}`),
  };
  const deps: GuideDeps = {
    repo,
    write: vi.fn(async () => ({ steps: ['s1'], tools: ['needle'], historyRefs: opts.refs ?? ['h-1'] })),
    generateImage: vi.fn(async () => new Uint8Array([1, 2, 3])),
    imageProvider: 'gemini', timeoutMs: 1000, renderTimeoutMs: 5000,
    guard: vi.fn(async (_k, fn) => fn()),
  };
  return { repo, deps };
}

const free = (deps: GuideDeps) => runGuide(U, { scanId: SID, recipeId: 'r-free' }, deps);

describe('runGuide', () => {
  beforeEach(() => vi.clearAllMocks());

  it('free user gets 200 for the free recipe and 402 for another', async () => {
    const { deps } = setup();
    expect((await runGuide(U, { scanId: SID, recipeId: 'r-free' }, deps)).status).toBe(200);
    const locked = await runGuide(U, { scanId: SID, recipeId: 'r-other' }, deps);
    expect(locked).toEqual({ status: 402, body: { error: 'premium_required' } });
  });

  it('premium user: 200 for any matched recipe', async () => {
    const { deps } = setup({ premium: true });
    expect((await runGuide(U, { scanId: SID, recipeId: 'r-free' }, deps)).status).toBe(200);
    expect((await runGuide(U, { scanId: SID, recipeId: 'r-other' }, deps)).status).toBe(200);
  });

  it('demo user on Premium: 200 for any matched recipe', async () => {
    const { deps } = setup({ demo: true, premium: true });
    expect((await runGuide(U, { scanId: SID, recipeId: 'r-other' }, deps)).status).toBe(200);
  });

  it('demo user switched to Free: 402 for a locked recipe, 200 for the free one', async () => {
    const { deps } = setup({ demo: true, premium: false });
    expect((await runGuide(U, { scanId: SID, recipeId: 'r-other' }, deps)).status).toBe(402);
    expect((await free(deps)).status).toBe(200);
  });

  it('recipe not in the scan matches: 404', async () => {
    const { deps } = setup({ premium: true });
    const r = await runGuide(U, { scanId: SID, recipeId: 'r-nomatch' }, deps);
    expect(r.status).toBe(404);
  });

  it('scan owned by someone else: 404; bad body: 400', async () => {
    const { deps } = setup({ owner: 'other', premium: true });
    expect((await free(deps)).status).toBe(404);
    expect((await runGuide(U, { scanId: SID }, deps)).status).toBe(400);
  });

  it('reuses a cached non-outdated guide without calling the writer', async () => {
    const { deps } = setup({ premium: true, guide: { id: 'g', body: { steps: ['cached'], tools: [], historyRefs: [] }, afterImagePath: null, outdated: false } });
    const r = await free(deps);
    expect(r.status).toBe(200);
    expect((r.body as { steps: string[] }).steps).toEqual(['cached']);
    expect(deps.write).not.toHaveBeenCalled();
  });

  it('outdated guide: writer called again and flag cleared', async () => {
    const { deps, repo } = setup({ premium: true, guide: { id: 'g', body: { steps: ['old'], tools: [], historyRefs: [] }, afterImagePath: null, outdated: true } });
    const r = await free(deps);
    expect(deps.write).toHaveBeenCalledTimes(1);
    expect(repo.saveGuide).toHaveBeenCalledWith(SID, 'r-free', expect.objectContaining({ steps: ['s1'] }));
    expect(r.body).toMatchObject({ steps: ['s1'], outdated: false });
  });

  it('returns the full matched history; writer refs only highlight (unknown ids dropped)', async () => {
    const { deps } = setup({ premium: true, refs: ['h-1', 'ghost'] });
    const r = await free(deps);
    const body = r.body as { history: KbEntry[]; historyRefs: string[] };
    expect(body.history.map((h) => h.id).sort()).toEqual(['h-1', 'h-2']);
    expect(body.historyRefs).toEqual(['h-1']);
  });

  it('keeps verified history even when the writer cites none', async () => {
    const { deps } = setup({ premium: true, refs: [] });
    const body = (await free(deps)).body as { history: KbEntry[] };
    expect(body.history.map((h) => h.id).sort()).toEqual(['h-1', 'h-2']);
  });

  it('strips URLs from steps and tools before returning', async () => {
    const { deps } = setup({ premium: true });
    (deps.write as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: ['Cut the hem (see https://shop.example.com/x).', 'Fold at www.example.org/fold twice'],
      tools: ['scissors http://buy.example.com', 'https://only.example.com'],
      historyRefs: [],
    });
    const body = (await free(deps)).body as { steps: string[]; tools: string[] };
    expect(body.steps.join(' ')).not.toMatch(/https?:|www\./);
    expect(body.steps[0]).toContain('Cut the hem');
    expect(body.tools).toEqual(['scissors']);
  });

  it('AI failure maps to 503 ai_busy', async () => {
    const { deps } = setup({ premium: true });
    (deps.write as ReturnType<typeof vi.fn>).mockRejectedValue(new AiTimeoutError());
    const r = await free(deps);
    expect(r).toEqual({ status: 503, body: { error: 'ai_busy' } });
  });
});

describe('runRender', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gates like guide: 402 for a locked recipe, 404 for unmatched', async () => {
    const { deps } = setup();
    expect((await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps)).status).toBe(200);
    expect((await runRender(U, { scanId: SID, recipeId: 'r-other' }, deps)).status).toBe(402);
    expect((await runRender(U, { scanId: SID, recipeId: 'r-nomatch' }, deps)).status).toBe(404);
  });

  it('generates, uploads to the user path, stores path + provider, returns a signed url', async () => {
    const { deps, repo } = setup({ premium: true });
    const r = await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps);
    const path = `${U}/concept-${SID}-r-free.png`;
    expect(repo.upload).toHaveBeenCalledWith(path, expect.any(Uint8Array));
    expect(repo.saveImage).toHaveBeenCalledWith(SID, 'r-free', path, 'gemini');
    expect(r).toEqual({ status: 200, body: { imageUrl: `https://signed/${path}` } });
  });

  it('returns the stored image without regenerating', async () => {
    const { deps } = setup({ premium: true, guide: { id: 'g', body: { steps: [], tools: [], historyRefs: [] }, afterImagePath: 'p/x.png', outdated: false } });
    const r = await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps);
    expect(r).toEqual({ status: 200, body: { imageUrl: 'https://signed/p/x.png' } });
    expect(deps.generateImage).not.toHaveBeenCalled();
  });

  it('guards only a string path (never bytes) under the versioned render key', async () => {
    const { deps } = setup({ demo: true });
    await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps);
    const call = (deps.guard as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(new RegExp(`^render:${SID}:r-free:[0-9a-f]{10}$`));
    expect(call[2]).toMatchObject({ demo: true });
    expect(typeof (await call[1]())).toBe('string');
  });

  it('uses the separate render timeout (image generation is slower than text)', async () => {
    const { deps } = setup({ premium: true });
    await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps);
    expect((deps.guard as ReturnType<typeof vi.fn>).mock.calls[0][2]).toMatchObject({ timeoutMs: 5000 });
  });

  it('AI failure maps to 503 ai_busy', async () => {
    const { deps } = setup({ premium: true });
    (deps.generateImage as ReturnType<typeof vi.fn>).mockRejectedValue(new AiTimeoutError());
    expect(await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps)).toEqual({ status: 503, body: { error: 'ai_busy' } });
  });

  it('after a correction (image cleared, guide outdated) render regenerates instead of returning the old path', async () => {
    const { deps, repo } = setup({ premium: true, guide: { id: 'g', body: { steps: ['old'], tools: [], historyRefs: [] }, afterImagePath: null, outdated: true } });
    const r = await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps);
    expect(deps.generateImage).toHaveBeenCalledTimes(1);
    expect(repo.saveImage).toHaveBeenCalled();
    expect(r.status).toBe(200);
  });
});

describe('demo cache key versioning', () => {
  const keys = async (rows?: Parameters<typeof setup>[0] extends infer O ? (O extends { rows?: infer R } ? R : never) : never) => {
    const { deps } = setup({ demo: true, rows });
    await runGuide(U, { scanId: SID, recipeId: 'r-free' }, deps);
    await runRender(U, { scanId: SID, recipeId: 'r-free' }, deps);
    return (deps.guard as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
  };
  it('guide and render keys change after a correction and are stable otherwise', async () => {
    const a = await keys();
    const a2 = await keys();
    const b = await keys([{ field: 'fabric', aiValue: 'cotton', userValue: 'silk' }]);
    expect(a).toEqual(a2);
    expect(b[0]).not.toEqual(a[0]);
    expect(b[1]).not.toEqual(a[1]);
  });
});
