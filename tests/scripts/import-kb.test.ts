import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseKbCsv, validateRow, toDbRow, importRows, type KbCsvRow } from '@/lib/kb/importRows';

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
  it('always writes draft and never reviewed_by', () => {
    const d = toDbRow(row({ kind: 'redesign', tags: 'shirt', difficulty: 'beginner', tools: 'a|b', steps: 'x|y', sources: '' }));
    expect(d.status).toBe('draft');
    expect('reviewed_by' in d).toBe(false);
    expect(d.slug).toBe('h-1');
    expect(d.tags).toEqual(['shirt']);
    expect(d.steps).toEqual(['x', 'y']);
    expect(d.tools).toBe('a, b');
  });
});

describe('importRows', () => {
  it('upserts by slug so re-importing does not duplicate', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const upsert = async (rows: Record<string, unknown>[]) => {
      for (const r of rows) store.set(r.slug as string, { ...store.get(r.slug as string), ...r });
    };
    const rows = [row(), row({ id: 'h-2' })];
    await importRows(rows, upsert);
    await importRows([row({ title: 'Changed' })], upsert);
    expect(store.size).toBe(2);
    expect(store.get('h-1')!.title).toBe('Changed');
    expect([...store.values()].every((r) => r.status === 'draft')).toBe(true);
  });
  it('refuses the whole import when any row is invalid and writes nothing', async () => {
    let called = false;
    await expect(importRows([row(), row({ id: 'bad', sources: '' })], async () => { called = true; })).rejects.toThrow(/bad/);
    expect(called).toBe(false);
  });
  it('rejects duplicate ids within the file', async () => {
    await expect(importRows([row(), row()], async () => {})).rejects.toThrow(/duplicate/i);
  });
});

describe('content/kb/entries.csv', () => {
  it('is valid, has [DEV] titles, and unique ids', () => {
    const rows = parseKbCsv(readFileSync('content/kb/entries.csv', 'utf8'));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows) {
      expect(validateRow(r), r.id).toEqual([]);
      expect(r.title.startsWith('[DEV] ')).toBe(true);
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
