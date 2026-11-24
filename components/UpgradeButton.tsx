'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from './Button';
import ui from './ui.module.css';

type Props = { label?: string; onUpgraded?: () => void; ghost?: boolean };

/**
 * POSTs `upgrade` (no payment: Premium is a toggle) and then refreshes the page state.
 * Guests get `signup_required` and are sent to sign up, coming back to this page afterwards.
 */
export function UpgradeButton({ label = 'Upgrade to Premium · $7.99/month', onUpgraded, ghost }: Props) {
  const [state, setState] = useState<'idle' | 'working' | 'error' | 'signup'>('idle');
  const [back, setBack] = useState('/profile');
  async function upgrade() {
    setState('working');
    try {
      const res = await fetch('/api/premium', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upgrade' }),
      });
      if (res.status === 403) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (json.error === 'signup_required') {
          setBack(window.location.pathname);
          return setState('signup');
        }
      }
      if (!res.ok) throw new Error(String(res.status));
      if (onUpgraded) onUpgraded();
      else window.location.reload();
    } catch (err) {
      console.error('upgrade failed', err);
      setState('error');
    }
  }
  return (
    <span>
      <Button ghost={ghost} loading={state === 'working'} onClick={() => void upgrade()}>
        {state === 'working' ? 'Upgrading…' : label}
      </Button>
      {state === 'error' ? <span role="alert" className={ui.hint}> Something went wrong. Please try again.</span> : null}
      {state === 'signup' ? (
        <span role="alert" className={ui.hint}>
          {' '}Create a free account to upgrade, so Premium stays with you on any device.{' '}
          <Link href={`/signup?next=${encodeURIComponent(back)}`}>Create an account</Link>
        </span>
      ) : null}
    </span>
  );
}
