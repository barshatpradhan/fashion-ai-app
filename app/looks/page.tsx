'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ensureSession } from '@/lib/db/browser';
import { looksMessage, type AllowanceView } from '@/lib/ui/closet';
import type { ClosetGarment } from '@/lib/db/closet';
import type { Look } from '@/lib/domain/types';
import { OCCASIONS, MIN_ITEMS } from '@/lib/domain/outfits';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import { LooksCarousel } from '@/components/LooksCarousel';
import { UpgradeButton } from '@/components/UpgradeButton';
import { Button } from '@/components/Button';
import ui from '@/components/ui.module.css';
import c from '@/components/closet.module.css';
import l from '@/components/looks.module.css';

type Closet = { garments: ClosetGarment[]; allowance: { uploads: AllowanceView; looks: AllowanceView } };
type Load = { kind: 'loading' } | { kind: 'ready'; closet: Closet } | { kind: 'error' };

const OCCASION_LABEL: Record<(typeof OCCASIONS)[number], string> = {
  everyday: 'Everyday', work: 'Work', weekend: 'Weekend', evening: 'Evening', event: 'An event',
};

async function postOutfits(body: Record<string, unknown>) {
  const res = await fetch('/api/outfits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; nextCreditAt?: string; looks?: Look[] };
  return { status: res.status, json };
}

export default function LooksPage() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [looks, setLooks] = useState<Look[]>([]);
  const [occasion, setOccasion] = useState('');
  const [styledFor, setStyledFor] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await ensureSession();
    const res = await fetch('/api/closet', { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as Partial<Closet>;
    if (!res.ok || !Array.isArray(json.garments) || !json.allowance) throw new Error('load failed');
    setLoad({ kind: 'ready', closet: json as Closet });
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.error('looks load failed', err);
      setLoad({ kind: 'error' });
    });
  }, [refresh]);

  const closet = load.kind === 'ready' ? load.closet : null;
  const byId = useMemo(
    () => Object.fromEntries((closet?.garments ?? []).map((g) => [g.id, g])) as Record<string, ClosetGarment>,
    [closet],
  );
  const activeCount = closet?.garments.filter((g) => g.status === 'active').length ?? 0;
  const tooSmall = closet !== null && activeCount < MIN_ITEMS;
  const allowance = closet?.allowance.looks;
  const outOfLooks = allowance !== undefined && allowance.remaining !== 'unlimited' && allowance.remaining < 1;

  async function onStyle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (tooSmall) {
      setError(looksMessage('closet_too_small'));
      return;
    }
    setWorking(true);
    try {
      const r = await postOutfits({ action: 'style', ...(occasion ? { occasion } : {}) });
      if (r.status === 200 && Array.isArray(r.json.looks) && r.json.looks.length) {
        setLooks(r.json.looks);
        setStyledFor(occasion || null);
      } else {
        setError(looksMessage(r.json.error, r.json.nextCreditAt));
      }
      await refresh().catch((err) => console.error('looks refresh failed', err));
    } catch (err) {
      console.error('style failed', err);
      setError(looksMessage(null));
    } finally {
      setWorking(false);
    }
  }

  async function onSave(look: Look) {
    const r = await postOutfits({ action: 'save', look, ...(styledFor ? { occasion: styledFor } : {}) });
    if (r.status !== 200) throw new Error(r.json.error ?? 'server_error');
  }

  return (
    <main className={ui.page}>
      <div className={ui.headRow}>
        <div className={ui.head}>
          <p className={ui.eyebrow}>Looks</p>
          <h1 className={ui.title}>Style me</h1>
        </div>
        {allowance ? <AllowanceBadge allowance={allowance} unit="look" /> : null}
      </div>
      <p className={`${ui.hint} ${ui.hintWide}`}>
        Three outfits from pieces you already own. Each one uses 1 look.
      </p>

      <form className={l.styleBar} onSubmit={(e) => void onStyle(e)}>
        <label className={l.select}>
          Occasion (optional)
          <select value={occasion} onChange={(e) => setOccasion(e.target.value)} disabled={working}>
            <option value="">Any</option>
            {OCCASIONS.map((o) => <option key={o} value={o}>{OCCASION_LABEL[o]}</option>)}
          </select>
        </label>
        <Button type="submit" loading={working} disabled={!closet || outOfLooks}>
          {working ? 'Styling…' : looks.length ? 'Style me again' : 'Style me'}
        </Button>
      </form>

      {working ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          Putting looks together from your closet…
        </p>
      ) : null}
      {error ? <p className={ui.error} role="alert">{error}</p> : null}
      {!error && outOfLooks ? <p className={ui.error} role="alert">{looksMessage('no_looks', allowance?.nextCreditAt)} <UpgradeButton label="Go Premium · $7.99/month" ghost /></p> : null}
      {!error && tooSmall ? (
        <p className={`${ui.empty} ${c.inline}`}>
          {looksMessage('closet_too_small')} <Link href="/closet">Go to your closet</Link>
        </p>
      ) : null}

      {load.kind === 'loading' ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          Opening your closet…
        </p>
      ) : null}
      {load.kind === 'error' ? <p className={ui.error} role="alert">We couldn&apos;t open your closet. Please refresh the page.</p> : null}

      {closet && looks.length ? <LooksCarousel looks={looks} garments={byId} onSave={onSave} /> : null}
    </main>
  );
}
