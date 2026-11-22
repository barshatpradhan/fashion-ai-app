import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { runAnalyze, ImageNotFoundError, type AnalyzeDeps, type ScanRepo, type ScanRow } from '@/lib/db/scans';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry, MatchResult } from '@/lib/domain/types';
import type { CorrectionRow } from '@/lib/domain/corrections';

const U = 'user-1';
const body = { imagePath: `${U}/a.jpg`, cutoutPath: `${U}/a-cut.png`, imageHash: 'h1' };
const BYTES = new Uint8Array([1, 2, 3]);
const SHASH = createHash('sha256').update(BYTES).digest('hex');
const NOW = new Date('2026-11-22T15:30:00Z');

const vision = (over: Partial<VisionResult> = {}, conf = 0.9): VisionResult => ({
  is_garment: true, garment_type: 'jacket', category: 'outerwear', parts: {}, pattern: '', colors: [],
  fabric_guess: { value: 'denim', confidence: conf, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: ['denim'], named_styles: [], ...over,
});
const kb = (id: string, kind: KbEntry['kind'], tags: string[]): KbEntry => ({
  id, kind, title: id, body: '', tags, status: 'reviewed',
});

function setup(opts: {
  count?: number; demo?: boolean; existing?: ScanRow | null; entries?: KbEntry[];
  analyze?: () => Promise<VisionResult>; corrections?: CorrectionRow[]; premium?: boolean;
} = {}) {
  const repo: ScanRepo = {
    isDemo: vi.fn(async () => opts.demo ?? false),
    isPremium: vi.fn(async () => opts.premium ?? false),
    findByHash: vi.fn(async () => opts.existing ?? null),
    countSince: vi.fn(async () => opts.count ?? 0),
    download: vi.fn(async () => BYTES),
    insertScan: vi.fn(async () => 'scan-new'),
    attachImages: vi.fn(async () => {}),
    insertMatches: vi.fn(async () => {}),
    loadReviewedEntries: vi.fn(async () => opts.entries ?? []),
    listCorrections: vi.fn(async () => opts.corrections ?? []),
  };
  const analyze = vi.fn(opts.analyze ?? (async () => vision()));
  const deps: AnalyzeDeps = { repo, analyze, now: () => NOW, timeoutMs: 1000, guard: async (_k, fn) => fn() };
  return { repo, analyze, deps };
}

describe('runAnalyze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('422 not_a_garment persists a scan (counts to cap) but no matches', async () => {
    const s = setup({ analyze: async () => vision({ is_garment: false }) });
    const r = await runAnalyze(U, body, s.deps);
    expect(r).toEqual({ status: 422, body: { error: 'not_a_garment' } });
    expect(s.repo.insertScan).toHaveBeenCalledTimes(1);
    expect(s.repo.insertMatches).not.toHaveBeenCalled();
  });

  it('re-upload of a non-garment hits the cache: 422, no AI call', async () => {
    const s = setup({ existing: { id: 'old', vision: vision({ is_garment: false }) } });
    const r = await runAnalyze(U, body, s.deps);
    expect(r).toEqual({ status: 422, body: { error: 'not_a_garment' } });
    expect(s.analyze).not.toHaveBeenCalled();
  });

  it('cache hit on a scan whose images were deleted re-attaches this upload, no AI call', async () => {
    const s = setup({ existing: { id: 'scan-old', vision: vision(), imagePath: null, cutoutPath: null } });
    const r = await runAnalyze(U, body, s.deps);
    expect(r.status).toBe(200);
    expect((r.body as { scanId: string }).scanId).toBe('scan-old');
    expect(s.repo.attachImages).toHaveBeenCalledWith('scan-old', body.imagePath, body.cutoutPath);
    expect(s.analyze).not.toHaveBeenCalled();
    expect(s.repo.insertScan).not.toHaveBeenCalled();
  });

  it('cache hit on a scan that still has its images leaves the paths alone', async () => {
    const s = setup({ existing: { id: 'scan-old', vision: vision(), imagePath: `${U}/old.jpg`, cutoutPath: `${U}/old-cut.png` } });
    expect((await runAnalyze(U, body, s.deps)).status).toBe(200);
    expect(s.repo.attachImages).not.toHaveBeenCalled();
  });

  it('missing storage object -> 400 image_not_found', async () => {
    const s = setup();
    (s.repo.download as ReturnType<typeof vi.fn>).mockRejectedValue(new ImageNotFoundError());
    const r = await runAnalyze(U, body, s.deps);
    expect(r).toEqual({ status: 400, body: { error: 'image_not_found' } });
    expect(s.analyze).not.toHaveBeenCalled();
  });

  it('uses the server sha256, not the client hash, for lookup, guard key and insert', async () => {
    const s = setup();
    const guard = vi.fn(async (_k: string, fn: () => Promise<unknown>) => fn());
    await runAnalyze(U, { ...body, imageHash: 'client-lies' }, { ...s.deps, guard: guard as unknown as AnalyzeDeps['guard'] });
    expect(s.repo.findByHash).toHaveBeenCalledWith(U, SHASH);
    expect(guard.mock.calls[0][0]).toBe(`scan:${SHASH}`);
    expect(s.repo.insertScan).toHaveBeenCalledWith(expect.objectContaining({ imageHash: SHASH }));
  });

  it('mismatched client hash still resolves the cached scan by server hash', async () => {
    const s = setup({ existing: { id: 'scan-old', vision: vision() } });
    (s.repo.findByHash as ReturnType<typeof vi.fn>).mockImplementation(async (_u: string, h: string) =>
      h === SHASH ? { id: 'scan-old', vision: vision() } : null);
    const r = await runAnalyze(U, { ...body, imageHash: 'wrong' }, s.deps);
    expect((r.body as { scanId: string }).scanId).toBe('scan-old');
    expect(s.analyze).not.toHaveBeenCalled();
  });

  it.each([new AiRateLimitError(), new AiTimeoutError(), new AiBadOutputError()])('503 ai_busy on %s, nothing written', async (err) => {
    const s = setup({ analyze: async () => { throw err; } });
    const r = await runAnalyze(U, body, s.deps);
    expect(r).toEqual({ status: 503, body: { error: 'ai_busy' } });
    expect(s.repo.insertScan).not.toHaveBeenCalled();
  });

  it('unknown errors propagate', async () => {
    const s = setup({ analyze: async () => { throw new Error('boom'); } });
    await expect(runAnalyze(U, body, s.deps)).rejects.toThrow('boom');
  });

  it('429 daily_cap at 20 for non-demo, counting from UTC midnight', async () => {
    const s = setup({ count: 20 });
    const r = await runAnalyze(U, body, s.deps);
    expect(r).toEqual({ status: 429, body: { error: 'daily_cap' } });
    expect(s.repo.countSince).toHaveBeenCalledWith(U, new Date('2026-11-22T00:00:00.000Z'));
    expect(s.analyze).not.toHaveBeenCalled();
  });

  it('allows the 20th scan (19 so far)', async () => {
    const r = await runAnalyze(U, body, setup({ count: 19 }).deps);
    expect(r.status).toBe(200);
  });

  it('demo user is exempt from the cap', async () => {
    const r = await runAnalyze(U, body, setup({ count: 50, demo: true }).deps);
    expect(r.status).toBe(200);
  });

  it('passes demo flag and scan key to the guard', async () => {
    const s = setup({ demo: true });
    const guard = vi.fn(async (_k: string, fn: () => Promise<unknown>) => fn());
    await runAnalyze(U, body, { ...s.deps, guard: guard as unknown as AnalyzeDeps['guard'] });
    expect(guard).toHaveBeenCalledWith(`scan:${SHASH}`, expect.any(Function), { timeoutMs: 1000, demo: true });
  });

  it('repeated imageHash returns earlier scan with no AI call, even over the cap', async () => {
    const existing: ScanRow = { id: 'scan-old', vision: vision() };
    const s = setup({ existing, count: 99 });
    const r = await runAnalyze(U, body, s.deps);
    expect(r.status).toBe(200);
    expect((r.body as { scanId: string }).scanId).toBe('scan-old');
    expect(s.analyze).toHaveBeenCalledTimes(0);
    expect(s.repo.countSince).not.toHaveBeenCalled();
    expect(s.repo.insertScan).not.toHaveBeenCalled();
  });

  it('fabric confidence 0.62 needs confirm; 0.7 does not', async () => {
    const a = await runAnalyze(U, body, setup({ analyze: async () => vision({}, 0.62) }).deps);
    expect((a.body as { needsFabricConfirm: boolean }).needsFabricConfirm).toBe(true);
    const b = await runAnalyze(U, body, setup({ analyze: async () => vision({}, 0.7) }).deps);
    expect((b.body as { needsFabricConfirm: boolean }).needsFabricConfirm).toBe(false);
  });

  it('400 when imagePath is outside the user folder; nothing downloaded', async () => {
    const s = setup();
    const r = await runAnalyze(U, { ...body, imagePath: 'other/a.jpg' }, s.deps);
    expect(r).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(s.repo.download).not.toHaveBeenCalled();
  });

  it('400 on missing fields', async () => {
    const r = await runAnalyze(U, { imagePath: 'x' }, setup().deps);
    expect(r.status).toBe(400);
  });

  it('stores scan and tag matches, and never touches profile credits', async () => {
    const entries = [kb('r1', 'redesign', ['denim', 'jacket']), kb('f1', 'fabric', ['denim']), kb('x', 'redesign', ['silk'])];
    const s = setup({ entries });
    const r = await runAnalyze(U, body, s.deps);
    expect(r.status).toBe(200);
    expect((r.body as { scanId: string }).scanId).toBe('scan-new');
    expect(s.repo.insertScan).toHaveBeenCalledWith(expect.objectContaining({
      userId: U, imagePath: body.imagePath, cutoutPath: body.cutoutPath, imageHash: SHASH,
      fabricFinal: 'denim', fabricSource: 'vision', modelName: expect.any(String), modelVersion: expect.any(String),
    }));
    const call = (s.repo.insertMatches as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('scan-new');
    expect(call[1].map((m: { kbEntryId: string }) => m.kbEntryId).sort()).toEqual(['f1', 'r1']);
    expect(call[1].every((m: { score: number }) => m.score > 0)).toBe(true);
    // The repo exposes no credit/profile-writing method at all.
    expect(Object.keys(s.repo).some((k) => /credit|spend|refill/i.test(k))).toBe(false);
  });

  describe('cache hit reflects stored corrections', () => {
    const entries = [
      kb('r-denim', 'redesign', ['denim', 'jacket']),
      kb('r-wool', 'redesign', ['wool', 'jacket-x']),
      kb('h-tartan', 'history', ['tartan']),
      kb('f-wool', 'fabric', ['wool']),
    ];
    const lowConf = vision({ named_styles: [{ style: 'tartan', confidence: 0.6 }] }, 0.5);

    it('without corrections: vision fabric, confirm prompt and style question as before', async () => {
      const s = setup({ existing: { id: 'scan-old', vision: lowConf }, entries });
      const r = await runAnalyze(U, body, s.deps);
      const b = r.body as { match: MatchResult; needsFabricConfirm: boolean };
      expect(b.needsFabricConfirm).toBe(true);
      expect(b.match.recipes.map((e) => e.id)).toEqual(['r-denim']);
      expect(b.match.styleQuestions.map((q) => q.style)).toEqual(['tartan']);
      expect(s.repo.listCorrections).toHaveBeenCalledWith('scan-old');
    });

    it('re-matches with the corrected fabric and accepted style; no fabric confirm once corrected', async () => {
      const s = setup({
        existing: { id: 'scan-old', vision: lowConf }, entries,
        corrections: [
          { field: 'fabric', aiValue: 'denim', userValue: 'wool' },
          { field: 'named_style', aiValue: 'tartan', userValue: 'yes' },
        ],
      });
      const r = await runAnalyze(U, body, s.deps);
      const b = r.body as { match: MatchResult; needsFabricConfirm: boolean; fabric: string };
      expect(r.status).toBe(200);
      expect(b.needsFabricConfirm).toBe(false);
      expect(b.fabric).toBe('wool');
      expect(b.match.fabricNotes.map((e) => e.id)).toEqual(['f-wool']);
      expect(b.match.history.map((e) => e.id)).toEqual(['h-tartan']);
      expect(b.match.styleQuestions).toEqual([]);
      expect(s.analyze).not.toHaveBeenCalled();
    });

    it('a rejected style is not asked again on a cache hit', async () => {
      const s = setup({
        existing: { id: 'scan-old', vision: lowConf }, entries,
        corrections: [{ field: 'named_style', aiValue: 'tartan', userValue: 'no' }],
      });
      const b = (await runAnalyze(U, body, s.deps)).body as { match: MatchResult; needsFabricConfirm: boolean };
      expect(b.match.styleQuestions).toEqual([]);
      expect(b.match.history).toEqual([]);
      expect(b.needsFabricConfirm).toBe(true);
    });
  });

  it('fresh scans report the vision fabric as the effective fabric', async () => {
    const r = await runAnalyze(U, body, setup().deps);
    expect((r.body as { fabric: string }).fabric).toBe('denim');
  });

  describe('recipe redaction', () => {
    const recipe = (id: string, difficulty: KbEntry['difficulty']): KbEntry => ({
      id, kind: 'redesign', title: `Recipe ${id}`, body: `Open the seam on ${id}. Secret detail.`, tags: ['denim'],
      difficulty, tools: ['seam ripper'], steps: ['unpick', 'press'],
      sources: [{ citation: 'c', url: 'https://example.org', accessed: '2026-11-01' }], status: 'reviewed',
    });
    const entries = [recipe('r-free', 'beginner'), recipe('r-pro', 'advanced'), recipe('r-pro2', 'intermediate')];
    type R = Record<string, unknown>;
    const recipesOf = (r: Awaited<ReturnType<typeof runAnalyze>>) =>
      (r.body as { match: { freeRecipeId: string; recipes: R[] } }).match;

    it('free user (fresh scan): only the free recipe is complete; locked ones have no body/steps/tools/sources', async () => {
      const s = setup({ entries });
      const m = recipesOf(await runAnalyze(U, body, s.deps));
      expect(m.freeRecipeId).toBe('r-free');
      expect(m.recipes.find((r) => r.id === 'r-free')).toEqual(entries[0]);
      for (const id of ['r-pro', 'r-pro2']) {
        const locked = m.recipes.find((r) => r.id === id)!;
        expect(Object.keys(locked).sort()).toEqual(['difficulty', 'id', 'kind', 'teaser', 'title']);
        expect(locked.teaser).toBe(`Open the seam on ${id}.`);
        expect(JSON.stringify(locked)).not.toContain('Secret detail');
      }
      // Persistence still records every match.
      const rows = (s.repo.insertMatches as ReturnType<typeof vi.fn>).mock.calls[0][1] as { kbEntryId: string }[];
      expect(rows.map((x) => x.kbEntryId).sort()).toEqual(['r-free', 'r-pro', 'r-pro2']);
    });

    it('free user (cache hit): locked recipes are redacted too', async () => {
      const s = setup({ entries, existing: { id: 'scan-old', vision: vision() } });
      const m = recipesOf(await runAnalyze(U, body, s.deps));
      expect(m.recipes.find((r) => r.id === 'r-pro')).not.toHaveProperty('body');
      expect(m.recipes.find((r) => r.id === 'r-pro')).not.toHaveProperty('steps');
    });

    it.each([{ premium: true }, { demo: true }])('%o: every recipe is complete', async (opts) => {
      const m = recipesOf(await runAnalyze(U, body, setup({ entries, ...opts }).deps));
      expect(m.recipes).toEqual(entries);
    });
  });
});
