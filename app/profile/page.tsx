'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureSession } from '@/lib/db/browser';
import { activityDate, activityLabel } from '@/lib/ui/profile';
import type { ProfileView } from '@/lib/db/profile';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import { UpgradeButton } from '@/components/UpgradeButton';
import ui from '@/components/ui.module.css';
import p2 from '@/components/profile.module.css';

type Load = { kind: 'loading' } | { kind: 'ready'; profile: ProfileView } | { kind: 'error' };

export default function ProfilePage() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    await ensureSession();
    const res = await fetch('/api/profile', { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as Partial<ProfileView>;
    if (!res.ok || !json.allowance || !Array.isArray(json.activity)) throw new Error('load failed');
    setLoad({ kind: 'ready', profile: json as ProfileView });
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

  const p = load.kind === 'ready' ? load.profile : null;

  return (
    <main className={ui.page}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Profile</p>
        <h1 className={ui.title}>Your wardrobe, your record</h1>
      </div>

      {load.kind === 'loading' ? (
        <p className={ui.status} role="status" aria-live="polite"><span className={ui.pulse} aria-hidden="true" />Opening your profile…</p>
      ) : null}
      {load.kind === 'error' ? <p className={ui.error} role="alert">We couldn&apos;t open your profile. Please refresh the page.</p> : null}

      {p ? (
        <div className={`${ui.grid2} ${ui.section}`}>
          <section className={ui.panel} aria-labelledby="plan-title">
            <h2 id="plan-title" className={ui.sectionTitle}>Your plan</h2>
            {p.isPremium ? (
              <p className={p2.plan} role="status"><strong>Premium</strong>: every Recipe and guide is open, and your uploads and looks are unlimited.</p>
            ) : (
              <>
                <p className={`${ui.hint} ${ui.hintWide}`}>
                  Free covers your first uploads and looks, then a slow refill. Premium opens every Recipe and guide, with no limits.
                </p>
                <UpgradeButton onUpgraded={() => void refresh()} />
              </>
            )}
            <div className={p2.badges}>
              <AllowanceBadge allowance={p.allowance.uploads} unit="upload" />
              <AllowanceBadge allowance={p.allowance.looks} unit="look" />
            </div>
          </section>

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
        </div>
      ) : null}
    </main>
  );
}
