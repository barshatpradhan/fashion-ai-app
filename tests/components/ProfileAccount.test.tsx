// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { DangerZone } from '@/components/profile/DangerZone';
import { SubscriptionPanel } from '@/components/profile/SubscriptionPanel';
import type { PaymentProvider } from '@/lib/billing/paymentProvider';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DangerZone', () => {
  it('says it cannot be undone, and stays disabled until DELETE is typed exactly', () => {
    render(<DangerZone onDeleted={() => {}} />);
    expect(screen.getByText(/can't be undone/i)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Delete my account' }) as HTMLButtonElement;
    const input = screen.getByLabelText('Type DELETE to confirm');
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(button.disabled).toBe(false);
  });

  it('posts only { confirm: "DELETE" } and reports success', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onDeleted = vi.fn();
    render(<DangerZone onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/account/delete');
    expect(JSON.parse(init.body as string)).toEqual({ confirm: 'DELETE' });
  });

  it('keeps the typed word and explains a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    render(<DangerZone onDeleted={() => {}} />);
    const input = screen.getByLabelText('Type DELETE to confirm') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not delete/i);
    expect(input.value).toBe('DELETE');
  });
});

function provider(over: Partial<PaymentProvider> = {}): PaymentProvider {
  return { notice: 'Demo: no payment is taken.', upgrade: vi.fn(async () => ({ ok: true as const })), cancel: vi.fn(async () => ({ ok: true as const })), ...over };
}

describe('SubscriptionPanel', () => {
  it('a Free account sees both plans, the price once, the no-payment label and Upgrade', async () => {
    const p = provider();
    const onChange = vi.fn();
    render(<SubscriptionPanel isPremium={false} isGuest={false} provider={p} onChange={onChange} />);
    expect(screen.getByText('Current plan: Free')).toBeTruthy();
    expect(screen.getByText('Demo: no payment is taken.')).toBeTruthy();
    expect(document.body.textContent!.match(/\$7\.99\/month/g)).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull(); // no card fields
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Premium' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(p.upgrade).toHaveBeenCalled();
  });

  it('a Premium account can cancel', async () => {
    const p = provider();
    render(<SubscriptionPanel isPremium isGuest={false} provider={p} onChange={() => {}} />);
    expect(screen.getByText('Current plan: Premium')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Premium' }));
    await waitFor(() => expect(p.cancel).toHaveBeenCalled());
  });

  it('a guest is sent to sign up before upgrading', () => {
    const p = provider();
    render(<SubscriptionPanel isPremium={false} isGuest provider={p} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Upgrade to Premium' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign up to upgrade' }).getAttribute('href')).toBe('/signup?next=%2Fprofile');
  });
});
