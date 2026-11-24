// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
import { UpgradeButton } from '@/components/UpgradeButton';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('UpgradeButton', () => {
  it('a guest is asked to create an account, with a link back to this page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'signup_required' }), { status: 403 })));
    window.history.pushState({}, '', '/guide/s1/r1');
    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole('button'));
    const link = await screen.findByRole('link', { name: 'Create an account' });
    expect(link.getAttribute('href')).toBe('/signup?next=%2Fguide%2Fs1%2Fr1');
    expect(screen.getByRole('alert').textContent).toMatch(/Create a free account to upgrade/);
  });

  it('an account is upgraded and the callback runs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ isPremium: true }), { status: 200 })));
    const onUpgraded = vi.fn();
    render(<UpgradeButton onUpgraded={onUpgraded} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onUpgraded).toHaveBeenCalled());
  });
});
