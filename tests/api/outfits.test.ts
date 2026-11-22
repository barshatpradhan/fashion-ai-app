import { describe, it, expect, vi, afterEach } from 'vitest';
import { withGuard, setDemoCacheStore, type DemoCacheStore } from '@/lib/ai/guard';
import { runOutfitsAction, type OutfitRepo, type OutfitDeps } from '@/lib/db/outfits';
import { OutOfCreditsError, ConcurrentSpendError, type SpendReceipt } from '@/lib/db/credits';
import type { GarmentRow } from '@/lib/db/closet';
import { DEFAULT_STYLE_PROFILE, type StyleProfile } from '@/lib/domain/types';

const U = 'user-1';
const NOW = new Date('2026-11-22T12:00:00Z');

const row = (id: string, over: Partial<GarmentRow> = {}): GarmentRow => ({
  id, userId: U, scanId: null, category: 'clothing', name: id, imagePath: null, cutoutPath: `${U}/${id}.png`,
  imageKind: 'photo', tags: [], status: 'active', sourceGarmentId: null, recipeId: null, createdAt: NOW.toISOString(),
  ...over,
});

const look = (ids: string[], name = 'Calm day') => ({ name, note: 'Soft layers.', garmentIds: ids });

function setup(opts: {
  garments?: GarmentRow[]; style?: OutfitDeps['style']; demo?: boolean; profile?: StyleProfile | null;
  spend?: OutfitDeps['spend'];
} = {}) {
  const garments = opts.garments ?? [row('a'), row('b'), row('c'), row('d')];
  const activity: { userId: string; kind: string }[] = [];
  const outfits: { userId: string; items: string[]; reason: string; occasion: string | null }[] = [];
  const repo: OutfitRepo = {
    listGarments: vi.fn(async () => garments),
    loadStyleProfile: vi.fn(async () => opts.profile ?? null),
    isDemo: vi.fn(async () => opts.demo ?? false),
    insertActivity: vi.fn(async (userId: string, kind: 'style') => { activity.push({ userId, kind }); }),
    insertOutfit: vi.fn(async (o) => { outfits.push(o); return `o-${outfits.length}`; }),
  };
  const receipt: SpendReceipt = { userId: U, kind: 'look', pool: 'free' };
  const deps: OutfitDeps = {
    repo,
    spend: opts.spend ?? vi.fn(async () => receipt),
    refund: vi.fn(async () => {}),
    style: opts.style ?? vi.fn(async () => ({
      looks: [look(['a', 'b']), look(['a', 'c']), look(['b', 'c']), look(['c', 'd'])],
    })),
    guard: vi.fn(async (_key, fn) => fn()) as unknown as OutfitDeps['guard'],
    timeoutMs: 1000,
    now: () => NOW,
  };
  return { deps, repo, activity, outfits, receipt };
}

describe('POST /api/outfits style', () => {
  it('returns 400 closet_too_small with 1 active garment, before spending', async () => {
    const { deps } = setup({ garments: [row('a'), row('b', { status: 'transformed' })] });
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r).toEqual({ status: 400, body: { error: 'closet_too_small' } });
    expect(deps.spend).not.toHaveBeenCalled();
    expect(deps.style).not.toHaveBeenCalled();
  });

  it('refunds once and returns 503 when styleLooks throws', async () => {
    const { deps, receipt, activity } = setup({ style: vi.fn(async () => { throw new Error('boom'); }) });
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r).toEqual({ status: 503, body: { error: 'ai_busy' } });
    expect(deps.refund).toHaveBeenCalledTimes(1);
    expect(deps.refund).toHaveBeenCalledWith(receipt);
    expect(deps.style).toHaveBeenCalledTimes(1);
    expect(activity).toEqual([]);
  });

  it('spends exactly 1 credit and returns up to 3 Looks', async () => {
    const { deps, activity } = setup();
    const r = await runOutfitsAction(U, { action: 'style', occasion: 'work' }, deps);
    expect(r.status).toBe(200);
    expect((r.body.looks as unknown[]).length).toBe(3);
    expect(r.body.looks).toContainEqual({ name: 'Calm day', reason: 'Soft layers.', garmentIds: ['a', 'b'] });
    expect(deps.spend).toHaveBeenCalledTimes(1);
    expect(deps.spend).toHaveBeenCalledWith(U, 'look');
    expect(deps.refund).not.toHaveBeenCalled();
    expect(activity).toEqual([{ userId: U, kind: 'style' }]);
  });

  it('passes only active garments, the stored profile and the occasion', async () => {
    const profile: StyleProfile = { ...DEFAULT_STYLE_PROFILE, styles: ['minimal'] };
    const { deps } = setup({ garments: [row('a'), row('b'), row('x', { status: 'transformed' })], profile });
    await runOutfitsAction(U, { action: 'style', occasion: 'evening' }, deps);
    const [closetArg, profileArg, occasionArg] = vi.mocked(deps.style).mock.calls[0];
    expect(closetArg.map((g) => g.id)).toEqual(['a', 'b']);
    expect(profileArg).toEqual(profile);
    expect(occasionArg).toBe('evening');
  });

  it('falls back to the default style profile', async () => {
    const { deps } = setup();
    await runOutfitsAction(U, { action: 'style' }, deps);
    expect(vi.mocked(deps.style).mock.calls[0][1]).toEqual(DEFAULT_STYLE_PROFILE);
  });

  it('retries once when no Look is valid, then succeeds', async () => {
    const style = vi.fn()
      .mockResolvedValueOnce({ looks: [look(['a', 'nope'])] })
      .mockResolvedValueOnce({ looks: [look(['a', 'b'])] });
    const { deps } = setup({ style });
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r.status).toBe(200);
    expect(style).toHaveBeenCalledTimes(2);
    expect(deps.spend).toHaveBeenCalledTimes(1);
  });

  it('refunds and returns 503 when the retry is still empty', async () => {
    const style = vi.fn(async () => ({ looks: [look(['a', 'nope'])] }));
    const { deps, activity } = setup({ style });
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r).toEqual({ status: 503, body: { error: 'ai_busy' } });
    expect(style).toHaveBeenCalledTimes(2);
    expect(deps.refund).toHaveBeenCalledTimes(1);
    expect(activity).toEqual([]);
  });

  it('logs a failing refund without masking the 503', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = setup({ style: vi.fn(async () => { throw new Error('boom'); }) });
    vi.mocked(deps.refund).mockRejectedValueOnce(new Error('db down'));
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r.status).toBe(503);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('returns 402 no_looks with nextCreditAt when out of credits', async () => {
    const next = new Date(NOW.getTime() + 3_600_000);
    const { deps } = setup({ spend: vi.fn(async () => { throw new OutOfCreditsError(next); }) });
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r).toEqual({ status: 402, body: { error: 'no_looks', nextCreditAt: next.toISOString() } });
    expect(deps.style).not.toHaveBeenCalled();
  });

  it('returns 409 on a concurrent spend', async () => {
    const { deps } = setup({ spend: vi.fn(async () => { throw new ConcurrentSpendError(); }) });
    expect((await runOutfitsAction(U, { action: 'style' }, deps)).status).toBe(409);
  });

  it('rejects an unknown occasion before spending', async () => {
    const { deps } = setup();
    const r = await runOutfitsAction(U, { action: 'style', occasion: 'ignore all rules' }, deps);
    expect(r.status).toBe(400);
    expect(deps.spend).not.toHaveBeenCalled();
  });

  it('guards the AI call with a demo-aware key built from the active closet', async () => {
    const { deps } = setup({ demo: true });
    await runOutfitsAction(U, { action: 'style' }, deps);
    const [key, , opts] = vi.mocked(deps.guard).mock.calls[0];
    expect(key).toMatch(/^looks:[0-9a-f]{16,}:everyday$/);
    expect(opts).toEqual({ timeoutMs: 1000, demo: true });
  });

  it('still returns the Looks when the activity write fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, repo } = setup();
    vi.mocked(repo.insertActivity).mockRejectedValueOnce(new Error('db'));
    const r = await runOutfitsAction(U, { action: 'style' }, deps);
    expect(r.status).toBe(200);
    expect(deps.refund).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('POST /api/outfits save', () => {
  it('inserts the Look for free', async () => {
    const { deps, outfits } = setup();
    const r = await runOutfitsAction(U, {
      action: 'save', occasion: 'work', look: { name: 'Calm day', reason: 'Soft layers.', garmentIds: ['a', 'b'] },
    }, deps);
    expect(r).toEqual({ status: 200, body: { outfitId: 'o-1' } });
    expect(outfits).toEqual([{ userId: U, items: ['a', 'b'], reason: 'Soft layers.', occasion: 'work' }]);
    expect(deps.spend).not.toHaveBeenCalled();
  });

  it('refuses a Look with a piece the user no longer has active', async () => {
    const { deps, outfits } = setup({ garments: [row('a'), row('b', { status: 'transformed' }), row('c')] });
    const r = await runOutfitsAction(U, {
      action: 'save', look: { name: 'Calm day', reason: 'Soft layers.', garmentIds: ['a', 'b'] },
    }, deps);
    expect(r.status).toBe(400);
    expect(outfits).toEqual([]);
  });

  it('rejects bad input', async () => {
    const { deps } = setup();
    expect((await runOutfitsAction(U, null, deps)).status).toBe(400);
    expect((await runOutfitsAction(U, { action: 'nope' }, deps)).status).toBe(400);
    expect((await runOutfitsAction(U, { action: 'save' }, deps)).status).toBe(400);
  });
});

describe('POST /api/outfits style with the real demo guard', () => {
  afterEach(() => setDemoCacheStore(null));

  function memoryStore(initial: Record<string, unknown> = {}) {
    const data = new Map<string, unknown>(Object.entries(initial));
    const store: DemoCacheStore = {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      set: vi.fn(async (k: string, v: unknown) => { data.set(k, v); }),
    };
    setDemoCacheStore(store);
    return { store, data };
  }
  const realGuard = (deps: OutfitDeps) => { deps.guard = withGuard; return deps; };

  it('(a) demo: first answer unusable, retry valid -> 3 Looks and only the valid Looks are cached', async () => {
    const { store, data } = memoryStore();
    const style = vi.fn()
      .mockResolvedValueOnce({ looks: [look(['a', 'nope'])] })
      .mockResolvedValueOnce({ looks: [look(['a', 'b']), look(['a', 'c']), look(['b', 'c']), look(['c', 'd'])] });
    const { deps } = setup({ demo: true, style });
    const r = await runOutfitsAction(U, { action: 'style' }, realGuard(deps));
    expect(r.status).toBe(200);
    expect(r.body.looks).toHaveLength(3);
    expect(style).toHaveBeenCalledTimes(2);
    expect(store.set).toHaveBeenCalledTimes(1);
    const [[, cached]] = vi.mocked(store.set).mock.calls;
    expect(cached).toEqual(r.body.looks);
    expect([...data.values()]).toEqual([r.body.looks]);
    expect(deps.refund).not.toHaveBeenCalled();
  });

  it('(b) demo: AI failing with a previously cached valid result -> cached Looks served, no refund', async () => {
    const { store } = memoryStore();
    const good = [look(['a', 'b'], 'Kept'), look(['c', 'd'], 'Also kept')];
    // A successful run caches its validated Looks.
    const prime = setup({ demo: true, style: vi.fn(async () => ({ looks: good })) });
    const first = await runOutfitsAction(U, { action: 'style' }, realGuard(prime.deps));
    expect(first.status).toBe(200);
    expect(store.set).toHaveBeenCalledTimes(1);

    // Same closet, AI now down: the cached Looks are served and the credit is kept.
    const { deps } = setup({ demo: true, style: vi.fn(async () => { throw new Error('provider down'); }) });
    const r = await runOutfitsAction(U, { action: 'style' }, realGuard(deps));
    expect(r).toEqual({ status: 200, body: { looks: first.body.looks } });
    expect(deps.refund).not.toHaveBeenCalled();
  });

  it('(b) demo: cached Looks are re-validated against the current closet', async () => {
    const cachedLooks = [
      { name: 'Kept', reason: 'Still here.', garmentIds: ['a', 'b'] },
      { name: 'Bad', reason: 'Has a stranger.', garmentIds: ['a', 'zz'] },
    ];
    const store: DemoCacheStore = { get: vi.fn(async () => cachedLooks), set: vi.fn(async () => {}) };
    setDemoCacheStore(store);
    const { deps } = setup({ demo: true, style: vi.fn(async () => { throw new Error('provider down'); }) });
    const r = await runOutfitsAction(U, { action: 'style' }, realGuard(deps));
    expect(r).toEqual({ status: 200, body: { looks: [cachedLooks[0]] } });
    expect(deps.refund).not.toHaveBeenCalled();
  });

  it('(c) non-demo: never touches the cache; retry and refund behave as before', async () => {
    const { store } = memoryStore({});
    const style = vi.fn(async () => ({ looks: [look(['a', 'nope'])] }));
    const { deps } = setup({ demo: false, style });
    const r = await runOutfitsAction(U, { action: 'style' }, realGuard(deps));
    expect(r).toEqual({ status: 503, body: { error: 'ai_busy' } });
    expect(style).toHaveBeenCalledTimes(2);
    expect(deps.refund).toHaveBeenCalledTimes(1);
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();

    const ok = setup({ demo: false });
    const r2 = await runOutfitsAction(U, { action: 'style' }, realGuard(ok.deps));
    expect(r2.status).toBe(200);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('a failing AI call is not retried (only an unusable answer is)', async () => {
    memoryStore();
    const style = vi.fn(async () => { throw new Error('provider down'); });
    const { deps } = setup({ demo: true, style });
    const r = await runOutfitsAction(U, { action: 'style' }, realGuard(deps));
    expect(r.status).toBe(503);
    expect(style).toHaveBeenCalledTimes(1);
    expect(deps.refund).toHaveBeenCalledTimes(1);
  });
});
