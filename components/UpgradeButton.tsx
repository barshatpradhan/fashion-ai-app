'use client';
import { useState } from 'react';
import s from './result.module.css';

type Props = { label?: string; onUpgraded?: () => void; ghost?: boolean };

/** POSTs `upgrade` (no payment: Premium is a toggle) and then refreshes the page state. */
export function UpgradeButton({ label = 'Upgrade to Premium · $7.99/month', onUpgraded, ghost }: Props) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  async function upgrade() {
    setState('working');
    try {
      const res = await fetch('/api/premium', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upgrade' }),
      });
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
      <button type="button" className={`${s.button} ${ghost ? s.ghost : ''}`} onClick={() => void upgrade()} disabled={state === 'working'}>
        {state === 'working' ? 'Upgrading…' : label}
      </button>
      {state === 'error' ? <span role="alert" className={s.hint}> Something went wrong. Please try again.</span> : null}
    </span>
  );
}
