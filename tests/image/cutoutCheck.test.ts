import { describe, it, expect, vi } from 'vitest';
import { alphaCoverage, cutoutLooksBroken } from '@/lib/image/crop';
import { removeBackground } from '@/lib/image/prepare';

/** RGBA pixels: `fill(x, y)` returns the alpha for that pixel. */
function rgba(w: number, h: number, fill: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = fill(x, y);
  return d;
}

describe('alphaCoverage', () => {
  it('measures the solid share of the frame and of the solid pixels\' own box', () => {
    // 10x10 frame, a fully solid 4x5 block.
    const c = alphaCoverage(rgba(10, 10, (x, y) => (x >= 2 && x < 6 && y >= 3 && y < 8 ? 255 : 0)), 10, 10);
    expect(c.frame).toBeCloseTo(0.2);
    expect(c.box).toBeCloseTo(1);
  });
  it('counts faint (nearly transparent) pixels as gone', () => {
    const c = alphaCoverage(rgba(10, 10, () => 10), 10, 10);
    expect(c).toEqual({ frame: 0, box: 0 });
  });
});

describe('cutoutLooksBroken', () => {
  // Measured on real cut-outs: the cream NY tee that lost its body filled 30% of its box;
  // good cut-outs (denim jacket, Breton top) filled 75-78%.
  it('rejects a cut-out that kept too little of its own box (the cream tee case)', () => {
    expect(cutoutLooksBroken({ frame: 0.2, box: 0.3 })).toBe(true);
  });
  it('rejects a cut-out that kept a sliver of the photo', () => {
    expect(cutoutLooksBroken({ frame: 0.05, box: 0.9 })).toBe(true);
  });
  it('keeps good cut-outs', () => {
    expect(cutoutLooksBroken({ frame: 0.45, box: 0.75 })).toBe(false);
    expect(cutoutLooksBroken({ frame: 0.3, box: 0.6 })).toBe(false);
  });
  it('rejects an empty cut-out', () => {
    expect(cutoutLooksBroken({ frame: 0, box: 0 })).toBe(true);
  });
});

describe('removeBackground rejects a broken cut-out', () => {
  const jpeg = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
  const png = new Blob([new Uint8Array([7])], { type: 'image/png' });
  const lib = async () => async () => png;

  it('returns null (callers keep the original photo) when the cut-out looks broken', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await removeBackground(jpeg, lib, 1000, async () => ({ frame: 0.07, box: 0.3 }))).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('returns the cut-out when it looks whole', async () => {
    expect(await removeBackground(jpeg, lib, 1000, async () => ({ frame: 0.4, box: 0.76 }))).toBe(png);
  });
  it('a failed measurement never blocks a cut-out', async () => {
    expect(await removeBackground(jpeg, lib, 1000, async () => { throw new Error('no canvas'); })).toBe(png);
  });
});
