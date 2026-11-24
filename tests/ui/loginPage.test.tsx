// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({ replace: vi.fn(), logIn: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/db/browser', () => ({ resetSession: vi.fn() }));
vi.mock('@/lib/auth/browserPort', () => ({
  browserAuthPort: () => ({ getUser: async () => ({ id: 'g', is_anonymous: true }) }),
  savedPieceCount: async () => 1,
}));
vi.mock('@/lib/auth/flows', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/flows')>()), logIn: h.logIn }));

import LogInPage from '@/app/login/page';
import { LOGIN_ERROR } from '@/lib/auth/flows';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function reachWarning() {
  render(<LogInPage />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  return screen.findByRole('button', { name: 'Log in anyway' });
}

describe('login page: guest with saved pieces', () => {
  // Regression: a failed "Log in anyway" showed nothing, because the error rendered only inside the
  // form, which stays hidden while the warning is open.
  it('a failed "Log in anyway" closes the warning and shows the generic error, keeping what was typed', async () => {
    h.logIn.mockResolvedValue({ ok: false, message: LOGIN_ERROR });
    fireEvent.click(await reachWarning());
    expect((await screen.findByRole('alert')).textContent).toBe(LOGIN_ERROR);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@b.co');
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('a successful "Log in anyway" goes to /closet', async () => {
    h.logIn.mockResolvedValue({ ok: true });
    fireEvent.click(await reachWarning());
    await vi.waitFor(() => expect(h.replace).toHaveBeenCalledWith('/closet'));
  });
});
