import { describe, it, expect } from 'vitest';
import { parseKbCsv, toDbRow, importRows, validateRow, type KbCsvRow, type StoredRow } from '@/lib/kb/importRows';

const recipe = (over: Partial<KbCsvRow> = {}): KbCsvRow => ({
  id: 'r-1', kind: 'redesign', title: 'Tote', body: 'Turn a tee into a tote.', tags: 't-shirt', difficulty: 'beginner',
  tools: 'scissors', steps: 'cut|tie', sources: '', result: 'A flat open-top bag with two strap handles.', ...over,
});

function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  const io = {
    fetchExisting: async (slugs: string[]) => slugs.filter((s) => store.has(s)).map((s) => store.get(s) as unknown as StoredRow),
    upsert: async (rows: Record<string, unknown>[]) => { for (const r of rows) store.set(r.slug as string, { ...store.get(r.slug as string), ...r }); },
    updateResult: async (slug: string, result: string | null) => { store.set(slug, { ...store.get(slug), result }); },
  };
  return { store, io };
}

describe('recipe "result" line (what the finished piece looks like; image prompt only)', () => {
  it('parses a CSV with the result column, and one without it', () => {
    const withCol = parseKbCsv('id,kind,title,body,tags,difficulty,tools,steps,sources,result\nr-1,redesign,T,B,shirt,beginner,,a|b,,"A bag, with handles."\n');
    expect(withCol[0].result).toBe('A bag, with handles.');
    const without = parseKbCsv('id,kind,title,body,tags,difficulty,tools,steps,sources\nr-1,redesign,T,B,shirt,beginner,,a|b,\n');
    expect(without[0].result).toBe('');
  });

  it('is stored trimmed, or null when empty', () => {
    expect(toDbRow(recipe({ result: '  A bag.  ' })).result).toBe('A bag.');
    expect(toDbRow(recipe({ result: '' })).result).toBeNull();
  });

  it('is limited in length', () => {
    expect(validateRow(recipe({ result: 'x'.repeat(401) })).join()).toMatch(/result/);
    expect(validateRow(recipe())).toEqual([]);
  });

  it('changing only the result keeps a reviewed recipe reviewed', async () => {
    const { store, io } = fakeDb();
    await importRows([recipe({ result: '' })], io);
    store.set('r-1', { ...store.get('r-1'), status: 'reviewed', reviewed_by: 'Ana' });
    expect(await importRows([recipe()], io)).toEqual({ inserted: 0, updated: 0, unchanged: 0, resultOnly: 1 });
    expect(store.get('r-1')).toMatchObject({ status: 'reviewed', reviewed_by: 'Ana', result: 'A flat open-top bag with two strap handles.' });
  });

  it('changing the result and anything else still resets review', async () => {
    const { store, io } = fakeDb();
    await importRows([recipe()], io);
    store.set('r-1', { ...store.get('r-1'), status: 'reviewed', reviewed_by: 'Ana' });
    expect(await importRows([recipe({ result: 'New.', body: 'New body.' })], io)).toEqual({ inserted: 0, updated: 1, unchanged: 0, resultOnly: 0 });
    expect(store.get('r-1')).toMatchObject({ status: 'draft', reviewed_by: null, result: 'New.' });
  });

  it('an unchanged result is unchanged', async () => {
    const { io } = fakeDb();
    await importRows([recipe()], io);
    expect(await importRows([recipe()], io)).toEqual({ inserted: 0, updated: 0, unchanged: 1, resultOnly: 0 });
  });
});
