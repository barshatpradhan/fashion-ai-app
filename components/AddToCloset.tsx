'use client';
import Link from 'next/link';
import { useState } from 'react';
import { messageForError } from '@/lib/ui/messages';
import { noUploadsMessage } from '@/lib/ui/closet';
import { postCloset } from '@/lib/ui/closetClient';
import { Button } from './Button';
import ui from './ui.module.css';
import c from './closet.module.css';
import { UpgradeButton } from '@/components/UpgradeButton';

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
        <Button ghost loading={state.kind === 'saving'} onClick={() => void save()}>
          {state.kind === 'saving' ? 'Adding…' : 'Add to closet'}
        </Button>
        <span className={ui.hint}>Uses 1 upload.</span>
      </div>
      {state.kind === 'error' ? (
        <p className={ui.note} role="alert">
          {state.message}
          {state.message.startsWith("You're out of uploads") ? <> <UpgradeButton label="Go Premium · $7.99/month" ghost /></> : null}
        </p>
      ) : null}
    </div>
  );
}
