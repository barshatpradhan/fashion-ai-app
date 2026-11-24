'use client';
import { useState, type FormEvent } from 'react';
import a from '../auth.module.css';
import ui from '../ui.module.css';

/** Delete the account: type DELETE, then POST /api/account/delete (service role removes photos and user). */
export function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const [word, setWord] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (word !== 'DELETE') return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onDeleted();
    } catch {
      setError('We could not delete your account. Nothing was removed. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={a.danger} aria-labelledby="danger-title">
      <h2 id="danger-title" className={ui.sectionTitle}>Delete account</h2>
      <p className={`${ui.hint} ${ui.hintWide}`}>
        This deletes your account, your closet, scans, looks and every photo you uploaded. It can&apos;t be undone.
      </p>
      <form className={a.form} onSubmit={(e) => void submit(e)}>
        <div className={a.field}>
          <label htmlFor="delete-confirm" className={a.label}>Type DELETE to confirm</label>
          <input id="delete-confirm" className={a.input} value={word} onChange={(e) => setWord(e.target.value)}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={working} />
        </div>
        {error ? <p className={a.formError} role="alert">{error}</p> : null}
        <div className={a.actions}>
          <button type="submit" className={a.dangerButton} disabled={word !== 'DELETE' || working} aria-busy={working || undefined}>
            {working ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </form>
    </section>
  );
}
