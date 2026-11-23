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

  it('has a How it works section with Scan, Learn and Remake steps', () => {
    render(<Home />);
    const section = screen.getByRole('region', { name: 'How it works' });
    const heads = Array.from(section.querySelectorAll('h3')).map((n) => n.textContent);
    expect(heads).toEqual(['Scan', 'Learn', 'Remake']);
  });

  it('keeps the decorative stage hidden from assistive tech', () => {
    const { container } = render(<Home />);
    expect(container.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
  });

  it('turns the turntable animation off for reduced motion', () => {
    const css = readFileSync('components/home.module.css', 'utf8');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toMatch(/\.turntable\s*\{[^}]*animation:\s*none/);
  });
});
