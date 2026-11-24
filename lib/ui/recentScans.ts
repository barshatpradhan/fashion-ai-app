/**
 * The scan page's "Recent scans" strip: the user's latest finished scans with a signed thumbnail each.
 * Reopening one posts its stored paths to /api/analyze, which answers from the hash cache: no AI call, no
 * daily-cap spend. Reads go through RLS (own rows, own Storage folder) with the browser client.
 */
import { humanize } from '@/lib/ui/result';
import type { ScanSource } from '@/components/ResultView';

export type RecentScan = { id: string; name: string; thumb: string; isCutout: boolean; source: ScanSource };

type Row = { id: string; image_path: string; cutout_path: string | null; image_hash: string | null; vision_json: unknown };
type Err = { message: string } | null;

/** The two calls the loader needs; the real one wraps the Supabase browser client. */
export interface RecentScansClient {
  recentRows(limit: number): Promise<{ data: Row[] | null; error: Err }>;
  signUrls(paths: string[]): Promise<{ data: { path: string | null; signedUrl: string }[] | null; error: Err }>;
}

const THUMB_TTL_S = 60 * 60;

export function supabaseRecentScans(db: {
  from: (t: 'scans') => any; // eslint-disable-line @typescript-eslint/no-explicit-any -- thin adapter over the typed-less client
  storage: { from: (b: string) => { createSignedUrls: (p: string[], ttl: number) => Promise<any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
}): RecentScansClient {
  return {
    recentRows: (limit) =>
      db.from('scans')
        .select('id, image_path, cutout_path, image_hash, vision_json')
        .not('vision_json', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit),
    signUrls: (paths) => db.storage.from('garments').createSignedUrls(paths, THUMB_TTL_S),
  };
}

function garmentName(vision: unknown): string | null {
  if (!vision || typeof vision !== 'object') return null;
  const t = (vision as { garment_type?: unknown }).garment_type;
  return typeof t === 'string' && t.trim() ? humanize(t.trim()) : null;
}

/** Newest first, one per photo (by hash), at most `max`. Any failure yields an empty strip, never an error. */
export async function loadRecentScans(client: RecentScansClient, max = 6): Promise<RecentScan[]> {
  try {
    // Over-fetch: re-scans of the same photo are dropped below.
    const { data, error } = await client.recentRows(max * 3);
    if (error || !data) return [];
    const seen = new Set<string>();
    const picked: (Row & { name: string; hash: string })[] = [];
    for (const r of data) {
      const name = garmentName(r.vision_json);
      if (!r.image_hash || !name || seen.has(r.image_hash)) continue;
      seen.add(r.image_hash);
      picked.push({ ...r, name, hash: r.image_hash });
      if (picked.length >= max) break;
    }
    if (!picked.length) return [];
    const thumbPath = (r: Row) => r.cutout_path ?? r.image_path;
    const signed = await client.signUrls(picked.map(thumbPath));
    if (signed.error || !signed.data) return [];
    const urls = new Map(signed.data.filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
    return picked.flatMap((r) => {
      const thumb = urls.get(thumbPath(r));
      if (!thumb) return [];
      const cutoutPath = r.cutout_path ?? r.image_path;
      return [{
        id: r.id, name: r.name, thumb, isCutout: cutoutPath !== r.image_path,
        source: { imagePath: r.image_path, cutoutPath, imageHash: r.hash },
      }];
    });
  } catch {
    return [];
  }
}
