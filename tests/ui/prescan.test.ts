import { describe, it, expect } from 'vitest';
import { pickGarmentScans, scanArg, summaryLine } from '@/lib/demo/prescan';

const rows = [
  { id: 'a', vision_json: { is_garment: true } },
  { id: 'b', vision_json: { is_garment: false } },
  { id: 'c', vision_json: null },
  { id: 'd', vision_json: { is_garment: true } },
];
describe('prescan helpers', () => {
  it('keeps only garment scans, optionally one id', () => {
    expect(pickGarmentScans(rows).map((r) => r.id)).toEqual(['a', 'd']);
    expect(pickGarmentScans(rows, 'd').map((r) => r.id)).toEqual(['d']);
    expect(pickGarmentScans(rows, 'b')).toEqual([]);
  });
  it('parses --scan', () => {
    expect(scanArg(['--scan', 'x'])).toBe('x');
    expect(scanArg([])).toBeUndefined();
    expect(() => scanArg(['--scan'])).toThrow();
  });
  it('summarises', () => {
    expect(summaryLine({ found: 3, guides: 2, images: 1, failures: 1 })).toBe('Scans found: 3, guides warmed: 2, images warmed: 1, failures: 1');
  });
});
