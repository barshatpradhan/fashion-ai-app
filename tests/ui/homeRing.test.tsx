// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { HomeRing } from '@/components/HomeRing';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SECOND_LIVES, ringPose, figureSlug, FABRICS, swatchSrc } from '@/components/secondLives';

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

describe('figures', () => {
  it('gives each second life an AI-made figure that exists in public/', () => {
    for (const l of SECOND_LIVES) {
      expect(l.figure).toBe(`/home-ring/${figureSlug(l.name)}.webp`);
      expect(existsSync(path.join(process.cwd(), 'public', l.figure))).toBe(true);
    }
  });
  it('has a swatch image for every fabric', () => {
    for (const f of FABRICS) expect(existsSync(path.join(process.cwd(), 'public', swatchSrc(f)))).toBe(true);
  });
  it('slugs names', () => {
    expect(figureSlug('Tie-front crop')).toBe('tie-front-crop');
    expect(figureSlug('Cut-off shorts')).toBe('cut-off-shorts');
  });
});

describe('HomeRing', () => {
  it('has the ring only: no Ring/Grid switch', () => {
    render(<HomeRing />);
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grid' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Keep it in the loop' })).toBeTruthy();
  });

  it('shows a person wearing each second life, marked as a Concept', () => {
    const { container } = render(<HomeRing />);
    const btn = screen.getByRole('button', { name: 'Show Denim tote' });
    expect(btn.querySelector('img')?.getAttribute('src')).toBe('/home-ring/denim-tote.webp');
    expect(container.querySelectorAll('[data-figure]')).toHaveLength(9);
    expect(screen.getByText('Concept')).toBeTruthy();
  });

  it('shows the hovered outfit and its remade pieces below, then returns on leave', () => {
    render(<HomeRing />);
    const hat = screen.getByRole('button', { name: 'Show Bucket hat' });
    fireEvent.mouseEnter(hat);
    expect(screen.getAllByText('Bucket hat').length).toBeGreaterThan(0);
    expect(screen.getByText('Denim · from denim jacket')).toBeTruthy();
    expect(screen.getByText('Patched hoodie')).toBeTruthy();
    expect(screen.getByText('Fleece · denim patch pockets')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'What Bucket hat is wearing' });
    expect(Array.from(list.querySelectorAll('img[data-swatch]')).map((i) => i.getAttribute('src')))
      .toEqual(['/home-ring/fabric-denim.webp', '/home-ring/fabric-fleece.webp', '/home-ring/fabric-chino-twill.webp']);
    expect(screen.getByText('Sewing · 1.5 h')).toBeTruthy();
    expect(screen.getByText('01 / 09')).toBeTruthy(); // hovering previews; it does not turn the ring
    fireEvent.mouseLeave(hat);
    expect(screen.queryByText('Patched hoodie')).toBeNull();
    expect(screen.getByText('Spliced trousers')).toBeTruthy();
  });

  it('previews on keyboard focus too', () => {
    render(<HomeRing />);
    const tank = screen.getByRole('button', { name: 'Show Racer tank' });
    fireEvent.focus(tank);
    expect(screen.getByText('Patchwork jeans')).toBeTruthy();
    fireEvent.blur(tank);
    expect(screen.queryByText('Patchwork jeans')).toBeNull();
  });

  it('holds the ring still while a figure is hovered', () => {
    vi.useFakeTimers();
    render(<HomeRing />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show Wrap skirt' }));
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByRole('button', { name: 'Pause the ring' })).toBeTruthy();
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Show Wrap skirt' }));
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getByText('02 / 09')).toBeTruthy();
  });

  it('starts on the first look and jumps when an item is picked, pausing', () => {
    render(<HomeRing />);
    expect(screen.getByText('01 / 09')).toBeTruthy();
    expect(screen.getAllByText('Tie-front crop').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show Wrap skirt' }));
    expect(screen.getByText('03 / 09')).toBeTruthy();
    expect(screen.getAllByText('Wrap skirt').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Play the ring' })).toBeTruthy();
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

  it('does not autoplay under reduced motion and says so on the button', () => {
    stubMatchMedia(true);
    render(<HomeRing />);
    expect(screen.getByRole('button', { name: 'Play the ring' })).toBeTruthy();
    expect(screen.getByText('01 / 09')).toBeTruthy();
  });

  it('moves one look with the arrow keys on the stage and pauses', () => {
    render(<HomeRing />);
    const stage = screen.getByRole('group', { name: /use arrow keys/i });
    stage.focus();
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(screen.getByText('02 / 09')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play the ring' })).toBeTruthy();
    fireEvent.keyDown(stage, { key: 'ArrowLeft' });
    expect(screen.getByText('01 / 09')).toBeTruthy();
  });

  it('shows no prices or shopping words', () => {
    const { container } = render(<HomeRing />);
    expect(container.textContent).not.toMatch(/\$|bag|shop/i);
  });
});
