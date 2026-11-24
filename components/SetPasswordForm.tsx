'use client';
import { useState, type FormEvent } from 'react';
import { browserAuthPort } from '@/lib/auth/browserPort';
import { setNewPassword } from '@/lib/auth/flows';
import { resetSession } from '@/lib/db/browser';
import { PasswordField } from './AuthFields';
import { Button } from './Button';
import a from './auth.module.css';

/** New password twice, then updateUser. Used by /reset-password and /signup/complete. */
export function SetPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (confirm !== next) return setErrors({ confirm: 'Passwords do not match.' });
    setErrors({});
    setSending(true);
    try {
      const r = await setNewPassword(next, browserAuthPort());
      if (r.ok) {
        resetSession();
        onDone();
      } else if (r.field === 'next') setErrors({ next: r.message });
      else setFormError(r.message);
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={a.form} onSubmit={(e) => void submit(e)} noValidate>
      {formError ? <p className={a.formError} role="alert">{formError}</p> : null}
      <PasswordField id="new-password" label="New password" value={next} onChange={setNext} autoComplete="new-password"
        showRules error={errors.next} disabled={sending} required />
      <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password"
        error={errors.confirm} disabled={sending} required />
      <div className={a.actions}>
        <Button type="submit" loading={sending}>{sending ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}
