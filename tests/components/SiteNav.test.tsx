// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/looks', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SiteNav, activeTab, showScanCta } from '@/components/SiteNav';

afterEach(() => cleanup());

describe('activeTab', () => {
  it('hides the Scan a garment button only on the Scan page itself', () => {
    expect(showScanCta('/scan')).toBe(false);
    expect(showScanCta('/')).toBe(true);
    expect(showScanCta('/closet')).toBe(true);
    expect(showScanCta('/guide/s1/r1')).toBe(true);
  });

  it('maps pathnames to tabs', () => {
    expect(activeTab('/')).toBe('/');
    expect(activeTab('/guide/s1/r1')).toBe('/scan');
    expect(activeTab('/closet')).toBe('/closet');
    expect(activeTab('/unknown')).toBeNull();
  });
});

describe('SiteNav', () => {
  it.each(['Main', 'Tabs'])('%s nav links all five, only Looks current', (name) => {
    render(<SiteNav />);
    const nav = screen.getByRole('navigation', { name });
    for (const l of ['Home', 'Scan', 'Closet', 'Looks', 'Profile']) {
      expect(within(nav).getByRole('link', { name: l })).toBeTruthy();
    }
    const current = within(nav).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.textContent)).toEqual(['Looks']);
  });

  it('top nav has a Scan a garment button link', () => {
    render(<SiteNav />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Scan a garment' }).getAttribute('href')).toBe('/scan');
  });

  it('logo link goes home', () => {
    render(<SiteNav />);
    const logos = screen.getAllByRole('link', { name: 'REVIVO home' });
    expect(logos.length).toBeGreaterThan(0);
    for (const a of logos) expect(a.getAttribute('href')).toBe('/');
  });
});

describe('globals.css', () => {
  it('pads body bottom on mobile for the tab bar', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const i = css.indexOf('max-width: 767px');
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i)).toContain('padding-bottom: calc(68px + env(safe-area-inset-bottom');
  });
});
