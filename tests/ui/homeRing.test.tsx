// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { HomeRing } from '@/components/HomeRing';
import { SECOND_LIVES, ringPose } from '@/components/secondLives';

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => stubMatchMedia(false));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('ringPose', () => {
  it('puts the front item at the bottom centre, full size', () => {
    const p = ringPose(0, 0, 9);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(80);
    expect(p.scale).toBeCloseTo(1);
    expect(p.z).toBe(30);
    expect(p.opacity).toBeCloseTo(1);
  });
  it('rotates by index', () => {
    expect(ringPose(1, 1, 9)).toEqual(ringPose(0, 0, 9));
  });
});

describe('SECOND_LIVES', () => {
  it('lists the nine looks in order', () => {
    expect(SECOND_LIVES.map((s) => s.name)).toEqual(['Tie-front crop', 'Denim tote', 'Wrap skirt', 'Patchwork scarf', 'Cropped jacket', 'Cut-off shorts', 'Apron dress', 'Bucket hat', 'Racer tank']);
  });
});

describe('HomeRing', () => {
  it('starts on the first look and jumps when an item is picked, pausing', () => {
    render(<HomeRing />);
    expect(screen.getByText('01 / 09')).toBeTruthy();
    expect(screen.getAllByText('Tie-front crop').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show Wrap skirt' }));
    expect(screen.getByText('03 / 09')).toBeTruthy();
    expect(screen.getAllByText('Wrap skirt').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Play the ring' })).toBeTruthy();
  });

  it('switches to a grid and back', () => {
    render(<HomeRing />);
    const view = screen.getByRole('group', { name: 'View' });
    const gridBtn = Array.from(view.querySelectorAll('button')).find((b) => b.textContent === 'Grid')!;
    fireEvent.click(gridBtn);
    expect(gridBtn.getAttribute('aria-pressed')).toBe('true');
    const names = SECOND_LIVES.map((s) => s.name);
    const cells = screen.getAllByRole('button').filter((b) => names.includes(b.textContent ?? ''));
    expect(cells).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Denim tote' }));
    expect(screen.getByText('02 / 09')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Denim tote' })).toBeTruthy();
  });

  it('advances every 3.5 s, unless reduced motion is on', () => {
    vi.useFakeTimers();
    render(<HomeRing />);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getByText('02 / 09')).toBeTruthy();
    cleanup();
    stubMatchMedia(true);
    render(<HomeRing />);
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getByText('01 / 09')).toBeTruthy();
  });

  it('shows no prices or shopping words', () => {
    const { container } = render(<HomeRing />);
    expect(container.textContent).not.toMatch(/\$|bag|shop/i);
  });
});
