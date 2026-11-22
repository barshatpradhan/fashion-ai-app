import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;

describe.skipIf(!url || !service || !anon)('RLS smoke (live Supabase)', () => {
  const mk = (key: string) =>
    createClient(url!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let admin: SupabaseClient;
  let a: SupabaseClient;
  let b: SupabaseClient;
  let aId: string;
  let bId: string;
  let scanId: string;
  let garmentId: string;
  let outfitId: string;
  let reviewedId: string;
  let draftId: string;

  beforeAll(async () => {
    admin = mk(service!);
    a = mk(anon!);
    b = mk(anon!);
    const ra = await a.auth.signInAnonymously();
    const rb = await b.auth.signInAnonymously();
    expect(ra.error).toBeNull();
    expect(rb.error).toBeNull();
    aId = ra.data.user!.id;
    bId = rb.data.user!.id;

    const s = await admin.from('scans').insert({ user_id: aId, image_path: `${aId}/x.jpg` }).select().single();
    expect(s.error).toBeNull();
    scanId = s.data!.id;
    const g = await admin
      .from('garments')
      .insert({ user_id: aId, category: 'clothing', name: 'tee', scan_id: scanId })
      .select()
      .single();
    expect(g.error).toBeNull();
    garmentId = g.data!.id;
    const g2 = await admin.from('garments').insert({ user_id: aId, category: 'accessory' }).select().single();
    expect(g2.error).toBeNull();
    const o = await admin
      .from('outfits')
      .insert({ user_id: aId, items: [garmentId, g2.data!.id] })
      .select()
      .single();
    expect(o.error).toBeNull();
    outfitId = o.data!.id;

    const r = await admin
      .from('kb_entries')
      .insert({ kind: 'repair', title: 'smoke-reviewed', status: 'reviewed' })
      .select()
      .single();
    const d = await admin
      .from('kb_entries')
      .insert({ kind: 'repair', title: 'smoke-draft', status: 'draft' })
      .select()
      .single();
    expect(r.error).toBeNull();
    expect(d.error).toBeNull();
    reviewedId = r.data!.id;
    draftId = d.data!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('kb_entries').delete().in('id', [reviewedId, draftId].filter(Boolean));
    if (aId) await admin.auth.admin.deleteUser(aId);
    if (bId) await admin.auth.admin.deleteUser(bId);
  });

  it("B cannot select A's scans, garments or outfits", async () => {
    for (const [table, id] of [
      ['scans', scanId],
      ['garments', garmentId],
      ['outfits', outfitId],
    ] as const) {
      const own = await a.from(table).select('id').eq('id', id);
      expect(own.data).toHaveLength(1);
      const other = await b.from(table).select('id').eq('id', id);
      expect(other.data ?? []).toHaveLength(0);
    }
  });

  it('a signed-in user cannot insert scans or raise their own credits', async () => {
    const ins = await a.from('scans').insert({ user_id: aId, image_path: `${aId}/forged.jpg` });
    expect(ins.error).not.toBeNull();

    await a.from('profiles').update({ upload_credits: 999 }).eq('id', aId);
    const { data } = await admin.from('profiles').select('upload_credits').eq('id', aId).single();
    expect(data!.upload_credits).toBe(0);

    const del = await a.from('scans').delete().eq('id', scanId);
    expect(del.error).toBeNull();
    const still = await admin.from('scans').select('id').eq('id', scanId);
    expect(still.data).toHaveLength(1);
  });

  it('anyone can read a reviewed kb_entries row', async () => {
    const anonOnly = mk(anon!);
    for (const c of [a, b, anonOnly]) {
      const { data } = await c.from('kb_entries').select('id').eq('id', reviewedId);
      expect(data).toHaveLength(1);
    }
  });

  it('nobody can read a draft kb_entries row', async () => {
    const anonOnly = mk(anon!);
    for (const c of [a, b, anonOnly]) {
      const { data } = await c.from('kb_entries').select('id').eq('id', draftId);
      expect(data ?? []).toHaveLength(0);
    }
  });
});
