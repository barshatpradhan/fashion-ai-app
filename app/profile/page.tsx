'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureSession } from '@/lib/db/browser';
import { activityDate, activityLabel } from '@/lib/ui/profile';
import type { ProfileView } from '@/lib/db/profile';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import { UpgradeButton } from '@/components/UpgradeButton';
import s from '@/components/result.module.css';
import c from '@/components/closet.module.css';

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
    <main className={s.page}>
      <p className={s.brand}>Revivo</p>
      <p className={s.eyebrow}>Profile</p>
      <h1 className={s.title}>Your wardrobe, your record</h1>

      {load.kind === 'loading' ? (
        <p className={s.status} role="status" aria-live="polite"><span className={s.pulse} aria-hidden="true" />Opening your profile…</p>
      ) : null}
      {load.kind === 'error' ? <p className={s.error} role="alert">We couldn&apos;t open your profile. Please refresh the page.</p> : null}

      {p ? (
        <>
          <section className={s.section} aria-labelledby="plan-title">
            <h2 id="plan-title" className={s.sectionTitle}>Your plan</h2>
            {p.isPremium ? (
              <p className={c.inline} role="status"><strong>Premium</strong>: every Recipe and guide is open, and your uploads and looks are unlimited.</p>
            ) : (
              <>
                <p className={s.hint} style={{ maxWidth: '52ch' }}>
                  Free covers your first uploads and looks, then a slow refill. Premium opens every Recipe and guide, with no limits.
                </p>
                <UpgradeButton onUpgraded={() => void refresh()} />
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
              <AllowanceBadge allowance={p.allowance.uploads} unit="upload" />
              <AllowanceBadge allowance={p.allowance.looks} unit="look" />
            </div>
          </section>

          {p.isDemo ? (
            <section className={s.section} aria-labelledby="demo-title">
              <h2 id="demo-title" className={s.sectionTitle}>Presenter switch (demo only)</h2>
              <p className={s.hint} style={{ maxWidth: '52ch' }}>Flip this account between Free and Premium to show both experiences.</p>
              <div className={c.detailActions} role="group" aria-label="Demo plan">
                <button type="button" className={`${s.choice} ${!p.isPremium ? s.choicePrimary : ''}`} aria-pressed={!p.isPremium}
                  disabled={toggling || !p.isPremium} onClick={() => void demoToggle()}>Free</button>
                <button type="button" className={`${s.choice} ${p.isPremium ? s.choicePrimary : ''}`} aria-pressed={p.isPremium}
                  disabled={toggling || p.isPremium} onClick={() => void demoToggle()}>Premium</button>
              </div>
            </section>
          ) : null}

          <section className={s.section} aria-labelledby="activity-title">
            <h2 id="activity-title" className={s.sectionTitle}>Activity record</h2>
            {p.activity.length ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {p.activity.map((a) => (
                  <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span>{activityLabel(a)}</span>
                    <span className={s.hint}>{activityDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.empty}>Nothing yet. Add a piece to your closet or style a look to start your record.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
