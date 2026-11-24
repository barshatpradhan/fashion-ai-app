'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { browserAuthPort } from '@/lib/auth/browserPort';
import { changeEmail } from '@/lib/auth/flows';
import { TextField } from '../AuthFields';
import { Button } from '../Button';
import ui from '../ui.module.css';
import a from '../auth.module.css';

type Props = { displayName: string | null; memberSince: string | null; onSaved: () => void; onLogOut: () => void; loggingOut: boolean };

const NAME_ERRORS: Record<string, string> = {
  required: 'Enter a name to show on your profile.',
  too_long: 'Use 60 characters or fewer.',
  invalid: 'Use letters, numbers and ordinary punctuation.',
};

/** Display name, email (with a re-confirmation email) and member-since date. */
export function AccountSection({ displayName, memberSince, onSaved, onLogOut, loggingOut }: Props) {
  const [name, setName] = useState(displayName ?? '');
  const [nameState, setNameState] = useState<{ saving: boolean; error?: string; saved?: boolean }>({ saving: false });
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<{ saving: boolean; error?: string; sent?: boolean }>({ saving: false });

  useEffect(() => {
    browserAuthPort().getUser().then((u) => {
      setCurrentEmail(u?.email ?? null);
      setPendingEmail(u?.new_email ?? null);
    }).catch(() => undefined);
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameState({ saving: true });
    const res = await fetch('/api/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: name }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { error?: string; displayName?: string } | undefined;
    if (res?.ok && json?.displayName) {
      setName(json.displayName);
      setNameState({ saving: false, saved: true });
      onSaved();
    } else {
      setNameState({ saving: false, error: NAME_ERRORS[json?.error ?? ''] ?? 'Something went wrong. Please try again.' });
    }
  }

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setEmailState({ saving: true });
    const r = await changeEmail(email, browserAuthPort(), window.location.origin);
    setEmailState(r.ok ? { saving: false, sent: true } : { saving: false, error: r.message });
  }

  const since = memberSince ? new Date(memberSince).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <section className={ui.panel} aria-labelledby="account-title">
      <h2 id="account-title" className={ui.sectionTitle}>Account</h2>
      {since ? <p className={a.meta}>Member since {since}</p> : null}

      <form className={a.form} onSubmit={(e) => void saveName(e)}>
        <TextField id="profile-name" label="Display name" value={name} onChange={(v) => { setName(v); setNameState({ saving: false }); }}
          autoComplete="nickname" maxLength={60} error={nameState.error} disabled={nameState.saving} />
        <div className={a.actions}>
          <Button type="submit" ghost loading={nameState.saving}>{nameState.saving ? 'Saving…' : 'Save name'}</Button>
          {nameState.saved ? <span className={a.meta} role="status">Saved.</span> : null}
        </div>
      </form>

      <form className={a.form} onSubmit={(e) => void saveEmail(e)}>
        <p className={a.meta}>Email: <strong>{currentEmail ?? '…'}</strong></p>
        {pendingEmail ? <p className={a.meta}>Waiting for you to confirm a change to {pendingEmail}.</p> : null}
        <TextField id="profile-email" label="New email" type="email" value={email} onChange={(v) => { setEmail(v); setEmailState({ saving: false }); }}
          autoComplete="email" error={emailState.error} disabled={emailState.saving} />
        <div className={a.actions}>
          <Button type="submit" ghost loading={emailState.saving}>{emailState.saving ? 'Sending…' : 'Change email'}</Button>
        </div>
        {emailState.sent ? (
          <p className={a.meta} role="status">Check your inbox: open the confirmation link to finish the change. Your email stays the same until then.</p>
        ) : null}
      </form>

      <div className={a.actions}>
        <Button ghost loading={loggingOut} onClick={onLogOut}>{loggingOut ? 'Logging out…' : 'Log out'}</Button>
      </div>
    </section>
  );
}
