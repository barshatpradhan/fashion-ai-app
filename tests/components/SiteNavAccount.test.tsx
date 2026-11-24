// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/closet', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const h = vi.hoisted(() => ({
  account: { state: 'unknown' } as { state: 'unknown' | 'guest' } | { state: 'account'; name: string; initial: string },
  logOut: vi.fn(async () => {}),
}));
vi.mock('@/lib/auth/useNavAccount', () => ({ useNavAccount: () => h.account }));
vi.mock('@/lib/auth/flows', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/flows')>()), logOut: h.logOut }));
vi.mock('@/lib/auth/browserPort', () => ({ browserLogOutDeps: () => ({}) }));

import { SiteNav } from '@/components/SiteNav';

afterEach(() => cleanup());

describe('SiteNav account area', () => {
  it('guests get Log in and Sign up, on desktop and in the mobile header', () => {
    h.account = { state: 'guest' };
    render(<SiteNav />);
    for (const region of [screen.getByRole('navigation', { name: 'Main' }), screen.getByRole('banner')]) {
      expect(within(region).getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
      expect(within(region).getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe('/signup');
    }
  });

  it('signed in: Profile shows the name and initial, and Log out is offered', async () => {
    h.account = { state: 'account', name: 'Ada Lovelace', initial: 'A' };
    render(<SiteNav />);
    const main = screen.getByRole('navigation', { name: 'Main' });
    const profile = within(main).getByRole('link', { name: 'Profile, Ada Lovelace' });
    expect(profile.getAttribute('href')).toBe('/profile');
    expect(profile.textContent).toContain('A');
    expect(within(main).queryByRole('link', { name: 'Log in' })).toBeNull();
    fireEvent.click(within(main).getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(h.logOut).toHaveBeenCalled());
  });

  it('the mobile tab bar keeps its five tabs whatever the account state', () => {
    for (const account of [{ state: 'guest' as const }, { state: 'account' as const, name: 'Ada', initial: 'A' }]) {
      h.account = account;
      render(<SiteNav />);
      const tabs = within(screen.getByRole('navigation', { name: 'Tabs' })).getAllByRole('link');
      expect(tabs.map((t) => t.textContent)).toEqual(['Home', 'Scan', 'Closet', 'Looks', 'Profile']);
      cleanup();
    }
  });

  it('while unknown, shows no account controls (no flash of Log in for a signed-in user)', () => {
    h.account = { state: 'unknown' };
    render(<SiteNav />);
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });
});
