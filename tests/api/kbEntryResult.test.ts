import { describe, it, expect } from 'vitest';
import { toKbEntry } from '@/lib/db/scans';

describe('toKbEntry', () => {
  it('carries a recipe\'s result line, or leaves it out when null', () => {
    const base = { id: 'r', kind: 'redesign', title: 'T', body: 'B', tags: [], status: 'reviewed' };
    expect(toKbEntry({ ...base, result: 'A flat bag.' }).result).toBe('A flat bag.');
    expect(toKbEntry({ ...base, result: null }).result).toBeUndefined();
  });
});
