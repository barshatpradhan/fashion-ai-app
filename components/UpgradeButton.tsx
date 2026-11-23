'use client';
import { useState } from 'react';
import { Button } from './Button';
import ui from './ui.module.css';

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
      <Button ghost={ghost} loading={state === 'working'} onClick={() => void upgrade()}>
        {state === 'working' ? 'Upgrading…' : label}
      </Button>
      {state === 'error' ? <span role="alert" className={ui.hint}> Something went wrong. Please try again.</span> : null}
    </span>
  );
}
