import { describe, it, expect } from 'vitest';
import { activityLabel, activityDate, sortActivity } from '@/lib/ui/profile';
import { isImageFile, contentTypeFor, pickPhotos, MAX_DEMO_PHOTOS } from '@/lib/demo/photos';

describe('activity record helpers', () => {
  it('labels each kind in friendly words', () => {
    expect(activityLabel({ kind: 'upload', garmentName: 'Denim jacket' })).toBe('Uploaded Denim jacket');
    expect(activityLabel({ kind: 'reconstruct', garmentName: 'Denim jacket' })).toBe('Reconstructed Denim jacket');
    expect(activityLabel({ kind: 'style', garmentName: null })).toBe('Styled a look');
    expect(activityLabel({ kind: 'upload', garmentName: null })).toBe('Uploaded a piece');
    expect(activityLabel({ kind: 'reconstruct', garmentName: null })).toBe('Reconstructed a piece');
  });
  it('formats dates and tolerates bad input', () => {
    expect(activityDate('2026-11-22T12:00:00Z')).toMatch(/2026/);
    expect(activityDate('nope')).toBe('');
  });
  it('sorts newest first without mutating', () => {
    const a = [{ createdAt: '2026-01-01T00:00:00Z' }, { createdAt: '2026-03-01T00:00:00Z' }, { createdAt: '2026-02-01T00:00:00Z' }];
    expect(sortActivity(a).map((x) => x.createdAt.slice(5, 7))).toEqual(['03', '02', '01']);
    expect(a[0].createdAt).toBe('2026-01-01T00:00:00Z');
  });
});

describe('demo photo helpers', () => {
  it('recognises image files and content types', () => {
    expect(isImageFile('a.JPG')).toBe(true);
    expect(isImageFile('b.webp')).toBe(true);
    expect(isImageFile('notes.txt')).toBe(false);
    expect(isImageFile('.DS_Store')).toBe(false);
    expect(contentTypeFor('x.png')).toBe('image/png');
    expect(contentTypeFor('x.jpeg')).toBe('image/jpeg');
  });
  it('picks sorted images, capped', () => {
    const names = ['b.jpg', 'a.jpg', 'readme.md', ...Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, '0')}.png`)];
    const picked = pickPhotos(names, MAX_DEMO_PHOTOS);
    expect(picked).toHaveLength(MAX_DEMO_PHOTOS);
    expect(picked[0]).toBe('a.jpg');
    expect(pickPhotos(names)).toHaveLength(22);
  });
});
