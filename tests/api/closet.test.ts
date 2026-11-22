import { describe, it, expect, vi } from 'vitest';
import {
  runClosetAction, loadCloset, filterTags, DuplicateGarmentError,
  type ClosetRepo, type ClosetDeps, type GarmentRow, type ClosetScan, type RecipeGate,
} from '@/lib/db/closet';
import type { CreditRepo, CreditKind } from '@/lib/db/credits';
import type { AllowanceState } from '@/lib/domain/allowance';
import { REFILL_MS } from '@/lib/domain/allowance';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { CorrectionRow } from '@/lib/domain/corrections';
import { runAnalyze, type ScanRepo } from '@/lib/db/scans';

const U = 'user-1';
const OTHER = 'user-2';
const NOW = new Date('2026-11-22T12:00:00Z');

const vision = (over: Partial<VisionResult> = {}): VisionResult => ({
  is_garment: true, garment_type: 'shirt', category: 'top', parts: {}, pattern: 'stripes', colors: [],
  fabric_guess: { value: 'cotton', confidence: 0.9, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: ['stripes', 'long-sleeve', 'not-a-tag'], named_styles: [], ...over,
});

type Profile = { premium: boolean; demo: boolean; upload: AllowanceState; look: AllowanceState };

function world(opts: { profile?: Partial<Profile>; gate?: RecipeGate } = {}) {
  const profile: Profile = {
    premium: false, demo: false,
    upload: { freeUsed: 0, credits: 0, refillAt: null },
    look: { freeUsed: 0, credits: 0, refillAt: null },
    ...opts.profile,
  };
  const scans = new Map<string, ClosetScan & { corrections: CorrectionRow[] }>();
  const garments = new Map<string, GarmentRow>();
  const activity: { userId: string; kind: string; garmentId: string | null }[] = [];
  const storage = new Set<string>();
  let seq = 0;

  const addScan = (id: string, over: Partial<ClosetScan> = {}) => {
    const s = {
      id, userId: U, vision: vision(), fabricFinal: 'cotton',
      imagePath: `${U}/${id}.jpg`, cutoutPath: `${U}/${id}-cutout.png`, corrections: [], ...over,
    };
    scans.set(id, s);
    if (s.imagePath) storage.add(s.imagePath);
    if (s.cutoutPath) storage.add(s.cutoutPath);
    return s;
  };
  const addGarment = (over: Partial<GarmentRow> = {}): GarmentRow => {
    const g: GarmentRow = {
      id: `g-${++seq}`, userId: U, scanId: null, category: 'clothing', name: 'Shirt', imagePath: null,
      cutoutPath: null, imageKind: 'photo', tags: [], status: 'active', sourceGarmentId: null, recipeId: null,
      createdAt: new Date(NOW.getTime() - seq * 1000).toISOString(), ...over,
    };
    garments.set(g.id, g);
    return g;
  };

  const repo: ClosetRepo = {
    loadScan: vi.fn(async (id: string) => {
      const s = scans.get(id);
      if (!s) return null;
      const { corrections: _c, ...rest } = s;
      return { ...rest };
    }),
    listCorrections: vi.fn(async (id: string) => [...(scans.get(id)?.corrections ?? [])]),
    getGarment: vi.fn(async (id: string) => (garments.has(id) ? { ...garments.get(id)! } : null)),
    listGarments: vi.fn(async (userId: string) => [...garments.values()].filter((g) => g.userId === userId)),
    garmentsForScan: vi.fn(async (scanId: string) => [...garments.values()].filter((g) => g.scanId === scanId).map((g) => g.id)),
    insertGarment: vi.fn(async (g) => {
      if (g.scanId && [...garments.values()].some((x) => x.scanId === g.scanId)) throw new DuplicateGarmentError();
      const row = addGarment({ ...g, status: 'active' });
      return row.id;
    }),
    linkScan: vi.fn(async (id: string, scanId: string, tags: string[]) => {
      if ([...garments.values()].some((x) => x.scanId === scanId)) throw new DuplicateGarmentError();
      const g = garments.get(id)!;
      garments.set(id, { ...g, scanId, tags });
    }),
    setStatus: vi.fn(async (id: string, from, to) => {
      const g = garments.get(id);
      if (!g || g.status !== from) return false;
      garments.set(id, { ...g, status: to });
      return true;
    }),
    deleteGarment: vi.fn(async (id: string) => { garments.delete(id); }),
    insertActivity: vi.fn(async (userId: string, kind, garmentId: string | null) => { activity.push({ userId, kind, garmentId }); }),
    clearScanImages: vi.fn(async (scanId: string) => {
      const s = scans.get(scanId)!;
      scans.set(scanId, { ...s, imagePath: null, cutoutPath: null });
    }),
    removeObjects: vi.fn(async (paths: string[]) => { paths.forEach((p) => storage.delete(p)); }),
    signedUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]))),
  };

  const credits: CreditRepo = {
    read: vi.fn(async (_u: string, kind: CreditKind) => ({
      tier: { premium: profile.premium, exempt: profile.demo },
      state: { ...profile[kind] },
      rawRefillAt: profile[kind].refillAt ? profile[kind].refillAt!.toISOString() : null,
    })),
    conditionalUpdate: vi.fn(async (_u: string, kind: CreditKind, old: AllowanceState, next: AllowanceState) => {
      const cur = profile[kind];
      if (cur.freeUsed !== old.freeUsed || cur.credits !== old.credits) return false;
      profile[kind] = { ...next };
      return true;
    }),
  };

  const gate: RecipeGate = opts.gate ?? vi.fn(async () => ({ ok: true as const, recipeTitle: 'Cropped boxy shirt', conceptPath: `${U}/concept-scan-1-r1.png` }));
  const deps: ClosetDeps = { repo, credits, now: () => NOW, recipeGate: gate };
  return { deps, repo, credits, profile, scans, garments, activity, storage, addScan, addGarment, gate };
}

const post = (w: ReturnType<typeof world>, body: unknown, userId = U) => runClosetAction(userId, body, w.deps);

describe('save_scan', () => {
  it('spends 1 Upload for a free user with freeUsed 9 and writes a clothing garment + upload activity', async () => {
    const w = world({ profile: { upload: { freeUsed: 9, credits: 0, refillAt: null } } });
    w.addScan('scan-1');
    const r = await post(w, { action: 'save_scan', scanId: 'scan-1' });
    expect(r.status).toBe(200);
    expect(w.profile.upload.freeUsed).toBe(10);
    const [g] = [...w.garments.values()];
    expect(g).toMatchObject({ category: 'clothing', scanId: 'scan-1', imageKind: 'photo', cutoutPath: `${U}/scan-1-cutout.png` });
    expect(g.tags).toEqual(expect.arrayContaining(['shirt', 'cotton', 'stripes', 'long-sleeve']));
    expect(g.tags).not.toContain('not-a-tag');
    expect(w.activity).toEqual([{ userId: U, kind: 'upload', garmentId: g.id }]);
  });

  it('returns 402 no_uploads with nextCreditAt when the weekly pool is empty', async () => {
    const w = world({ profile: { upload: { freeUsed: 9, credits: 0, refillAt: null } } });
    w.addScan('scan-1');
    w.addScan('scan-2');
    expect((await post(w, { action: 'save_scan', scanId: 'scan-1' })).status).toBe(200);
    const r = await post(w, { action: 'save_scan', scanId: 'scan-2' });
    expect(r.status).toBe(402);
    expect(r.body).toEqual({ error: 'no_uploads', nextCreditAt: new Date(NOW.getTime() + REFILL_MS).toISOString() });
    expect(w.garments.size).toBe(1);
  });

  it('rejects saving the same scan twice with 409 already_saved and does not spend', async () => {
    const w = world();
    w.addScan('scan-1');
    await post(w, { action: 'save_scan', scanId: 'scan-1' });
    const before = { ...w.profile.upload };
    const r = await post(w, { action: 'save_scan', scanId: 'scan-1' });
    expect(r).toEqual({ status: 409, body: { error: 'already_saved' } });
    expect(w.profile.upload).toEqual(before);
  });

  it("404s another user's scan and a non-garment scan without spending", async () => {
    const w = world();
    w.addScan('theirs', { userId: OTHER });
    w.addScan('nope', { vision: vision({ is_garment: false }) });
    expect((await post(w, { action: 'save_scan', scanId: 'theirs' })).status).toBe(404);
    expect((await post(w, { action: 'save_scan', scanId: 'nope' })).status).toBe(404);
    expect(w.profile.upload.freeUsed).toBe(0);
  });

  it('refunds the Upload when the garment write fails', async () => {
    const w = world();
    w.addScan('scan-1');
    vi.mocked(w.repo.insertGarment).mockRejectedValueOnce(new Error('db down'));
    await expect(post(w, { action: 'save_scan', scanId: 'scan-1' })).rejects.toThrow('db down');
    expect(w.profile.upload.freeUsed).toBe(0);
  });

  it('a refund failure does not mask the original error', async () => {
    const w = world();
    w.addScan('scan-1');
    vi.mocked(w.repo.insertGarment).mockRejectedValueOnce(new Error('db down'));
    vi.mocked(w.credits.read).mockResolvedValueOnce({ tier: { premium: false, exempt: false }, state: { freeUsed: 0, credits: 0, refillAt: null }, rawRefillAt: null });
    vi.mocked(w.credits.read).mockRejectedValueOnce(new Error('refund read failed'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(post(w, { action: 'save_scan', scanId: 'scan-1' })).rejects.toThrow('db down');
    err.mockRestore();
  });

  it('premium users are unlimited', async () => {
    const w = world({ profile: { premium: true, upload: { freeUsed: 10, credits: 0, refillAt: NOW } } });
    w.addScan('scan-1');
    expect((await post(w, { action: 'save_scan', scanId: 'scan-1' })).status).toBe(200);
    expect(w.credits.conditionalUpdate).not.toHaveBeenCalled();
  });
});

describe('quick_add and accessory', () => {
  it('quick_add makes a clothing garment with no scan, filtered tags, and spends 1 Upload', async () => {
    const w = world();
    const r = await post(w, {
      action: 'quick_add', imagePath: `${U}/a.jpg`, cutoutPath: `${U}/a-cutout.png`,
      tags: ['Denim', 'jacket', 'shopping-link', 'paisley'], name: '  Blue jacket ',
    });
    expect(r.status).toBe(200);
    const [g] = [...w.garments.values()];
    expect(g).toMatchObject({ category: 'clothing', scanId: null, name: 'Blue jacket', imagePath: `${U}/a.jpg`, cutoutPath: `${U}/a-cutout.png` });
    expect(g.tags).toEqual(['denim', 'jacket', 'paisley']);
    expect(w.profile.upload.freeUsed).toBe(1);
    expect(w.activity.map((a) => a.kind)).toEqual(['upload']);
  });

  it("an accessory garment has category 'accessory' and no scan_id", async () => {
    const w = world();
    const r = await post(w, { action: 'accessory', imagePath: `${U}/b.jpg`, cutoutPath: `${U}/b.jpg`, name: 'Belt', tags: ['belt'] });
    expect(r.status).toBe(200);
    const [g] = [...w.garments.values()];
    expect(g.category).toBe('accessory');
    expect(g.scanId).toBeNull();
    expect(w.profile.upload.freeUsed).toBe(1);
  });

  it("rejects paths outside the user's folder without spending", async () => {
    const w = world();
    for (const p of [`${OTHER}/x.jpg`, `${U}/../${OTHER}/x.jpg`]) {
      const r = await post(w, { action: 'quick_add', imagePath: p, cutoutPath: `${U}/c.png`, tags: [], name: 'x' });
      expect(r.status).toBe(400);
    }
    expect(w.profile.upload.freeUsed).toBe(0);
  });

  it('filterTags keeps only vocabulary terms, lowercased and deduped', () => {
    expect(filterTags(['Silk', 'silk', ' Breton-Stripe ', 42, 'nope'])).toEqual(['silk', 'breton-stripe']);
    expect(filterTags('silk')).toEqual([]);
  });
});

describe('full_scan', () => {
  it('links a quick-added garment to a scan without spending', async () => {
    const w = world();
    w.addScan('scan-9');
    const g = w.addGarment({ tags: ['denim'] });
    const r = await post(w, { action: 'full_scan', garmentId: g.id, scanId: 'scan-9' });
    expect(r.status).toBe(200);
    expect(w.garments.get(g.id)!.scanId).toBe('scan-9');
    expect(w.garments.get(g.id)!.tags).toEqual(expect.arrayContaining(['denim', 'shirt', 'cotton']));
    expect(w.credits.read).not.toHaveBeenCalled();
  });

  it('409s when the garment is already linked', async () => {
    const w = world();
    w.addScan('scan-9');
    const g = w.addGarment({ scanId: 'scan-1' });
    expect((await post(w, { action: 'full_scan', garmentId: g.id, scanId: 'scan-9' })).status).toBe(409);
  });
});

describe('made_this', () => {
  it('works with zero credits: source becomes transformed and a reconstruct activity is written', async () => {
    const w = world({ profile: { upload: { freeUsed: 10, credits: 0, refillAt: NOW } } });
    w.addScan('scan-1');
    const src = w.addGarment({ scanId: 'scan-1', tags: ['shirt'] });
    const r = await post(w, { action: 'made_this', sourceGarmentId: src.id, recipeId: 'r1' });
    expect(r.status).toBe(200);
    expect(w.garments.get(src.id)!.status).toBe('transformed');
    const made = [...w.garments.values()].find((g) => g.sourceGarmentId === src.id)!;
    expect(made).toMatchObject({ imageKind: 'concept', cutoutPath: `${U}/concept-scan-1-r1.png`, recipeId: 'r1', status: 'active', name: 'Cropped boxy shirt' });
    expect(w.activity).toEqual([{ userId: U, kind: 'reconstruct', garmentId: made.id }]);
    expect(w.credits.read).not.toHaveBeenCalled();
  });

  it('a given photo makes image_kind photo', async () => {
    const w = world();
    w.addScan('scan-1');
    const src = w.addGarment({ scanId: 'scan-1' });
    const r = await post(w, { action: 'made_this', sourceGarmentId: src.id, recipeId: 'r1', photoPath: `${U}/made.png` });
    expect(r.status).toBe(200);
    const made = [...w.garments.values()].find((g) => g.sourceGarmentId === src.id)!;
    expect(made).toMatchObject({ imageKind: 'photo', cutoutPath: `${U}/made.png` });
  });

  it('rolls back the new garment and the source status if the activity write fails', async () => {
    const w = world();
    w.addScan('scan-1');
    const src = w.addGarment({ scanId: 'scan-1' });
    vi.mocked(w.repo.insertActivity).mockRejectedValueOnce(new Error('db down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(post(w, { action: 'made_this', sourceGarmentId: src.id, recipeId: 'r1' })).rejects.toThrow('db down');
    err.mockRestore();
    expect(w.garments.get(src.id)!.status).toBe('active');
    expect(w.garments.size).toBe(1);
  });

  it('enforces the recipe gate, ownership and active status', async () => {
    const gate = vi.fn(async () => ({ ok: false as const, status: 402 as const, error: 'premium_required' }));
    const w = world({ gate });
    w.addScan('scan-1');
    const src = w.addGarment({ scanId: 'scan-1' });
    expect((await post(w, { action: 'made_this', sourceGarmentId: src.id, recipeId: 'r2' })).status).toBe(402);
    expect(w.garments.get(src.id)!.status).toBe('active');

    const w2 = world();
    const theirs = w2.addGarment({ userId: OTHER, scanId: 'scan-x' });
    expect((await post(w2, { action: 'made_this', sourceGarmentId: theirs.id, recipeId: 'r1' })).status).toBe(404);
    const done = w2.addGarment({ scanId: 'scan-y', status: 'transformed' });
    expect((await post(w2, { action: 'made_this', sourceGarmentId: done.id, recipeId: 'r1' })).status).toBe(409);
  });
});

describe('delete', () => {
  it('removes Storage objects, never refunds, keeps the scan row with null image paths', async () => {
    const w = world({ profile: { upload: { freeUsed: 3, credits: 0, refillAt: null } } });
    w.addScan('scan-1');
    w.scans.get('scan-1')!.corrections.push({ field: 'fabric', aiValue: 'cotton', userValue: 'linen' });
    const g = w.addGarment({ scanId: 'scan-1', imagePath: `${U}/scan-1.jpg`, cutoutPath: `${U}/scan-1-cutout.png` });
    const r = await post(w, { action: 'delete', garmentId: g.id });
    expect(r.status).toBe(200);
    expect(w.garments.has(g.id)).toBe(false);
    expect(w.storage.size).toBe(0);
    expect(w.profile.upload.freeUsed).toBe(3);
    expect(w.credits.conditionalUpdate).not.toHaveBeenCalled();
    const scan = w.scans.get('scan-1')!;
    expect(scan).toMatchObject({ imagePath: null, cutoutPath: null });
    expect(scan.corrections).toHaveLength(1);
  });

  it('delete garment → re-scan the same image (cache hit) → save_scan succeeds again', async () => {
    const w = world();
    w.addScan('scan-1');
    expect((await post(w, { action: 'save_scan', scanId: 'scan-1' })).status).toBe(200);
    const [g] = [...w.garments.values()];
    expect((await post(w, { action: 'delete', garmentId: g.id })).status).toBe(200);
    expect(w.scans.get('scan-1')).toMatchObject({ imagePath: null, cutoutPath: null });

    // The same photo uploaded again: analyze hits the hash cache for scan-1 (shared fake store).
    const scanRepo: ScanRepo = {
      isDemo: async () => false, isPremium: async () => false,
      findByHash: async () => {
        const s = w.scans.get('scan-1')!;
        return { id: s.id, vision: s.vision, imagePath: s.imagePath, cutoutPath: s.cutoutPath };
      },
      countSince: async () => 0, download: async () => new Uint8Array([1]),
      insertScan: vi.fn(async () => 'scan-new'), insertMatches: async () => {},
      attachImages: async (id, imagePath, cutoutPath) => {
        w.scans.set(id, { ...w.scans.get(id)!, imagePath, cutoutPath });
        w.storage.add(imagePath);
        w.storage.add(cutoutPath);
      },
      loadReviewedEntries: async () => [], listCorrections: async () => [],
    };
    const analyze = vi.fn();
    const a = await runAnalyze(U, { imagePath: `${U}/again.jpg`, cutoutPath: `${U}/again-cut.png`, imageHash: 'x' },
      { repo: scanRepo, analyze, now: () => NOW, timeoutMs: 1000, guard: async (_k, fn) => fn() });
    expect(a.status).toBe(200);
    expect(analyze).not.toHaveBeenCalled();
    expect(w.scans.get('scan-1')).toMatchObject({ imagePath: `${U}/again.jpg`, cutoutPath: `${U}/again-cut.png` });

    const r = await post(w, { action: 'save_scan', scanId: 'scan-1' });
    expect(r.status).toBe(200);
    expect([...w.garments.values()][0]).toMatchObject({ scanId: 'scan-1', cutoutPath: `${U}/again-cut.png` });
  });

  it('does not remove a concept image (it belongs to the guide)', async () => {
    const w = world();
    w.storage.add(`${U}/concept-scan-1-r1.png`);
    const g = w.addGarment({ imageKind: 'concept', cutoutPath: `${U}/concept-scan-1-r1.png`, sourceGarmentId: 'g-x' });
    expect((await post(w, { action: 'delete', garmentId: g.id })).status).toBe(200);
    expect(w.storage.has(`${U}/concept-scan-1-r1.png`)).toBe(true);
  });

  it("404s another user's garment", async () => {
    const w = world();
    const g = w.addGarment({ userId: OTHER });
    expect((await post(w, { action: 'delete', garmentId: g.id })).status).toBe(404);
    expect(w.garments.has(g.id)).toBe(true);
  });
});

describe('delete_scan', () => {
  it("removes an unsaved scan's images and keeps its text + corrections", async () => {
    const w = world();
    w.addScan('scan-1');
    w.scans.get('scan-1')!.corrections.push({ field: 'fabric', aiValue: 'cotton', userValue: 'linen' });
    const r = await post(w, { action: 'delete_scan', scanId: 'scan-1' });
    expect(r.status).toBe(200);
    expect(w.storage.size).toBe(0);
    expect(w.scans.get('scan-1')).toMatchObject({ imagePath: null, cutoutPath: null, fabricFinal: 'cotton' });
    expect(w.scans.get('scan-1')!.corrections).toHaveLength(1);
  });

  it('refuses with 409 when a garment references the scan', async () => {
    const w = world();
    w.addScan('scan-1');
    w.addGarment({ scanId: 'scan-1' });
    expect(await post(w, { action: 'delete_scan', scanId: 'scan-1' })).toEqual({ status: 409, body: { error: 'scan_in_use' } });
    expect(w.storage.size).toBe(2);
  });
});

describe('bad input', () => {
  it('400s an unknown action or missing fields', async () => {
    const w = world();
    expect((await post(w, { action: 'shop' })).status).toBe(400);
    expect((await post(w, null)).status).toBe(400);
    expect((await post(w, { action: 'save_scan' })).status).toBe(400);
  });
});

describe('GET closet', () => {
  it('after a downgrade (premium → free) with 40 garments, still returns all 40', async () => {
    const w = world({ profile: { premium: true } });
    for (let i = 0; i < 40; i++) w.addGarment({ cutoutPath: `${U}/g${i}.png` });
    w.profile.premium = false;
    const r = await loadCloset(U, w.deps);
    expect(r.body.garments).toHaveLength(40);
    expect(r.body.garments[0].imageUrl).toMatch(/^https:\/\/signed\//);
  });

  it('lists active garments first and reports both allowances', async () => {
    const w = world({ profile: { upload: { freeUsed: 10, credits: 2, refillAt: NOW }, look: { freeUsed: 4, credits: 0, refillAt: null } } });
    const t = w.addGarment({ status: 'transformed' });
    const a = w.addGarment();
    const r = await loadCloset(U, w.deps);
    expect(r.body.garments.map((g) => g.id)).toEqual([a.id, t.id]);
    expect(r.body.allowance.uploads).toEqual({ remaining: 2, nextCreditAt: new Date(NOW.getTime() + REFILL_MS).toISOString() });
    expect(r.body.allowance.looks).toEqual({ remaining: 6, nextCreditAt: null });
  });

  it('premium shows unlimited', async () => {
    const w = world({ profile: { premium: true } });
    const r = await loadCloset(U, w.deps);
    expect(r.body.allowance.uploads).toEqual({ remaining: 'unlimited', nextCreditAt: null });
  });

  it('demo user switched to Free sees real counters (exempt only from spending)', async () => {
    const w = world({ profile: { demo: true, premium: false, upload: { freeUsed: 3, credits: 0, refillAt: null } } });
    const r = await loadCloset(U, w.deps);
    expect(r.body.allowance.uploads).toEqual({ remaining: 7, nextCreditAt: null });
    expect(r.body.allowance.looks).toEqual({ remaining: 10, nextCreditAt: null });
  });
});
