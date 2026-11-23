// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { LooksCarousel } from '@/components/LooksCarousel';
import type { ClosetGarment } from '@/lib/db/closet';
import type { Look } from '@/lib/domain/types';

afterEach(cleanup);

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});

const g = (id: string, name: string, category: 'clothing' | 'accessory' = 'clothing'): ClosetGarment =>
  ({ id, category, name, tags: [], imageKind: 'photo', isUpcycled: false, imageUrl: null }) as unknown as ClosetGarment;
const garments = { a: g('a', 'Striped shirt'), b: g('b', 'Wide trousers'), c: g('c', 'Canvas sneakers') };
const looks = [
  { name: 'Weekend', reason: 'Easy.', garmentIds: ['a', 'b'] },
  { name: 'Evening', reason: 'Sharp.', garmentIds: ['b', 'c'] },
] as unknown as Look[];

describe('LooksCarousel model', () => {
  it('selects the matching piece when a dot is clicked', () => {
    render(<LooksCarousel looks={looks} garments={garments} onSave={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '2, Wide trousers' }));
    const items = within(screen.getByRole('list', { name: 'Pieces in Weekend' })).getAllByRole('listitem');
    expect(items[0].getAttribute('aria-current')).toBeNull();
    expect(items[1].getAttribute('aria-current')).toBe('true');
  });

  it('clears the selection when the look changes', () => {
    render(<LooksCarousel looks={looks} garments={garments} onSave={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '2, Wide trousers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next look' }));
    const items = within(screen.getByRole('list', { name: 'Pieces in Evening' })).getAllByRole('listitem');
    expect(items.some((li) => li.getAttribute('aria-current') === 'true')).toBe(false);
  });
});
