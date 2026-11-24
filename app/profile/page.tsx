'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ensureSession } from '@/lib/db/browser';
import { activityDate, activityLabel } from '@/lib/ui/profile';
import type { ProfileView } from '@/lib/db/profile';
import type { AccountView } from '@/lib/auth/account';
import { logOut } from '@/lib/auth/flows';
import { PROFILE_UPDATED_EVENT } from '@/lib/auth/useNavAccount';
import { browserLogOutDeps } from '@/lib/auth/browserPort';
import { demoNoPaymentProvider } from '@/lib/billing/paymentProvider';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import { AccountSection } from '@/components/profile/AccountSection';
import { PasswordSection } from '@/components/profile/PasswordSection';
import { DangerZone } from '@/components/profile/DangerZone';
import { GuestCard } from '@/components/profile/GuestCard';
import { SubscriptionPanel } from '@/components/profile/SubscriptionPanel';
import ui from '@/components/ui.module.css';
import p2 from '@/components/profile.module.css';

type FullProfile = ProfileView & { account: AccountView };
type Load = { kind: 'loading' } | { kind: 'ready'; profile: FullProfile } | { kind: 'error' };

export default function ProfilePage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [toggling, setToggling] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await ensureSession();
    const res = await fetch('/api/profile', { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as Partial<FullProfile>;
    if (!res.ok || !json.allowance || !Array.isArray(json.activity) || !json.account) throw new Error('load failed');
    setLoad({ kind: 'ready', profile: json as FullProfile });
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.error('profile load failed', err);
      setLoad({ kind: 'error' });
    });
  }, [refresh]);

  async function demoToggle() {
    setToggling(true);
    try {
      const res = await fetch('/api/premium', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'demo_toggle' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await refresh();
    } catch (err) {
      console.error('demo toggle failed', err);
    } finally {
      setToggling(false);
    }
  }

  /** Log out (or after deleting the account): continue as a fresh guest. */
  async function leave(message: string) {
    setLoggingOut(true);
    try {
      await logOut(browserLogOutDeps());
      setNotice(message);
      await refresh();
      router.refresh();
    } catch (err) {
      console.error('log out failed', err instanceof Error ? err.name : 'error');
    } finally {
      setLoggingOut(false);
    }
  }

  const p = load.kind === 'ready' ? load.profile : null;

  return (
    <main className={ui.page}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Profile</p>
        <h1 className={ui.title}>Your wardrobe, your record</h1>
      </div>

      {notice ? <p className={ui.status} role="status">{notice}</p> : null}
      {load.kind === 'loading' ? (
        <p className={ui.status} role="status" aria-live="polite"><span className={ui.pulse} aria-hidden="true" />Opening your profile…</p>
      ) : null}
      {load.kind === 'error' ? <p className={ui.error} role="alert">We couldn&apos;t open your profile. Please refresh the page.</p> : null}

      {p ? (
        <div className={`${ui.grid2} ${ui.section}`}>
          {p.account.isGuest ? (
            <GuestCard />
          ) : (
            <AccountSection
              displayName={p.account.displayName}
              memberSince={p.account.memberSince}
              onSaved={() => { void refresh(); window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT)); }}
              onLogOut={() => void leave('You are logged out. You can keep browsing as a guest.')}
              loggingOut={loggingOut}
            />
          )}

          <SubscriptionPanel isPremium={p.isPremium} isGuest={p.account.isGuest} provider={demoNoPaymentProvider} onChange={() => void refresh()}>
            <div className={p2.badges}>
              <AllowanceBadge allowance={p.allowance.uploads} unit="upload" />
              <AllowanceBadge allowance={p.allowance.looks} unit="look" />
            </div>
          </SubscriptionPanel>

          {p.isDemo ? (
            <section className={ui.panel} aria-labelledby="demo-title">
              <h2 id="demo-title" className={ui.sectionTitle}>Presenter switch (demo only)</h2>
              <p className={`${ui.hint} ${ui.hintWide}`}>Flip this account between Free and Premium to show both experiences.</p>
              <div className={ui.seg} role="group" aria-label="Demo plan">
                <button type="button" className={`${ui.choice} ${!p.isPremium ? ui.choicePrimary : ''}`} aria-pressed={!p.isPremium}
                  disabled={toggling || !p.isPremium} onClick={() => void demoToggle()}>Free</button>
                <button type="button" className={`${ui.choice} ${p.isPremium ? ui.choicePrimary : ''}`} aria-pressed={p.isPremium}
                  disabled={toggling || p.isPremium} onClick={() => void demoToggle()}>Premium</button>
              </div>
            </section>
          ) : null}

          {!p.account.isGuest ? <PasswordSection /> : null}

          <section className={p2.record} aria-labelledby="activity-title">
            <h2 id="activity-title" className={p2.recordTitle}>Activity record</h2>
            {p.activity.length ? (
              <ul className={p2.list}>
                {p.activity.map((a) => (
                  <li key={a.id} className={p2.row}>
                    <span className={p2.kind}>{activityLabel(a)}</span>
                    <span className={p2.date}>{activityDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={ui.empty}>Nothing yet. Add a piece to your closet or style a look to start your record.</p>
            )}
          </section>

          {!p.account.isGuest && !p.isDemo ? (
            <DangerZone onDeleted={() => void leave('Your account and its photos are deleted. You are now browsing as a new guest.')} />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
