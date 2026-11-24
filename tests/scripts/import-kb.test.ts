import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseKbCsv, validateRow, toDbRow, importRows, reviewBlocker, type KbCsvRow, type StoredRow } from '@/lib/kb/importRows';

const SRC = JSON.stringify([{ citation: 'Example', url: 'https://example.org/x', accessed: '2026-11-22' }]);
const HEADER = 'id,kind,title,body,tags,difficulty,tools,steps,sources';

function row(over: Partial<KbCsvRow> = {}): KbCsvRow {
  return {
    id: 'h-1', kind: 'history', title: 'T', body: 'B', tags: 'breton-stripe', difficulty: '',
    tools: '', steps: '', sources: SRC, ...over,
  };
}

describe('parseKbCsv', () => {
  it('parses quoted fields, commas and pipes', () => {
    const rows = parseKbCsv(`${HEADER}\nr-1,redesign,"A, B",body,shirt|cotton,beginner,"needle, thread",one|two,\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('A, B');
    expect(rows[0].steps).toBe('one|two');
  });
});

describe('validateRow', () => {
  it('accepts a valid history row', () => expect(validateRow(row())).toEqual([]));
  it('rejects history with empty sources', () => {
    expect(validateRow(row({ sources: '' })).join()).toMatch(/sources/);
    expect(validateRow(row({ sources: '[]' })).join()).toMatch(/sources/);
  });
  it('rejects non-http source urls and malformed sources', () => {
    expect(validateRow(row({ sources: JSON.stringify([{ citation: 'x', url: 'ftp://a', accessed: 'd' }]) })).length).toBeGreaterThan(0);
    expect(validateRow(row({ sources: 'not json' })).length).toBeGreaterThan(0);
    expect(validateRow(row({ sources: JSON.stringify([{ citation: 'x', url: 'https://a.b' }]) })).length).toBeGreaterThan(0);
  });
  it('rejects tags outside the vocabulary', () => {
    expect(validateRow(row({ tags: 'breton-stripe|nonsense' })).join()).toMatch(/nonsense/);
  });
  it('rejects uppercase tags', () => {
    expect(validateRow(row({ tags: 'Breton-Stripe' })).join()).toMatch(/lowercase/i);
  });
  it('rejects a history tag that is only a generic tag', () => {
    expect(validateRow(row({ tags: 'cotton' })).join()).toMatch(/Named Style/);
  });
  it('accepts generic tags on redesign rows', () => {
    expect(validateRow(row({ kind: 'redesign', tags: 'shirt|cotton', difficulty: 'beginner', steps: 'a|b', sources: '' }))).toEqual([]);
  });
  it('requires difficulty and steps for redesign', () => {
    const base = { kind: 'redesign', tags: 'shirt', sources: '' };
    expect(validateRow(row({ ...base, difficulty: '', steps: 'a' })).join()).toMatch(/difficulty/);
    expect(validateRow(row({ ...base, difficulty: 'expert', steps: 'a' })).join()).toMatch(/difficulty/);
    expect(validateRow(row({ ...base, difficulty: 'beginner', steps: '' })).join()).toMatch(/steps/);
  });
  it('rejects unknown kind and missing id/title', () => {
    expect(validateRow(row({ kind: 'blog' })).join()).toMatch(/kind/);
    expect(validateRow(row({ id: '' })).join()).toMatch(/id/);
    expect(validateRow(row({ title: ' ' })).join()).toMatch(/title/);
  });
});

describe('toDbRow', () => {
  it('writes draft status', () => {
    const d = toDbRow(row({ kind: 'redesign', tags: 'shirt', difficulty: 'beginner', tools: 'a|b', steps: 'x|y', sources: '' }));
    expect(d.status).toBe('draft');
    expect(d.slug).toBe('h-1');
    expect(d.tags).toEqual(['shirt']);
    expect(d.steps).toEqual(['x', 'y']);
    expect(d.tools).toBe('a, b');
  });
});

function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  const io = {
    fetchExisting: async (slugs: string[]) => slugs.filter((s) => store.has(s)).map((s) => store.get(s) as unknown as StoredRow),
    upsert: async (rows: Record<string, unknown>[]) => {
      for (const r of rows) store.set(r.slug as string, { ...store.get(r.slug as string), ...r });
    },
  };
  return { store, io };
}

describe('importRows', () => {
  it('inserts new rows as draft and re-import updates without duplicating', async () => {
    const { store, io } = fakeDb();
    expect(await importRows([row(), row({ id: 'h-2' })], io)).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    expect(await importRows([row({ title: 'Changed' })], io)).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect(store.size).toBe(2);
    expect(store.get('h-1')!.title).toBe('Changed');
    expect([...store.values()].every((r) => r.status === 'draft')).toBe(true);
  });
  it('skips unchanged rows and keeps them reviewed', async () => {
    const { store, io } = fakeDb();
    await importRows([row()], io);
    store.set('h-1', { ...store.get('h-1'), status: 'reviewed', reviewed_by: 'Ana' });
    const r = await importRows([row(), row({ id: 'h-2' })], io);
    expect(r).toEqual({ inserted: 1, updated: 0, unchanged: 1 });
    expect(store.get('h-1')).toMatchObject({ status: 'reviewed', reviewed_by: 'Ana' });
    expect(store.get('h-2')).toMatchObject({ status: 'draft', reviewed_by: null });
  });
  it('a changed row goes back to draft and loses its reviewer', async () => {
    const { store, io } = fakeDb();
    await importRows([row()], io);
    store.set('h-1', { ...store.get('h-1'), status: 'reviewed', reviewed_by: 'Ana' });
    await importRows([row({ body: 'New body' })], io);
    expect(store.get('h-1')).toMatchObject({ status: 'draft', reviewed_by: null, body: 'New body' });
  });
  it('refuses the whole import when any row is invalid and writes nothing', async () => {
    const { store, io } = fakeDb();
    await expect(importRows([row(), row({ id: 'bad', sources: '' })], io)).rejects.toThrow(/bad/);
    expect(store.size).toBe(0);
  });
  it('rejects duplicate ids within the file', async () => {
    await expect(importRows([row(), row()], fakeDb().io)).rejects.toThrow(/duplicate/i);
  });
});

describe('reviewBlocker', () => {
  const good = [{ citation: 'C', url: 'https://a.org/x', accessed: '2026-11-22' }];
  it('blocks an unknown slug', () => expect(reviewBlocker(null)).toMatch(/unknown slug/));
  it('blocks history with null or empty sources', () => {
    expect(reviewBlocker({ kind: 'history', tags: ['breton-stripe'], sources: null })).toMatch(/no sources/);
    expect(reviewBlocker({ kind: 'history', tags: ['breton-stripe'], sources: [] })).toMatch(/no sources/);
  });
  it('blocks malformed sources', () => {
    expect(reviewBlocker({ kind: 'history', tags: ['breton-stripe'], sources: [{ citation: 'C', url: 'ftp://a', accessed: 'd' }] })).toMatch(/http/);
    expect(reviewBlocker({ kind: 'history', tags: ['breton-stripe'], sources: [{ url: 'https://a.org', accessed: 'd' }] })).toMatch(/citation/);
  });
  it('blocks a history tag that is not a Named Style', () => {
    expect(reviewBlocker({ kind: 'history', tags: ['cotton'], sources: good })).toMatch(/Named Style/);
  });
  it('allows a valid history row', () => expect(reviewBlocker({ kind: 'history', tags: ['breton-stripe'], sources: good })).toBeNull());
  it('allows a redesign row without sources', () => expect(reviewBlocker({ kind: 'redesign', tags: ['shirt'], sources: null })).toBeNull());
});

describe('content/kb/entries.csv', () => {
  it('is valid and has unique ids', () => {
    const rows = parseKbCsv(readFileSync('content/kb/entries.csv', 'utf8'));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows) {
      expect(validateRow(r), r.id).toEqual([]);
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
