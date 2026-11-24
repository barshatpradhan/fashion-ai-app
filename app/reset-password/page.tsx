'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SetPasswordForm } from '@/components/SetPasswordForm';
import ui from '@/components/ui.module.css';
import a from '@/components/auth.module.css';

/** Reached from the reset email via /auth/callback, which signed this browser in as the account. */
export default function ResetPasswordPage() {
  const [done, setDone] = useState(false);
  return (
    <main className={`${ui.page} ${a.shell}`}>
      <div className={ui.head}>
        <p className={ui.eyebrow}>Account</p>
        <h1 className={ui.title}>Choose a new password</h1>
      </div>
      {done ? (
        <div className={a.notice} role="status">
          <strong>Your password is changed.</strong>
          <p><Link className={a.link} href="/closet">Open your closet</Link></p>
        </div>
      ) : (
        <>
          <SetPasswordForm submitLabel="Save new password" onDone={() => setDone(true)} />
          <div className={a.links}>
            <Link className={a.link} href="/forgot-password">Ask for a new link</Link>
          </div>
        </>
      )}
    </main>
  );
}
