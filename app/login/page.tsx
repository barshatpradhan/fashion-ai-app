'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { resetSession } from '@/lib/db/browser';
import { browserAuthPort, savedPieceCount } from '@/lib/auth/browserPort';
import { logIn, guestLeavesPieces } from '@/lib/auth/flows';
import { safeNextPath } from '@/lib/auth/redirect';
import { TextField, PasswordField } from '@/components/AuthFields';
import { Button } from '@/components/Button';
import ui from '@/components/ui.module.css';
import a from '@/components/auth.module.css';

export default function LogInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linkFailed, setLinkFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [warnPieces, setWarnPieces] = useState(0);

  useEffect(() => {
    setLinkFailed(new URLSearchParams(window.location.search).get('error') === 'link');
  }, []);

  async function go() {
    setSending(true);
    setError(null);
    try {
      const r = await logIn(email, password, browserAuthPort());
      if (!r.ok) return setError(r.message);
      resetSession();
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')));
    } finally {
      setSending(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    const port = browserAuthPort();
    const [user, count] = await Promise.all([port.getUser(), savedPieceCount()]);
    if (guestLeavesPieces(user, count)) return setWarnPieces(count);
    await go();
  }

  return (
    <main className={`${ui.page} ${a.shell}`}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Account</p>
        <h1 className={ui.title}>Log in</h1>
      </div>

      {linkFailed ? <p className={a.formError} role="alert">That link has expired or was already used. Log in, or ask for a new link.</p> : null}

      {warnPieces > 0 ? (
        <div className={a.notice} role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-body">
          <strong id="leave-title">Leave your guest closet behind?</strong>
          <p id="leave-body">
            You have {warnPieces} {warnPieces === 1 ? 'piece' : 'pieces'} saved as a guest. Logging into another account leaves
            {warnPieces === 1 ? ' it' : ' them'} here. To keep {warnPieces === 1 ? 'it' : 'them'}, create an account instead.
          </p>
          <div className={a.actions}>
            <Button loading={sending} onClick={() => void go()}>{sending ? 'Logging in…' : 'Log in anyway'}</Button>
            <Button ghost disabled={sending} onClick={() => setWarnPieces(0)}>Cancel</Button>
            <Link className={a.link} href="/signup">Create an account instead</Link>
          </div>
        </div>
      ) : (
        <form className={a.form} onSubmit={(e) => void submit(e)} noValidate>
          {error ? <p className={a.formError} role="alert">{error}</p> : null}
          <TextField id="login-email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" disabled={sending} required />
          <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" disabled={sending} required />
          <div className={a.actions}>
            <Button type="submit" loading={sending}>{sending ? 'Logging in…' : 'Log in'}</Button>
            <Link className={a.link} href="/forgot-password">Forgot password?</Link>
          </div>
        </form>
      )}

      <div className={a.links}>
        <span>New here? <Link className={a.link} href="/signup">Create an account</Link></span>
      </div>
    </main>
  );
}
