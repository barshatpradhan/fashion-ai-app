'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { PLANS, type PaymentProvider } from '@/lib/billing/paymentProvider';
import { Button } from '../Button';
import ui from '../ui.module.css';
import a from '../auth.module.css';

type Props = {
  isPremium: boolean;
  isGuest: boolean;
  /** Where a real payment provider would plug in; today the no-payment demo toggle. */
  provider: PaymentProvider;
  onChange: () => void;
  /** Allowance badges, shown under the plan. */
  children?: ReactNode;
};

/** Plan and what each includes. A placeholder: no card fields, checkout or invoices. */
export function SubscriptionPanel({ isPremium, isGuest, provider, onChange, children }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'upgrade' | 'cancel') {
    setWorking(true);
    setError(null);
    const r = kind === 'upgrade' ? await provider.upgrade() : await provider.cancel();
    setWorking(false);
    if (r.ok) onChange();
    else setError(r.error === 'signup_required' ? 'Create an account first to upgrade.' : 'Something went wrong. Please try again.');
  }

  return (
    <section className={ui.panel} aria-labelledby="plan-title">
      <h2 id="plan-title" className={ui.sectionTitle}>Subscription</h2>
      <p className={a.meta} role="status"><strong>Current plan: {isPremium ? PLANS.premium.name : PLANS.free.name}</strong></p>

      <div className={a.form}>
        <div>
          <strong>{PLANS.free.name}</strong>
          <ul className={ui.hint}>{PLANS.free.includes.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
        <div>
          <strong>{PLANS.premium.name} · {PLANS.premium.price}</strong>
          <ul className={ui.hint}>{PLANS.premium.includes.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      </div>

      <div className={a.actions}>
        {isGuest ? (
          <Link className={ui.button} href={`/signup?next=${encodeURIComponent('/profile')}`}>Sign up to upgrade</Link>
        ) : isPremium ? (
          <Button ghost loading={working} onClick={() => void act('cancel')}>{working ? 'Cancelling…' : 'Cancel Premium'}</Button>
        ) : (
          <Button loading={working} onClick={() => void act('upgrade')}>{working ? 'Upgrading…' : 'Upgrade to Premium'}</Button>
        )}
      </div>
      <p className={a.meta}>{provider.notice}</p>
      {error ? <p className={a.formError} role="alert">{error}</p> : null}
      {children}
    </section>
  );
}
