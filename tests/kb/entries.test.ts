import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseKbCsv, validateRow, toDbRow } from '@/lib/kb/importRows';
import { matchEntries } from '@/lib/domain/matching';
import { NAMED_STYLES } from '@/lib/domain/vocabulary';
import type { KbEntry } from '@/lib/domain/types';
import type { VisionResult } from '@/lib/ai/visionSchema';

// The shipped knowledge base, not a fixture: it must import cleanly and cover the demo garments.
const rows = parseKbCsv(readFileSync(path.resolve(__dirname, '../../content/kb/entries.csv'), 'utf8'));
// Treated as reviewed here to check coverage; real rows go live only after a team member runs kb:review.
const entries: KbEntry[] = rows.map((r) => {
  const d = toDbRow(r);
  return {
    id: d.slug, kind: d.kind as KbEntry['kind'], title: d.title, body: d.body ?? '', tags: d.tags,
    difficulty: (d.difficulty ?? undefined) as KbEntry['difficulty'], steps: d.steps ?? undefined,
    sources: d.sources ?? undefined, status: 'reviewed',
  };
});

const scan = (garment_type: string, fabric: string, tags: string[], category: VisionResult['category'] = 'top'): VisionResult => ({
  is_garment: true, garment_type, category, parts: {}, pattern: 'solid', colors: [],
  fabric_guess: { value: fabric, confidence: 0.9, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags, named_styles: [],
});

describe('content/kb/entries.csv', () => {
  it('every row passes import validation', () => {
    const problems = rows.flatMap((r) => validateRow(r).map((e) => `${r.id}: ${e}`));
    expect(problems).toEqual([]);
  });

  it('has no [DEV] placeholder rows', () => {
    expect(rows.filter((r) => r.title.startsWith('[DEV]')).map((r) => r.id)).toEqual([]);
  });

  // The Concept image is briefed from this line; without it the model guessed (a tote came out as a fringed tank top).
  it('every redesign says what the finished piece looks like', () => {
    const missing = rows.filter((r) => r.kind === 'redesign' && !(r.result ?? '').trim()).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('has a sourced history entry for every Named Style', () => {
    for (const style of NAMED_STYLES) {
      const h = entries.filter((e) => e.kind === 'history' && e.tags.includes(style));
      expect(h.length, style).toBeGreaterThan(0);
      for (const e of h) expect(e.sources?.length, e.id).toBeGreaterThan(0);
    }
  });

  it.each([
    ['denim jacket', scan('jacket', 'denim', ['pockets', 'buttons', 'long-sleeve'], 'outerwear')],
    ['button shirt', scan('shirt', 'cotton', ['button-down', 'collar', 'long-sleeve'])],
    ['tee', scan('t-shirt', 'cotton', ['short-sleeve', 'jersey'])],
    ['knit sweater', scan('sweater', 'wool', ['knit', 'long-sleeve'])],
    ['trousers', scan('pants', 'cotton', ['relaxed', 'pockets'], 'bottom')],
  ])('%s gets one free beginner recipe and three more', (_name, v) => {
    const m = matchEntries(v, { namedStyles: [] }, entries);
    expect(m.recipes).toHaveLength(4);
    const free = m.recipes.find((r) => r.id === m.freeRecipeId);
    expect(free?.difficulty).toBe('beginner');
    expect(m.fabricNotes.length).toBeGreaterThan(0);
  });
});
