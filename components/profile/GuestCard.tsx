import Link from 'next/link';
import ui from '../ui.module.css';
import a from '../auth.module.css';

/** Shown on /profile to guests instead of the account settings. */
export function GuestCard() {
  return (
    <section className={ui.panel} aria-labelledby="guest-title">
      <h2 id="guest-title" className={ui.sectionTitle}>Your account</h2>
      <p className={`${ui.hint} ${ui.hintWide}`}>You&apos;re browsing as a guest. Create an account to keep your closet on any device.</p>
      <div className={a.actions}>
        <Link className={ui.button} href="/signup?next=%2Fprofile">Sign up</Link>
        <Link className={`${ui.button} ${ui.ghost}`} href="/login?next=%2Fprofile">Log in</Link>
      </div>
    </section>
  );
}
