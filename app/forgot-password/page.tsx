'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { browserAuthPort } from '@/lib/auth/browserPort';
import { requestPasswordReset } from '@/lib/auth/flows';
import { TextField } from '@/components/AuthFields';
import { Button } from '@/components/Button';
import ui from '@/components/ui.module.css';
import a from '@/components/auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    setError(undefined);
    setSending(true);
    await requestPasswordReset(email, browserAuthPort(), window.location.origin);
    setSending(false);
    setSent(true);
  }

  return (
    <main className={ui.page}>
      <div className={a.shell}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Account</p>
        <h1 className={ui.title}>Reset your password</h1>
      </div>
      {sent ? (
        <div className={a.notice} role="status" aria-live="polite">
          <strong>If an account exists, we&apos;ve sent a link.</strong>
          <p>Open it on this device to choose a new password. It can take a few minutes to arrive.</p>
        </div>
      ) : (
        <form className={a.form} onSubmit={(e) => void submit(e)} noValidate>
          <p className={`${ui.hint} ${ui.hintWide}`}>Enter your account email and we&apos;ll send you a link to choose a new password.</p>
          <TextField id="forgot-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" error={error} disabled={sending} required />
          <div className={a.actions}>
            <Button type="submit" loading={sending}>{sending ? 'Sending…' : 'Send reset link'}</Button>
          </div>
        </form>
      )}
      <div className={a.links}>
        <Link className={a.link} href="/login">Back to log in</Link>
      </div>
      </div>
    </main>
  );
}
