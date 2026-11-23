// @vitest-environment jsdom
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
});
