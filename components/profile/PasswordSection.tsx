'use client';
import { useState, type FormEvent } from 'react';
import { browserAuthPort } from '@/lib/auth/browserPort';
import { changePassword } from '@/lib/auth/flows';
import { PasswordField } from '../AuthFields';
import { Button } from '../Button';
import ui from '../ui.module.css';
import a from '../auth.module.css';

/** Current password first (re-authentication), then the new one twice. */
export function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (!current) return setErrors({ current: 'Enter your current password.' });
    if (confirm !== next) return setErrors({ confirm: 'Passwords do not match.' });
    setErrors({});
    setSaving(true);
    try {
      const r = await changePassword(current, next, browserAuthPort());
      if (r.ok) {
        setCurrent(''); setNext(''); setConfirm('');
        setDone(true);
      } else if (r.field) setErrors({ [r.field]: r.message });
      else setErrors({ form: r.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={ui.panel} aria-labelledby="password-title">
      <h2 id="password-title" className={ui.sectionTitle}>Password</h2>
      <form className={a.form} onSubmit={(e) => void submit(e)} noValidate>
        {errors.form ? <p className={a.formError} role="alert">{errors.form}</p> : null}
        <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" error={errors.current} disabled={saving} />
        <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" showRules error={errors.next} disabled={saving} />
        <PasswordField id="pw-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={errors.confirm} disabled={saving} />
        <div className={a.actions}>
          <Button type="submit" ghost loading={saving}>{saving ? 'Saving…' : 'Change password'}</Button>
          {done ? <span className={a.meta} role="status">Password changed.</span> : null}
        </div>
      </form>
    </section>
  );
}
