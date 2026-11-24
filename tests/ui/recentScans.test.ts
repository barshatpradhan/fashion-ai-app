import { describe, it, expect } from 'vitest';
import { loadRecentScans, type RecentScansClient } from '@/lib/ui/recentScans';

type Row = { id: string; image_path: string; cutout_path: string | null; image_hash: string | null; vision_json: unknown };

function fake(rows: Row[] | null, opts: { selectError?: boolean; signError?: boolean } = {}) {
  const calls: { limit?: number; signed?: string[] } = {};
  const client: RecentScansClient = {
    async recentRows(limit) {
      calls.limit = limit;
      return opts.selectError ? { data: null, error: { message: 'nope' } } : { data: rows, error: null };
    },
    async signUrls(paths) {
      calls.signed = paths;
      if (opts.signError) return { data: null, error: { message: 'nope' } };
      return { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null };
    },
  };
  return { client, calls };
}

const row = (id: string, hash: string | null, cutout: string | null, type = 'denim jacket'): Row => ({
  id, image_path: `u/${id}.jpg`, cutout_path: cutout, image_hash: hash, vision_json: { garment_type: type },
});

describe('loadRecentScans', () => {
  it('maps rows to thumbnails, preferring the cut-out, and names them from the vision result', async () => {
    const { client, calls } = fake([row('a', 'h1', 'u/a-cutout.png'), row('b', 'h2', null, 'striped shirt')]);
    const out = await loadRecentScans(client, 6);
    expect(calls.limit).toBeGreaterThanOrEqual(6);
    expect(out).toEqual([
      { id: 'a', name: 'Denim jacket', thumb: 'https://signed/u/a-cutout.png', isCutout: true,
        source: { imagePath: 'u/a.jpg', cutoutPath: 'u/a-cutout.png', imageHash: 'h1' } },
      { id: 'b', name: 'Striped shirt', thumb: 'https://signed/u/b.jpg', isCutout: false,
        source: { imagePath: 'u/b.jpg', cutoutPath: 'u/b.jpg', imageHash: 'h2' } },
    ]);
  });

  it('keeps only the newest scan of the same photo and caps the count', async () => {
    const rows = [row('a', 'h1', null), row('b', 'h1', null), row('c', 'h2', null), row('d', 'h3', null)];
    const out = await loadRecentScans(fake(rows).client, 2);
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('skips rows without a hash or a readable vision result', async () => {
    const rows = [row('a', null, null), { ...row('b', 'h2', null), vision_json: null }, row('c', 'h3', null)];
    const out = await loadRecentScans(fake(rows).client, 6);
    expect(out.map((r) => r.id)).toEqual(['c']);
  });

  it('returns nothing (never throws) when the query or signing fails', async () => {
    expect(await loadRecentScans(fake(null, { selectError: true }).client, 6)).toEqual([]);
    expect(await loadRecentScans(fake([row('a', 'h1', null)], { signError: true }).client, 6)).toEqual([]);
  });
});
