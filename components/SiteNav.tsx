'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useNavAccount, type NavAccount } from '@/lib/auth/useNavAccount';
import { logOut } from '@/lib/auth/flows';
import { browserLogOutDeps } from '@/lib/auth/browserPort';
import ui from './ui.module.css';
import n from './nav.module.css';
import { Logo } from './Logo';

type Tab = '/' | '/scan' | '/closet' | '/looks' | '/profile';

export function activeTab(pathname: string): Tab | null {
  if (pathname === '/') return '/';
  const hit = (['/scan', '/closet', '/looks', '/profile'] as const).find(
    (t) => pathname === t || pathname.startsWith(`${t}/`),
  );
  if (hit) return hit;
  if (pathname.startsWith('/guide')) return '/scan';
  return null;
}

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const LINKS: { href: Tab; label: string; icon: ReactNode }[] = [
  { href: '/', label: 'Home', icon: <svg {...svg}><path d="M3 11 12 4l9 7v9H3z" /></svg> },
  { href: '/scan', label: 'Scan', icon: <svg {...svg}><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l2-3h4l2 3" /></svg> },
  { href: '/closet', label: 'Closet', icon: <svg {...svg}><path d="M12 8a2 2 0 1 1 2-2" /><path d="M12 8v1L3 17h18l-9-8" /></svg> },
  { href: '/looks', label: 'Looks', icon: <svg {...svg}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg> },
  { href: '/profile', label: 'Profile', icon: <svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" /></svg> },
];

/** Log in / Sign up for guests, Log out for accounts; nothing until the session is known. */
function AccountControls({ account, onLogOut, busy }: { account: NavAccount; onLogOut: () => void; busy: boolean }) {
  if (account.state === 'guest') {
    return (
      <>
        <Link href="/login" className={n.authLink}>Log in</Link>
        <Link href="/signup" className={n.authLink}>Sign up</Link>
      </>
    );
  }
  if (account.state === 'account') {
    return (
      <button type="button" className={n.authLink} onClick={onLogOut} disabled={busy} aria-busy={busy || undefined}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    );
  }
  return null;
}

/** The nav's Scan a garment button, except on the Scan page, where it would point at itself. */
export function showScanCta(pathname: string): boolean {
  return pathname !== '/scan';
}

export function SiteNav() {
  const pathname = usePathname() ?? '';
  const active = activeTab(pathname);
  const router = useRouter();
  const account = useNavAccount();
  const [busy, setBusy] = useState(false);
  const cur = (href: Tab) => (active === href ? ('page' as const) : undefined);

  async function onLogOut() {
    setBusy(true);
    try {
      await logOut(browserLogOutDeps());
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const profileLink = (l: (typeof LINKS)[number]) =>
    account.state === 'account' ? (
      <Link key={l.href} href={l.href} className={`${n.link} ${n.profileLink}`} aria-current={cur(l.href)} aria-label={`Profile, ${account.name}`}>
        <span className={n.initial} aria-hidden="true">{account.initial}</span>
        <span className={n.profileName}>{account.name}</span>
      </Link>
    ) : (
      <Link key={l.href} href={l.href} className={n.link} aria-current={cur(l.href)}>{l.label}</Link>
    );

  return (
    <>
      <header className={n.header}>
        <Link href="/" className={n.logoLink} aria-label="REVIVO home"><Logo /></Link>
        <div className={n.account}>
          <AccountControls account={account} onLogOut={() => void onLogOut()} busy={busy} />
        </div>
      </header>
      <nav className={n.top} aria-label="Main">
        <Link href="/" className={n.logoLink} aria-label="REVIVO home"><Logo /></Link>
        <div className={n.links}>
          {LINKS.map((l) => (l.href === '/profile' ? profileLink(l) : (
            <Link key={l.href} href={l.href} className={n.link} aria-current={cur(l.href)}>{l.label}</Link>
          )))}
        </div>
        <div className={n.account}>
          <AccountControls account={account} onLogOut={() => void onLogOut()} busy={busy} />
          {showScanCta(pathname) ? (
            <Link href="/scan" className={`${ui.button} ${n.small} ${n.scanCta}`}>Scan a garment</Link>
          ) : null}
        </div>
      </nav>
      <nav className={n.tabs} aria-label="Tabs">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={n.tab} aria-current={cur(l.href)}>{l.icon}{l.label}</Link>
        ))}
      </nav>
    </>
  );
}
