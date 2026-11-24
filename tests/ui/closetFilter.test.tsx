import { describe, it, expect } from 'vitest';
import { filterGarments } from '@/lib/ui/closet';

const items = [
  { id: 'a', category: 'clothing' as const },
  { id: 'b', category: 'accessory' as const },
  { id: 'c', category: 'clothing' as const },
  { id: 'd', category: 'accessory' as const },
];

describe('filterGarments', () => {
  it('returns every item for "all", in order', () => {
    expect(filterGarments(items, 'all').map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('returns only clothing, in order', () => {
    expect(filterGarments(items, 'clothing').map((i) => i.id)).toEqual(['a', 'c']);
  });
  it('returns only accessories, in order', () => {
    expect(filterGarments(items, 'accessory').map((i) => i.id)).toEqual(['b', 'd']);
  });
});
