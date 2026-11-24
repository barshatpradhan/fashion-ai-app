import { describe, it, expect } from 'vitest';
import { firstSentence, fabricChoices, humanize, safeHex, safeUrl, featureLabels, verifiedHistory, splitRecipes, fabricNoteFor } from '@/lib/ui/result';
import { messageForError, MESSAGES } from '@/lib/ui/messages';
import type { VisionResult } from '@/lib/ai/visionSchema';
import type { KbEntry } from '@/lib/domain/types';

const kb = (id: string, over: Partial<KbEntry> = {}): KbEntry => ({ id, kind: 'redesign', title: id, body: '', tags: [], status: 'reviewed', ...over });

describe('result helpers', () => {
  it('firstSentence takes the first sentence as the teaser', () => {
    expect(firstSentence('Crop the hem. Then add a band.')).toBe('Crop the hem.');
    expect(firstSentence('  Is it\nwool?  Yes. ')).toBe('Is it wool?');
    expect(firstSentence('No full stop here')).toBe('No full stop here');
    expect(firstSentence('')).toBe('');
  });

  it('fabricChoices: guess first, alternatives, vocabulary-only, max three', () => {
    expect(fabricChoices('Linen', ['cotton', 'linen', 'hemp-silk', 'silk', 'wool'])).toEqual(['linen', 'cotton', 'silk']);
    expect(fabricChoices('mystery', ['cotton'])).toEqual(['cotton']);
  });

  it('humanize, safeHex and safeUrl', () => {
    expect(humanize('breton-stripe')).toBe('Breton stripe');
    expect(safeHex('#A1b2C3')).toBe('#A1b2C3');
    expect(safeHex('red; background:url(x)')).toBeNull();
    expect(safeUrl('https://example.org/a')).toBe('https://example.org/a');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });

  it('featureLabels lists type, pattern, parts and techniques', () => {
    const v = {
      garment_type: 'button-down', pattern: 'stripes', parts: { collar: 'point-collar' }, visible_techniques: ['topstitching'],
    } as unknown as VisionResult;
    expect(featureLabels(v)).toEqual([
      { label: 'Type', value: 'Button down' }, { label: 'Pattern', value: 'Stripes' },
      { label: 'Collar', value: 'Point collar' }, { label: 'Technique', value: 'Topstitching' },
    ]);
  });

  // Regression: after correcting the type to "shirt" the heading changed but the panel still said
  // "Long sleeve top".
  it('featureLabels shows the corrected garment type when one is given', () => {
    const v = { garment_type: 'long-sleeve top', pattern: '', parts: {}, visible_techniques: [] } as unknown as VisionResult;
    expect(featureLabels(v, 6, 'shirt')[0]).toEqual({ label: 'Type', value: 'Shirt' });
    expect(featureLabels(v)[0]).toEqual({ label: 'Type', value: 'Long sleeve top' });
  });

  // Regression: "About cotton." was followed by the knit note, which ranked first on tag overlap.
  it('fabricNoteFor picks the note for the named fabric, or none', () => {
    const knit = kb('knit', { kind: 'fabric', tags: ['knit', 'jersey'] });
    const cotton = kb('cotton', { kind: 'fabric', tags: ['cotton', 'shirt'] });
    expect(fabricNoteFor([knit, cotton], 'cotton')).toBe(cotton);
    expect(fabricNoteFor([knit, cotton], 'Cotton')).toBe(cotton);
    expect(fabricNoteFor([knit], 'cotton')).toBeNull();
  });

  it('verifiedHistory keeps only entries with a linkable source', () => {
    const src = { citation: 'V&A', url: 'https://vam.ac.uk/x', accessed: '2026-11-01' };
    const h = [kb('a', { sources: [src] }), kb('b'), kb('c', { sources: [{ ...src, url: 'javascript:x' }] })];
    expect(verifiedHistory(h).map((e) => e.id)).toEqual(['a']);
  });

  it('splitRecipes separates the free recipe from the rest', () => {
    const r = [kb('a'), kb('b'), kb('c')];
    expect(splitRecipes(r, 'b')).toEqual({ free: r[1], others: [r[0], r[2]] });
    expect(splitRecipes(r, null).free).toBeNull();
  });
});

describe('messageForError', () => {
  it('maps every API code to its copy', () => {
    expect(messageForError('not_a_garment')).toBe("We couldn't find a garment in this photo. Try another.");
    expect(messageForError('ai_busy')).toBe('Our stylist is busy right now. Please try again in a moment.');
    expect(messageForError('daily_cap')).toBe("You've reached today's scan limit. Come back tomorrow.");
    expect(messageForError('image_not_found')).toBe('Something went wrong uploading your photo. Please try again.');
    expect(messageForError('server_error')).toBe(MESSAGES.uploadFailed);
    expect(messageForError(undefined)).toBe(MESSAGES.uploadFailed);
    expect(messageForError('unsupported_format')).toBe("This photo format isn't supported. Try a JPG or PNG.");
  });

  it('gives non-upload codes their own copy instead of the upload message', () => {
    expect(messageForError('not_found', 'guide')).toBe('This guide changed after your edit — go back to the result.');
    expect(messageForError('concurrent_spend')).toBe('Please try again.');
    expect(messageForError('premium_required')).toMatch(/Premium/);
    expect(messageForError('no_uploads')).toMatch(/out of uploads/);
    expect(messageForError('no_looks')).toMatch(/out of looks/);
    expect(messageForError('invalid_style')).toMatch(/question/i);
    expect(messageForError('not_found')).not.toBe(MESSAGES.uploadFailed);
    for (const code of ['not_found', 'concurrent_spend', 'premium_required', 'no_uploads', 'no_looks', 'invalid_style']) {
      expect(messageForError(code)).not.toBe(MESSAGES.uploadFailed);
    }
  });
});
