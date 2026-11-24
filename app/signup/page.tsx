'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ensureSession, resetSession } from '@/lib/db/browser';
import { browserAuthPort } from '@/lib/auth/browserPort';
import { signUp, validateSignup, type FieldErrors } from '@/lib/auth/flows';
import { safeNextPath } from '@/lib/auth/redirect';
import { TextField, PasswordField } from '@/components/AuthFields';
import { Button } from '@/components/Button';
import ui from '@/components/ui.module.css';
import a from '@/components/auth.module.css';

type Phase = 'form' | 'check_email' | 'signed_in';

export default function SignUpPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      await ensureSession();
      const user = await browserAuthPort().getUser();
      if (user && !user.is_anonymous) setPhase('signed_in');
    })().catch((err) => console.warn('session check failed', err));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSignup({ email, password, confirm, displayName });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      const r = await signUp({ email, password, displayName }, browserAuthPort(), window.location.origin);
      if (r.kind === 'done') {
        resetSession();
        router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')));
        return;
      }
      if (r.kind === 'check_email') setPhase('check_email');
      else if (r.kind === 'already_signed_in') setPhase('signed_in');
      else if (r.field) setErrors({ [r.field]: r.message });
      else setFormError(r.message);
    } catch (err) {
      console.error('sign-up failed', err instanceof Error ? err.name : 'error');
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={ui.page}>
      <div className={a.shell}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Account</p>
        <h1 className={ui.title}>Create your account</h1>
      </div>

      {phase === 'signed_in' ? (
        <div className={a.notice} role="status">
          <strong>You&apos;re already signed in.</strong>
          <p><Link className={a.link} href="/profile">Go to your profile</Link></p>
        </div>
      ) : null}

      {phase === 'check_email' ? (
        <div className={a.notice} role="status" aria-live="polite">
          <strong>Check your email</strong>
          <p>We&apos;ve sent you a link to confirm your address. Open it on this device, then choose your password to finish. Your closet stays with you.</p>
        </div>
      ) : null}

      {phase === 'form' ? (
        <>
          <p className={`${ui.hint} ${ui.hintWide}`}>Keep your closet, scans and looks on any device. Anything you saved as a guest comes with you.</p>
          <form className={a.form} onSubmit={(e) => void submit(e)} noValidate>
            {formError ? <p className={a.formError} role="alert">{formError}</p> : null}
            <TextField id="signup-name" label="Display name" value={displayName} onChange={setDisplayName} autoComplete="nickname"
              maxLength={60} error={errors.displayName} disabled={sending} required />
            <TextField id="signup-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email"
              error={errors.email} disabled={sending} required />
            <PasswordField id="signup-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password"
              showRules error={errors.password} disabled={sending} required />
            <PasswordField id="signup-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password"
              error={errors.confirm} disabled={sending} required />
            <div className={a.actions}>
              <Button type="submit" loading={sending}>{sending ? 'Creating your account…' : 'Create account'}</Button>
            </div>
          </form>
          <div className={a.links}>
            <span>Already have an account? <Link className={a.link} href="/login">Log in</Link></span>
          </div>
        </>
      ) : null}
      </div>
    </main>
  );
}
