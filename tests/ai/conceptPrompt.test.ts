import { describe, it, expect } from 'vitest';
import { conceptPrompt, needsHighFidelity } from '@/lib/ai/conceptPrompt';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

// The NY tee as the scan actually stored it (2026-11-24).
const nyTee: VisionResult = {
  is_garment: true, garment_type: 't-shirt', category: 'top', image_quality: 'clear',
  parts: { neckline: 'ribbed crew neck', front: "graphic text print reading 'MANHATTAN NEW YORK NYC'", sleeves: 'short sleeves', hem: 'straight hem' },
  pattern: 'graphic print',
  colors: [{ name: 'cream', hex: 'EFECE1' }, { name: 'teal green', hex: '1C6B64' }, { name: 'white', hex: 'FFFFFF' }],
  fabric_guess: { value: 'cotton', confidence: 0.9, alternatives: [] },
  condition_notes: '', visible_techniques: [], tags: ['t-shirt', 'graphic', 'short-sleeve', 'cotton'], named_styles: [],
};
const tote: KbEntry = {
  id: 'r-tote', kind: 'redesign', title: 'No-sew T-shirt tote', status: 'reviewed', tags: ['t-shirt'],
  body: 'Turn a T-shirt into a washable shopping tote with knotted fringe at the bottom.',
  result: 'Not a garment any more: a flat, open-top shopping bag made from the T-shirt body. The sleeves are cut away and the neckline scooped so the shoulders form two strap handles.',
};

describe('conceptPrompt', () => {
  const p = conceptPrompt(nyTee, tote, { withPhoto: true });

  it('describes the finished piece from the recipe result line, not the process blurb', () => {
    expect(p).toContain('a flat, open-top shopping bag');
    expect(p).toContain('two strap handles');
  });

  it('names the garment\'s own colours with their hex codes', () => {
    expect(p).toMatch(/cream \(#EFECE1\)/);
    expect(p).toMatch(/teal green \(#1C6B64\)/);
  });

  it('quotes the print the scan read, and says to keep it exactly', () => {
    expect(p).toContain("MANHATTAN NEW YORK NYC");
    expect(p).toMatch(/keep .*print.* exactly/i);
    expect(p).toMatch(/do not (move|redraw|invent)/i);
  });

  it('with the photo: edits this garment; without it: describes it', () => {
    expect(p).toMatch(/the garment in the photo/i);
    const textOnly = conceptPrompt(nyTee, tote, { withPhoto: false });
    expect(textOnly).not.toMatch(/in the photo/i);
    expect(textOnly).toMatch(/cotton t-shirt/i);
  });

  it('asks for a plain product shot: off-white background, no people, no added text', () => {
    expect(p).toMatch(/off-white background/i);
    expect(p).toMatch(/no people/i);
    expect(p).toMatch(/no added text/i);
  });

  it('falls back to the title and blurb when a recipe has no result line', () => {
    const q = conceptPrompt(nyTee, { ...tote, result: undefined }, { withPhoto: true });
    expect(q).toContain('No-sew T-shirt tote');
    expect(q).toContain('washable shopping tote');
  });

  it('a plain garment gets no print instructions it does not need', () => {
    const plain = { ...nyTee, parts: { sleeves: 'long sleeves' }, pattern: 'solid', tags: ['sweater', 'wool'] };
    expect(conceptPrompt(plain, tote, { withPhoto: true })).not.toContain('MANHATTAN');
  });

  it('never mentions shopping links or prices', () => {
    expect(p).not.toMatch(/\$|price|buy|store/i);
  });
});

describe('needsHighFidelity (pay for detail only when there is detail to keep)', () => {
  it('a printed, lettered or patterned garment: yes', () => {
    expect(needsHighFidelity(nyTee)).toBe(true);
    expect(needsHighFidelity({ ...nyTee, parts: {}, pattern: 'stripes', tags: ['stripes'] })).toBe(true);
    expect(needsHighFidelity({ ...nyTee, parts: {}, pattern: 'solid', tags: [], named_styles: [{ style: 'paisley', confidence: 0.9 }] })).toBe(true);
  });
  it('a plain, solid garment: no', () => {
    expect(needsHighFidelity({ ...nyTee, parts: { sleeves: 'long sleeves' }, pattern: 'solid', tags: ['sweater', 'wool'] })).toBe(false);
  });
});
