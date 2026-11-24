// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import Home from '@/app/page';

afterEach(() => cleanup());

describe('Home', () => {
  it('is a hero with a Scan CTA and links to Closet and Looks', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Scan a garment' }).getAttribute('href')).toBe('/scan');
    expect(screen.getByRole('link', { name: /closet/i }).getAttribute('href')).toBe('/closet');
    expect(screen.getByRole('link', { name: /looks/i }).getAttribute('href')).toBe('/looks');
  });

  it('has a How it works section with Scan, Learn and Remake steps, numbered like the ring', () => {
    render(<Home />);
    const section = screen.getByRole('region', { name: 'How it works' });
    const heads = Array.from(section.querySelectorAll('h3')).map((n) => n.textContent);
    expect(heads).toEqual(['Scan', 'Learn', 'Remake']);
    expect(Array.from(section.querySelectorAll('[data-step]')).map((n) => n.textContent)).toEqual(['01', '02', '03']);
  });

  it('says what REVIVO does in the hero, with one primary and one secondary action', () => {
    const { container } = render(<Home />);
    const hero = screen.getByRole('region', { name: 'Nine second lives' });
    expect(hero.textContent).toContain('Scan a piece you no longer wear, learn its story, remake it');
    const actions = Array.from(hero.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(actions).toEqual([['Scan a garment', '/scan'], ['Your closet', '/closet']]);
    // No borrowed "Vol. 01" line, no hype, one spelling of the name.
    expect(container.textContent).not.toMatch(/Vol\. 01|unlock|Revivo/);
  });

  it('keeps the decorative pictures silent for assistive tech (their names are in the text)', () => {
    const { container } = render(<Home />);
    const pics = container.querySelectorAll('img[data-figure], img[data-swatch]');
    expect(pics.length).toBeGreaterThan(9);
    for (const img of Array.from(pics)) expect(img.getAttribute('alt')).toBe('');
  });

  it('turns the ring transition off for reduced motion', () => {
    const css = readFileSync('components/homeRing.module.css', 'utf8');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{\s*\.item\s*\{[^}]*transition:\s*none/);
  });
});
