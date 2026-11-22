import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runCorrect, confirmedFromCorrections, loadScanState,
  type CorrectionRepo, type CorrectionRow,
} from '@/lib/db/corrections';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

const U = 'user-1';
const SID = 'scan-1';
const vision = (over: Partial<VisionResult> = {}): VisionResult => ({
  is_garment: true, garment_type: 'shirt', category: 'top', parts: {}, pattern: '', colors: [],
  fabric_guess: { value: 'cotton', confidence: 0.5, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: [],
  named_styles: [{ style: 'paisley', confidence: 0.6 }], ...over,
});
const kb = (id: string, kind: KbEntry['kind'], tags: string[]): KbEntry => ({
  id, kind, title: id, body: '', tags, status: 'reviewed',
});
const ENTRIES = [
  kb('h-paisley', 'history', ['paisley']),
  kb('f-silk', 'fabric', ['silk']),
  kb('f-cotton', 'fabric', ['cotton']),
  kb('r-shirt', 'redesign', ['shirt']),
];

function setup(opts: { owner?: string; v?: VisionResult; rows?: CorrectionRow[]; missing?: boolean } = {}) {
  const rows: CorrectionRow[] = [...(opts.rows ?? [])];
  const guides = [{ id: 'g1', outdated: false }, { id: 'g2', outdated: false }];
  const repo: CorrectionRepo = {
    loadScan: vi.fn(async () => opts.missing ? null : ({
      id: SID, userId: opts.owner ?? U, vision: opts.v ?? vision(), fabricFinal: 'cotton',
    })),
    listCorrections: vi.fn(async () => [...rows]),
    insertCorrection: vi.fn(async (_s, c) => { rows.push(c); }),
    setFabricFinal: vi.fn(async () => {}),
    replaceMatches: vi.fn(async () => {}),
    outdateGuides: vi.fn(async () => { guides.forEach((g) => { g.outdated = true; }); }),
    loadReviewedEntries: vi.fn(async () => ENTRIES),
  };
  return { repo, rows, guides };
}
const ids = (l: KbEntry[]) => l.map((e) => e.id);

describe('runCorrect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fabric correction is stored, updates scan, re-matches fabric notes, outdates guides', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'fabric', value: 'Silk' }, s.repo);
    expect(r.status).toBe(200);
    const b = r.body as { match: { fabricNotes: KbEntry[] }; needsFabricConfirm: boolean };
    expect(ids(b.match.fabricNotes)).toEqual(['f-silk']);
    expect(b.needsFabricConfirm).toBe(false);
    expect(s.repo.insertCorrection).toHaveBeenCalledWith(SID, expect.objectContaining({ field: 'fabric', aiValue: 'cotton', userValue: 'silk' }));
    expect(s.repo.setFabricFinal).toHaveBeenCalledWith(SID, 'silk');
    expect(s.repo.replaceMatches).toHaveBeenCalledWith(SID, expect.arrayContaining([expect.objectContaining({ kbEntryId: 'f-silk' })]));
    expect(s.guides.every((g) => g.outdated)).toBe(true);
  });

  it('accepting a 0.6 named style surfaces its history entry and drops the question', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'named_style', value: 'paisley', accept: true }, s.repo);
    const m = (r.body as { match: { history: KbEntry[]; styleQuestions: unknown[] } }).match;
    expect(ids(m.history)).toEqual(['h-paisley']);
    expect(m.styleQuestions).toEqual([]);
    expect(s.repo.insertCorrection).toHaveBeenCalledWith(SID, expect.objectContaining({ field: 'named_style', aiValue: 'paisley', userValue: 'yes' }));
    expect(s.repo.setFabricFinal).not.toHaveBeenCalled();
  });

  it('rejecting removes the question and gives no history', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'named_style', value: 'paisley', accept: false }, s.repo);
    const m = (r.body as { match: { history: KbEntry[]; styleQuestions: unknown[] } }).match;
    expect(m.history).toEqual([]);
    expect(m.styleQuestions).toEqual([]);
  });

  it('re-match uses ALL stored corrections, not just the newest', async () => {
    const s = setup();
    await runCorrect(U, { scanId: SID, field: 'named_style', value: 'paisley', accept: true }, s.repo);
    const r = await runCorrect(U, { scanId: SID, field: 'fabric', value: 'silk' }, s.repo);
    const m = (r.body as { match: { history: KbEntry[]; fabricNotes: KbEntry[] } }).match;
    expect(ids(m.history)).toEqual(['h-paisley']);
    expect(ids(m.fabricNotes)).toEqual(['f-silk']);
  });

  it('a later fabric correction wins over an earlier one', async () => {
    const s = setup();
    await runCorrect(U, { scanId: SID, field: 'fabric', value: 'silk' }, s.repo);
    const r = await runCorrect(U, { scanId: SID, field: 'fabric', value: 'cotton' }, s.repo);
    expect(ids((r.body as { match: { fabricNotes: KbEntry[] } }).match.fabricNotes)).toEqual(['f-cotton']);
  });

  it('garment_type is trimmed and lowercased; empty -> 400', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'garment_type', value: '  Shirt ' }, s.repo);
    expect(r.status).toBe(200);
    expect(s.repo.insertCorrection).toHaveBeenCalledWith(SID, expect.objectContaining({ userValue: 'shirt', aiValue: 'shirt' }));
    const e = await runCorrect(U, { scanId: SID, field: 'garment_type', value: '   ' }, s.repo);
    expect(e).toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('field outside the allowed set -> 400, nothing written', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'colors', value: 'red' }, s.repo);
    expect(r).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(s.repo.insertCorrection).not.toHaveBeenCalled();
  });

  it('fabric not in FABRICS -> 400', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'fabric', value: 'unobtainium' }, s.repo);
    expect(r.status).toBe(400);
    expect(s.repo.insertCorrection).not.toHaveBeenCalled();
  });

  it('named_style without accept -> 400', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'named_style', value: 'paisley' }, s.repo);
    expect(r).toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('named_style not currently in styleQuestions -> 400 invalid_style', async () => {
    const s = setup();
    const r = await runCorrect(U, { scanId: SID, field: 'named_style', value: 'tartan', accept: true }, s.repo);
    expect(r).toEqual({ status: 400, body: { error: 'invalid_style' } });
    expect(s.repo.insertCorrection).not.toHaveBeenCalled();
    expect(s.repo.outdateGuides).not.toHaveBeenCalled();
  });

  it('an answered style cannot be answered again; confident (>=0.8) styles are not questions', async () => {
    const s = setup({ v: vision({ named_styles: [{ style: 'paisley', confidence: 0.6 }, { style: 'tartan', confidence: 0.9 }] }) });
    await runCorrect(U, { scanId: SID, field: 'named_style', value: 'paisley', accept: false }, s.repo);
    const again = await runCorrect(U, { scanId: SID, field: 'named_style', value: 'paisley', accept: true }, s.repo);
    expect(again).toEqual({ status: 400, body: { error: 'invalid_style' } });
    const conf = await runCorrect(U, { scanId: SID, field: 'named_style', value: 'tartan', accept: false }, s.repo);
    expect(conf).toEqual({ status: 400, body: { error: 'invalid_style' } });
  });

  it('a scan owned by another user, or an unknown scan, is 404 with no writes', async () => {
    const s = setup({ owner: 'someone-else' });
    expect(await runCorrect(U, { scanId: SID, field: 'fabric', value: 'silk' }, s.repo)).toEqual({ status: 404, body: { error: 'not_found' } });
    const m = setup({ missing: true });
    expect(await runCorrect(U, { scanId: SID, field: 'fabric', value: 'silk' }, m.repo)).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(s.repo.insertCorrection).not.toHaveBeenCalled();
    expect(s.repo.outdateGuides).not.toHaveBeenCalled();
  });

  it('bad body -> 400', async () => {
    const s = setup();
    expect(await runCorrect(U, null, s.repo)).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(await runCorrect(U, { field: 'fabric', value: 'silk' }, s.repo)).toEqual({ status: 400, body: { error: 'bad_request' } });
  });
});

describe('confirmedFromCorrections / loadScanState', () => {
  const row = (field: CorrectionRow['field'], aiValue: string | null, userValue: string): CorrectionRow => ({ field, aiValue, userValue });
  it('latest per field/style wins and splits accepted/rejected', () => {
    const c = confirmedFromCorrections([
      row('fabric', 'cotton', 'silk'), row('fabric', 'silk', 'linen'),
      row('garment_type', 'shirt', 'blouse'),
      row('named_style', 'paisley', 'yes'), row('named_style', 'paisley', 'no'),
      row('named_style', 'tartan', 'yes'),
    ]);
    expect(c).toEqual({ fabric: 'linen', garmentType: 'blouse', namedStyles: ['tartan'], rejectedStyles: ['paisley'] });
  });
  it('empty -> only empty style lists', () => {
    expect(confirmedFromCorrections([])).toEqual({ namedStyles: [], rejectedStyles: [] });
  });
  it('loadScanState returns scan, confirmed and fabric-correction flag', async () => {
    const s = setup({ rows: [{ field: 'fabric', aiValue: 'cotton', userValue: 'silk' }] });
    const st = await loadScanState(s.repo, SID);
    expect(st?.confirmed.fabric).toBe('silk');
    expect(st?.hasFabricCorrection).toBe(true);
    expect(st?.scan.userId).toBe(U);
  });
});
