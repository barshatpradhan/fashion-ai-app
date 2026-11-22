import { describe, it, expect } from 'vitest';
import { matchEntries } from '@/lib/domain/matching';
import type { KbEntry, Confirmed } from '@/lib/domain/types';
import type { VisionResult } from '@/lib/ai/visionSchema';

const vision = (over: Partial<VisionResult> = {}): VisionResult => ({
  is_garment: true,
  garment_type: 'shirt',
  category: 'top',
  parts: {},
  pattern: 'stripes',
  colors: [],
  fabric_guess: { value: 'cotton', confidence: 0.8, alternatives: [] },
  condition_notes: '',
  visible_techniques: [],
  tags: ['stripes'],
  named_styles: [],
  ...over,
});
const none: Confirmed = { namedStyles: [] };
const entry = (o: Partial<KbEntry> & { id: string }): KbEntry => ({
  kind: 'redesign', title: o.id, body: '', tags: [], status: 'reviewed', ...o,
});
const hist = entry({ id: 'h-breton', kind: 'history', tags: ['breton-stripe'] });

describe('matchEntries history guard', () => {
  it('no named style -> no history', () => {
    expect(matchEntries(vision(), none, [hist]).history).toEqual([]);
  });
  it('confidence 0.85 -> history', () => {
    const v = vision({ named_styles: [{ style: 'breton-stripe', confidence: 0.85 }] });
    expect(matchEntries(v, none, [hist]).history).toEqual([hist]);
  });
  it('confidence 0.6 -> question, no history', () => {
    const v = vision({ named_styles: [{ style: 'breton-stripe', confidence: 0.6 }] });
    const r = matchEntries(v, none, [hist]);
    expect(r.history).toEqual([]);
    expect(r.styleQuestions).toEqual([{ style: 'breton-stripe', confidence: 0.6 }]);
  });
  it('0.6 plus confirmed -> history, not asked', () => {
    const v = vision({ named_styles: [{ style: 'breton-stripe', confidence: 0.6 }] });
    const r = matchEntries(v, { namedStyles: ['breton-stripe'] }, [hist]);
    expect(r.history).toEqual([hist]);
    expect(r.styleQuestions).toEqual([]);
  });
  it('rejected style never produces history or questions', () => {
    const hi = vision({ named_styles: [{ style: 'breton-stripe', confidence: 0.9 }] });
    const lo = vision({ named_styles: [{ style: 'breton-stripe', confidence: 0.6 }] });
    const c: Confirmed = { namedStyles: [], rejectedStyles: ['breton-stripe'] };
    expect(matchEntries(hi, c, [hist]).history).toEqual([]);
    expect(matchEntries(lo, c, [hist]).styleQuestions).toEqual([]);
  });
  it('history never matches via generic tags', () => {
    const h = entry({ id: 'h2', kind: 'history', tags: ['stripes', 'shirt', 'breton-stripe'] });
    expect(matchEntries(vision(), none, [h]).history).toEqual([]);
  });
  it('draft entries never appear', () => {
    const v = vision({ named_styles: [{ style: 'breton-stripe', confidence: 0.9 }] });
    const d = { ...hist, status: 'draft' as const };
    const r = matchEntries(v, none, [d, entry({ id: 'r', tags: ['shirt'], status: 'draft' })]);
    expect(r.history).toEqual([]);
    expect(r.recipes).toEqual([]);
  });
});

describe('matchEntries recipes', () => {
  const adv = entry({ id: 'adv', difficulty: 'advanced', tags: ['shirt', 'cotton', 'stripes'] });
  const beg = entry({ id: 'beg', difficulty: 'beginner', tags: ['shirt', 'cotton'] });
  const mid = entry({ id: 'mid', difficulty: 'intermediate', tags: ['shirt'] });
  it('free recipe is the beginner one', () => {
    const r = matchEntries(vision(), none, [mid, beg, adv]);
    expect(r.recipes.map((x) => x.id)).toEqual(['adv', 'beg', 'mid']);
    expect(r.freeRecipeId).toBe('beg');
  });
  it('no beginner -> top ranked is free', () => {
    expect(matchEntries(vision(), none, [mid, adv]).freeRecipeId).toBe('adv');
  });
  it('no recipes -> null', () => {
    expect(matchEntries(vision(), none, []).freeRecipeId).toBeNull();
  });
  it('caps at 4', () => {
    const six = Array.from({ length: 6 }, (_, i) => entry({ id: `r${i}`, tags: ['shirt'] }));
    expect(matchEntries(vision(), none, six).recipes).toHaveLength(4);
  });
  it('ties keep input order, zero overlap excluded, case-insensitive', () => {
    const a = entry({ id: 'a', tags: ['Shirt'] });
    const b = entry({ id: 'b', tags: ['shirt'] });
    const z = entry({ id: 'z', tags: ['skirt'] });
    expect(matchEntries(vision(), none, [a, z, b]).recipes.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('matchEntries fabric notes and accessories', () => {
  const cotton = entry({ id: 'f-cotton', kind: 'fabric', tags: ['cotton'] });
  const linen = entry({ id: 'f-linen', kind: 'fabric', tags: ['linen'] });
  it('c.fabric override changes fabric notes', () => {
    expect(matchEntries(vision({ tags: [] }), none, [cotton, linen]).fabricNotes).toEqual([cotton]);
    expect(matchEntries(vision({ tags: [] }), { namedStyles: [], fabric: 'linen' }, [cotton, linen]).fabricNotes).toEqual([linen]);
  });
  it('accessories return empty lists', () => {
    const v = vision({ category: 'accessory', named_styles: [{ style: 'breton-stripe', confidence: 0.9 }] });
    const r = matchEntries(v, none, [hist, cotton, entry({ id: 'r', tags: ['shirt'] })]);
    expect(r).toEqual({ history: [], recipes: [], fabricNotes: [], freeRecipeId: null, styleQuestions: [] });
  });
});
