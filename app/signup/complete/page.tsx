'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SetPasswordForm } from '@/components/SetPasswordForm';
import ui from '@/components/ui.module.css';
import a from '@/components/auth.module.css';

/** After the confirmation link: the email is verified, so the converted guest now chooses a password. */
export default function SignUpCompletePage() {
  const [done, setDone] = useState(false);
  return (
    <main className={`${ui.page} ${a.shell}`}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Account</p>
        <h1 className={ui.title}>Choose your password</h1>
      </div>
      {done ? (
        <div className={a.notice} role="status">
          <strong>Your account is ready.</strong>
          <p><Link className={a.link} href="/closet">Open your closet</Link></p>
        </div>
      ) : (
        <>
          <p className={`${ui.hint} ${ui.hintWide}`}>Your email is confirmed. Set a password to log in on any device.</p>
          <SetPasswordForm submitLabel="Finish sign-up" onDone={() => setDone(true)} />
        </>
      )}
    </main>
  );
}
