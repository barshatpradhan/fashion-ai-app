import { describe, it, expect } from 'vitest';
import { slotFor, lookKey, dollLayout, resolveDots, SLOT_BOX } from '@/lib/domain/slots';

describe('slotFor', () => {
  it.each([
    ['accessory', 'gold hoops', 'accessory'],
    ['clothing', 'Linen slip dress', 'one-piece'],
    ['clothing', 'wide-leg trousers', 'bottom'],
    ['clothing', 'denim jacket', 'outer'],
    ['clothing', 'canvas sneakers', 'shoes'],
    ['clothing', 'striped shirt', 'top'],
    ['clothing', 'mystery thing', 'top'],
  ] as const)('%s "%s" -> %s', (cat, text, slot) => {
    expect(slotFor(cat, text)).toBe(slot);
  });
});

describe('lookKey', () => {
  it('is order independent', () => {
    expect(lookKey(['b', 'a'])).toBe('a,b');
    expect(lookKey(['a', 'b'])).toBe('a,b');
  });
});

describe('dollLayout', () => {
  it('gives two accessories different boxes', () => {
    const l = dollLayout([{ id: 'a', slot: 'accessory' }, { id: 'b', slot: 'accessory' }]);
    expect(l.a).not.toEqual(l.b);
  });
  it('gives top and outer different boxes, outer wider', () => {
    const l = dollLayout([{ id: 't', slot: 'top' }, { id: 'o', slot: 'outer' }]);
    expect(l.t).not.toEqual(l.o);
    expect(l.o.w).toBeGreaterThan(l.t.w);
  });
  it('starts each slot at its own box', () => {
    expect(dollLayout([{ id: 's', slot: 'shoes' }]).s).toEqual(SLOT_BOX.shoes);
  });
});

describe('resolveDots', () => {
  const pieces = [{ id: 'a', slot: 'top' as const }, { id: 'b', slot: 'bottom' as const }];
  it('drops unknown ids', () => {
    const d = resolveDots(pieces, { a: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 }, zzz: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } });
    expect(Object.keys(d).sort()).toEqual(['a', 'b']);
  });
  it('clamps to 0.04..0.96', () => {
    const d = resolveDots(pieces, { a: { x: 1.4, y: 0.5, w: 0, h: 0 }, b: { x: -0.2, y: 0.5, w: 0, h: 0 } });
    expect(d.a.x).toBe(0.96);
    expect(d.b.x).toBe(0.04);
  });
  it('falls back to the slot box centre when a piece is not located', () => {
    const layout = dollLayout(pieces);
    const d = resolveDots(pieces, { a: { x: 0.5, y: 0.5, w: 0, h: 0 } });
    expect(d.b.x).toBeCloseTo(layout.b.x + layout.b.w / 2);
    expect(d.b.y).toBeCloseTo(layout.b.y + layout.b.h / 2);
  });
  it('uses slot centres when located is null', () => {
    const layout = dollLayout(pieces);
    const d = resolveDots(pieces, null);
    expect(d.a.x).toBeCloseTo(layout.a.x + layout.a.w / 2);
    expect(d.a.y).toBeCloseTo(layout.a.y + layout.a.h / 2);
  });
});

import { separateDots } from '@/lib/domain/slots';
describe('separateDots', () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  it.each([
    [[{ id: 't', slot: 'top' as const }, { id: 'o', slot: 'outer' as const }]],
    [[{ id: 'a', slot: 'accessory' as const }, { id: 'b', slot: 'accessory' as const }]],
  ])('keeps dots at least 0.12 apart', (pieces) => {
    const d = separateDots(pieces.map((p) => p.id), resolveDots(pieces, null));
    const [p, q] = pieces.map((x) => d[x.id]);
    expect(dist(p, q)).toBeGreaterThanOrEqual(0.12);
    for (const v of [p, q]) for (const n of [v.x, v.y]) { expect(n).toBeGreaterThanOrEqual(0.04); expect(n).toBeLessThanOrEqual(0.96); }
  });
  it('leaves clear dots alone', () => {
    const d = { a: { x: 0.5, y: 0.2 }, b: { x: 0.5, y: 0.7 } };
    expect(separateDots(['a', 'b'], d)).toEqual(d);
  });
});
