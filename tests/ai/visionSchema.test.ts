import { describe, it, expect } from 'vitest';
import { parseVision, VisionParseError } from '@/lib/ai/visionSchema';

const valid = {
  is_garment: true,
  garment_type: 'button-down shirt',
  category: 'top',
  parts: { collar: 'point collar', sleeves: 'long', closure: 'buttons', fit: 'oversized' },
  pattern: 'vertical stripes',
  colors: [{ name: 'sage', hex: '#8fa58a' }],
  fabric_guess: { value: 'cotton', confidence: 0.62, alternatives: ['linen'] },
  condition_notes: 'slight fading at cuffs',
  visible_techniques: ['pleating'],
  tags: ['shirt', 'button-down', 'cotton', 'stripes', 'oversized'],
  named_styles: [{ style: 'breton-stripe', confidence: 0.8 }],
};

describe('parseVision', () => {
  it('parses a valid payload (object and JSON string)', () => {
    const r = parseVision(valid);
    expect(r.garment_type).toBe('button-down shirt');
    expect(r.named_styles).toEqual([{ style: 'breton-stripe', confidence: 0.8 }]);
    expect(r.tags).toEqual(valid.tags);
    expect(parseVision(JSON.stringify(valid)).is_garment).toBe(true);
  });

  it('drops unknown named styles', () => {
    const r = parseVision({ ...valid, named_styles: [{ style: 'made-up-style', confidence: 0.9 }] });
    expect(r.named_styles).toEqual([]);
  });

  it('drops unknown tags', () => {
    const r = parseVision({ ...valid, tags: ['shirt', 'zzz-not-a-tag'] });
    expect(r.tags).toEqual(['shirt']);
  });

  it('clamps confidences to [0,1]', () => {
    const r = parseVision({
      ...valid,
      fabric_guess: { ...valid.fabric_guess, confidence: 1.4 },
      named_styles: [{ style: 'tartan', confidence: -2 }],
    });
    expect(r.fabric_guess.confidence).toBe(1);
    expect(r.named_styles[0].confidence).toBe(0);
  });

  it('strips history and origin keys', () => {
    const r = parseVision({ ...valid, history: 'invented', origin: 'France', parts: { ...valid.parts, origin: 'x' } });
    expect(r).not.toHaveProperty('history');
    expect(r).not.toHaveProperty('origin');
    expect(r.parts).not.toHaveProperty('origin');
  });

  it('throws VisionParseError on invalid JSON and schema failure', () => {
    expect(() => parseVision('not json')).toThrow(VisionParseError);
    expect(() => parseVision({ garment_type: 5 })).toThrow(VisionParseError);
  });
});

describe('parseVision leniency (a first live scan must not become "stylist busy")', () => {
  it('normalises case and whitespace before vocabulary filtering', () => {
    const r = parseVision({
      ...valid,
      category: ' Top ',
      tags: ['Shirt', ' COTTON ', 'Breton Stripe', 'polyester blend'],
      named_styles: [{ style: 'Breton Stripe', confidence: 0.9 }],
      fabric_guess: { value: ' Cotton ', confidence: '0.6', alternatives: ['Linen', null] },
    });
    expect(r.category).toBe('top');
    expect(r.tags).toEqual(['shirt', 'cotton', 'breton-stripe', 'polyester blend']);
    expect(r.named_styles).toEqual([{ style: 'breton-stripe', confidence: 0.9 }]);
    expect(r.fabric_guess).toEqual({ value: 'cotton', confidence: 0.6, alternatives: ['linen'] });
  });

  it('maps an unknown category to "other"', () => {
    expect(parseVision({ ...valid, category: 'knitwear' }).category).toBe('other');
    expect(parseVision({ ...valid, category: null }).category).toBe('other');
  });

  it('coerces nested parts to strings or drops them, still stripping history/origin', () => {
    const r = parseVision({
      ...valid,
      parts: { sleeves: { length: 'long', cuff: 'buttoned' }, buttons: 6, pockets: ['chest', 'side'], hem: null, Origin: 'x', history: { a: 'b' } },
    });
    expect(r.parts).toEqual({ sleeves: 'long, buttoned', buttons: '6', pockets: 'chest, side' });
  });

  it('treats nulls as defaults', () => {
    const r = parseVision({
      ...valid, pattern: null, condition_notes: null, colors: null, visible_techniques: null, tags: null, named_styles: null, parts: null,
    });
    expect(r).toMatchObject({ pattern: '', condition_notes: '', colors: [], visible_techniques: [], tags: [], named_styles: [], parts: {} });
  });

  it('accepts "true"/"false" strings for is_garment and drops malformed colours', () => {
    const r = parseVision({ ...valid, is_garment: 'true', colors: [{ name: 'Sage', hex: '#8fa58a' }, null, 'navy'] });
    expect(r.is_garment).toBe(true);
    expect(r.colors).toEqual([{ name: 'Sage', hex: '#8fa58a' }, { name: 'navy', hex: '' }]);
  });
});
