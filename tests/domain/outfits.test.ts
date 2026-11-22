import { describe, it, expect } from 'vitest';
import { validateLooks, validateSavedLook } from '@/lib/domain/outfits';
import type { Garment } from '@/lib/domain/types';

const g = (id: string, over: Partial<Garment> = {}): Garment => ({
  id, category: 'clothing', status: 'active', isUpcycled: false, tags: [], name: id, cutoutPath: `u/${id}.png`,
  imageKind: 'photo', ...over,
});

const closet = [g('a'), g('b'), g('c'), g('d'), g('e'), g('old', { status: 'transformed' })];
const look = (garmentIds: string[], over: Record<string, unknown> = {}) =>
  ({ name: 'Soft weekend', reason: 'Easy layers in calm colours.', garmentIds, ...over });

describe('validateLooks', () => {
  it('keeps a valid Look from a {looks} payload', () => {
    expect(validateLooks({ looks: [look(['a', 'b'])] }, closet)).toEqual([
      { name: 'Soft weekend', reason: 'Easy layers in calm colours.', garmentIds: ['a', 'b'] },
    ]);
  });

  it('drops a Look with an unknown id', () => {
    expect(validateLooks({ looks: [look(['a', 'zzz'])] }, closet)).toEqual([]);
  });

  it('drops a Look that uses a transformed id', () => {
    expect(validateLooks({ looks: [look(['a', 'old'])] }, closet)).toEqual([]);
  });

  it('drops a Look with fewer than 2 or more than 4 items', () => {
    expect(validateLooks({ looks: [look(['a'])] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b', 'c', 'd', 'e'])] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b', 'c', 'd'])] }, closet)).toHaveLength(1);
  });

  it('counts a repeated id once', () => {
    expect(validateLooks({ looks: [look(['a', 'a'])] }, closet)).toEqual([]);
  });

  it('drops a Look without the upcycled piece when the closet has an active one', () => {
    const withUp = [...closet, g('up', { isUpcycled: true })];
    expect(validateLooks({ looks: [look(['a', 'b'])] }, withUp)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'up'])] }, withUp)).toHaveLength(1);
  });

  it('ignores an upcycled piece that is no longer active', () => {
    const withOldUp = [...closet, g('up', { isUpcycled: true, status: 'transformed' })];
    expect(validateLooks({ looks: [look(['a', 'b'])] }, withOldUp)).toHaveLength(1);
  });

  it('drops a Look that mentions shopping or a URL', () => {
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'pair with a tee from the store' })] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b'], { name: 'BUY this' })] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'Shop the look' })] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'see https://example.com' })] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'see www.example.com' })] }, closet)).toEqual([]);
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'like example.shop' })] }, closet)).toEqual([]);
    // Word boundaries: "restored" is fine.
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'A restored classic.' })] }, closet)).toHaveLength(1);
  });

  it('returns at most 3 Looks', () => {
    const raw = { looks: [look(['a', 'b']), look(['a', 'c']), look(['a', 'd']), look(['b', 'c']), look(['b', 'd'])] };
    expect(validateLooks(raw, closet)).toHaveLength(3);
  });

  it('accepts the writer\'s "note" as the reason and skips malformed entries', () => {
    const raw = { looks: [null, 'x', { name: 'N', garmentIds: 'a' }, { name: 'Linen day', note: 'Breezy.', garmentIds: ['a', 'b'] }] };
    expect(validateLooks(raw, closet)).toEqual([{ name: 'Linen day', reason: 'Breezy.', garmentIds: ['a', 'b'] }]);
  });

  it('returns [] for garbage', () => {
    expect(validateLooks(null, closet)).toEqual([]);
    expect(validateLooks({ looks: 'no' }, closet)).toEqual([]);
  });
});

describe('validateSavedLook', () => {
  it('checks ids and text but not the upcycled rule', () => {
    const withUp = [...closet, g('up', { isUpcycled: true })];
    expect(validateSavedLook(look(['a', 'b']), withUp)).toEqual(look(['a', 'b']));
    expect(validateSavedLook(look(['a', 'old']), withUp)).toBeNull();
    expect(validateSavedLook(look(['a', 'b'], { reason: 'buy it' }), withUp)).toBeNull();
  });
});

describe('no invented history in Looks', () => {
  it.each([
    ['reason', 'A nod to 1970s Parisian style.'],
    ['reason', 'Inspired by 19th-century workwear.'],
    ['reason', 'Its origins lie in Breton fishermen.'],
    ['reason', 'A traditional pairing.'],
    ['reason', 'Celebrates your heritage.'],
    ['name', '90s revival'],
    ['reason', 'Rooted in the history of denim.'],
  ])('drops a Look whose %s makes a history claim: %s', (field, text) => {
    expect(validateLooks({ looks: [look(['a', 'b'], { [field]: text })] }, closet)).toEqual([]);
  });

  it('keeps ordinary styling language (e.g. "original")', () => {
    expect(validateLooks({ looks: [look(['a', 'b'], { reason: 'Keeps the original denim front and centre.' })] }, closet)).toHaveLength(1);
  });
});
