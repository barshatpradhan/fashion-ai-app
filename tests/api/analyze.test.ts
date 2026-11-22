import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAnalyze, type AnalyzeDeps, type ScanRepo, type ScanRow } from '@/lib/db/scans';
import { AiRateLimitError, AiBadOutputError, AiTimeoutError } from '@/lib/ai/errors';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

const U = 'user-1';
const body = { imagePath: `${U}/a.jpg`, cutoutPath: `${U}/a-cut.png`, imageHash: 'h1' };
const NOW = new Date('2026-11-22T15:30:00Z');

const vision = (over: Partial<VisionResult> = {}, conf = 0.9): VisionResult => ({
  is_garment: true, garment_type: 'jacket', category: 'outerwear', parts: {}, pattern: '', colors: [],
  fabric_guess: { value: 'denim', confidence: conf, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: ['denim'], named_styles: [], ...over,
});
const kb = (id: string, kind: KbEntry['kind'], tags: string[]): KbEntry => ({
  id, kind, title: id, body: '', tags, status: 'reviewed',
});

function setup(opts: { count?: number; demo?: boolean; existing?: ScanRow | null; entries?: KbEntry[]; analyze?: () => Promise<VisionResult> } = {}) {
  const repo: ScanRepo = {
    isDemo: vi.fn(async () => opts.demo ?? false),
    findByHash: vi.fn(async () => opts.existing ?? null),
    countSince: vi.fn(async () => opts.count ?? 0),
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    insertScan: vi.fn(async () => 'scan-new'),
    insertMatches: vi.fn(async () => {}),
    loadReviewedEntries: vi.fn(async () => opts.entries ?? []),
  };
  const analyze = vi.fn(opts.analyze ?? (async () => vision()));
  const deps: AnalyzeDeps = { repo, analyze, now: () => NOW, timeoutMs: 1000, guard: async (_k, fn) => fn() };
  return { repo, analyze, deps };
}

describe('runAnalyze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('422 not_a_garment and writes nothing', async () => {
    const s = setup({ analyze: async () => vision({ is_garment: false }) });
    const r = await runAnalyze(U, body, s.deps);
    expect(r).toEqual({ status: 422, body: { error: 'not_a_garment' } });
    expect(s.repo.insertScan).not.toHaveBeenCalled();
    expect(s.repo.insertMatches).not.toHaveBeenCalled();
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
    expect(guard).toHaveBeenCalledWith('scan:h1', expect.any(Function), { timeoutMs: 1000, demo: true });
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
      userId: U, imagePath: body.imagePath, cutoutPath: body.cutoutPath, imageHash: 'h1',
      fabricFinal: 'denim', fabricSource: 'vision', modelName: expect.any(String), modelVersion: expect.any(String),
    }));
    const call = (s.repo.insertMatches as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('scan-new');
    expect(call[1].map((m: { kbEntryId: string }) => m.kbEntryId).sort()).toEqual(['f1', 'r1']);
    expect(call[1].every((m: { score: number }) => m.score > 0)).toBe(true);
    // The repo exposes no credit/profile-writing method at all.
    expect(Object.keys(s.repo).some((k) => /credit|spend|refill/i.test(k))).toBe(false);
  });
});
