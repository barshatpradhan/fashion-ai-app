'use client';
import Link from 'next/link';
import { useState } from 'react';
import { messageForError } from '@/lib/ui/messages';
import { noUploadsMessage } from '@/lib/ui/closet';
import { postCloset } from '@/lib/ui/closetClient';
import c from './closet.module.css';
import s from './result.module.css';

type State = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; already: boolean } | { kind: 'error'; message: string };

type Props = { scanId: string; onSaved?: (garmentId: string | null) => void };

/** "Add to closet" (save_scan): spends one Upload. */
export function AddToCloset({ scanId, onSaved }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function save() {
    setState({ kind: 'saving' });
    try {
      const r = await postCloset<{ garmentId?: string }>({ action: 'save_scan', scanId });
      if (r.status === 200) {
        setState({ kind: 'saved', already: false });
        onSaved?.(r.json.garmentId ?? null);
      } else if (r.status === 409 && r.json.error === 'already_saved') {
        setState({ kind: 'saved', already: true });
        onSaved?.(null);
      } else if (r.status === 402) {
        setState({ kind: 'error', message: noUploadsMessage(r.json.nextCreditAt) });
      } else {
        setState({ kind: 'error', message: messageForError(r.json.error) });
      }
    } catch {
      setState({ kind: 'error', message: messageForError(null) });
    }
  }

  if (state.kind === 'saved') {
    return (
      <p className={c.inline} role="status">
        {state.already ? 'Already in your closet.' : 'Added to your closet.'} <Link href="/closet">See your rail →</Link>
      </p>
    );
  }

  return (
    <div>
      <div className={c.saveRow}>
        <button type="button" className={`${s.button} ${s.ghost}`} onClick={() => void save()} disabled={state.kind === 'saving'}>
          {state.kind === 'saving' ? 'Adding…' : 'Add to closet'}
        </button>
        <span className={s.hint}>Uses 1 upload.</span>
      </div>
      {state.kind === 'error' ? <p className={s.note} role="alert">{state.message}</p> : null}
    </div>
  );
}
