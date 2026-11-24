import { describe, it, expect } from 'vitest';
import { contentBox } from '@/lib/image/crop';

/** w x h RGBA image filled with `bg`, with `fg` painted in the rectangle [x0,x1) x [y0,y1). */
function img(w: number, h: number, bg: number[], fg: number[], rect: [number, number, number, number] | null) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = rect && x >= rect[0] && x < rect[1] && y >= rect[2] && y < rect[3];
      d.set(inside ? fg : bg, (y * w + x) * 4);
    }
  }
  return d;
}

const CLEAR = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 255];
const NEAR_WHITE = [248, 249, 250, 255];
const DENIM = [70, 100, 150, 255];

describe('contentBox', () => {
  it('finds the garment inside transparent margins', () => {
    expect(contentBox(img(100, 80, CLEAR, DENIM, [20, 70, 10, 60]), 100, 80)).toEqual({ x: 20, y: 10, width: 50, height: 50 });
  });

  it('also treats plain white and near-white as empty', () => {
    expect(contentBox(img(40, 40, WHITE, DENIM, [5, 15, 8, 30]), 40, 40)).toEqual({ x: 5, y: 8, width: 10, height: 22 });
    expect(contentBox(img(40, 40, NEAR_WHITE, DENIM, [0, 40, 10, 20]), 40, 40)).toEqual({ x: 0, y: 10, width: 40, height: 10 });
  });

  it('pads the box but stays inside the image', () => {
    expect(contentBox(img(50, 50, CLEAR, DENIM, [1, 49, 20, 30]), 50, 50, { pad: 4 })).toEqual({ x: 0, y: 16, width: 50, height: 18 });
  });

  it('returns null for an empty image, and for one already filled to the edges', () => {
    expect(contentBox(img(10, 10, CLEAR, DENIM, null), 10, 10)).toBeNull();
    expect(contentBox(img(10, 10, DENIM, DENIM, null), 10, 10)).toBeNull();
  });

  it('ignores faint specks: a pixel needs real opacity to count', () => {
    const d = img(30, 30, CLEAR, DENIM, [10, 20, 10, 20]);
    d.set([70, 100, 150, 4], (0 * 30 + 0) * 4); // near-invisible fringe in the corner
    expect(contentBox(d, 30, 30)).toEqual({ x: 10, y: 10, width: 10, height: 10 });
  });
});
