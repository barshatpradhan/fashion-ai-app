'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { browserClient, ensureSession } from '@/lib/db/browser';
import { UnsupportedImageError } from '@/lib/image/prepare';
import { MESSAGES, messageForError } from '@/lib/ui/messages';
import { postCloset, removeUploaded, uploadPhoto } from '@/lib/ui/closetClient';
import { AddToCloset } from './AddToCloset';
import { Button } from './Button';
import ui from './ui.module.css';
import c from './closet.module.css';

type Source = { kind: 'loading' } | { kind: 'none' } | { kind: 'active'; id: string } | { kind: 'transformed' } | { kind: 'error' };

type Props = { scanId: string; recipeId: string };

/**
 * "I made this": logs a reworked piece in the closet (no upload credit). The scanned garment must be on the
 * rail first. A photo of the finished piece is optional; without one the guide's concept picture is used.
 */
export function MadeThis({ scanId, recipeId }: Props) {
  const [source, setSource] = useState<Source>({ kind: 'loading' });
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const lookup = useCallback(async () => {
    try {
      await ensureSession();
      // RLS: the user's own garments only.
      const { data, error: err } = await browserClient().from('garments')
        .select('id, status').eq('scan_id', scanId).limit(1).maybeSingle();
      if (err) throw err;
      if (!data) return setSource({ kind: 'none' });
      setSource(data.status === 'active' ? { kind: 'active', id: data.id as string } : { kind: 'transformed' });
    } catch (e) {
      console.error('closet lookup failed', e);
      setSource({ kind: 'error' });
    }
  }, [scanId]);

  useEffect(() => { void lookup(); }, [lookup]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (source.kind !== 'active') return;
    const file = new FormData(e.currentTarget).get('photo');
    setError(null);
    let uploaded: string[] = [];
    try {
      let photoPath: string | null = null;
      if (file instanceof File && file.size > 0) {
        const photo = await uploadPhoto(file, setStep);
        uploaded = photo.paths;
        photoPath = photo.cutoutPath;
      }
      setStep('Adding it to your closet');
      const r = await postCloset({ action: 'made_this', sourceGarmentId: source.id, recipeId, photoPath });
      if (r.status !== 200) {
        await removeUploaded(uploaded);
        if (r.json.error === 'not_active') return void (await lookup());
        setError(r.json.error === 'premium_required' ? 'This guide is part of Premium.' : messageForError(r.json.error));
        return;
      }
      // Only the shown image is kept; the full original photo is not needed for a made piece.
      await removeUploaded(uploaded.filter((p) => p !== photoPath));
      setDone(true);
      setOpen(false);
    } catch (err) {
      console.error('made this failed', err);
      await removeUploaded(uploaded);
      setError(err instanceof UnsupportedImageError ? MESSAGES.unsupportedFormat : messageForError(null));
    } finally {
      setStep(null);
    }
  }

  if (done || source.kind === 'transformed') {
    return (
      <p className={c.inline} role="status">
        {done ? 'Wonderful. Your remake is on your rail.' : 'You already remade this piece.'} <Link href="/closet">See your rail →</Link>
      </p>
    );
  }

  if (source.kind === 'none') {
    return (
      <div>
        <p className={c.inline}>To log your remake, add the original piece to your closet first.</p>
        <AddToCloset scanId={scanId} onSaved={() => void lookup()} />
      </div>
    );
  }

  const working = step !== null;
  return (
    <div>
      <button type="button" className={`${ui.button} ${ui.ghost}`} aria-expanded={open}
        disabled={source.kind !== 'active' || working} onClick={() => setOpen((v) => !v)}>
        I made this
      </button>
      {source.kind === 'error' ? <p className={ui.note} role="alert">We couldn&apos;t check your closet. Please refresh the page.</p> : null}
      {open ? (
        <form className={c.form} onSubmit={(e) => void onSubmit(e)} aria-labelledby="made-title">
          <h2 id="made-title" className={c.formTitle}>Log your remake</h2>
          <label className={c.field}>
            Photo of the finished piece (optional)
            <input className={`${c.input} ${c.fileInput}`} name="photo" type="file" disabled={working}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" />
            <span className={c.fieldHint}>No photo? We will show the concept picture. Logging a remake is free.</span>
          </label>
          <div className={c.detailActions}>
            <Button type="submit" loading={working}>Save to closet</Button>
            <button type="button" className={ui.choice} onClick={() => setOpen(false)} disabled={working}>Cancel</button>
          </div>
          {working ? (
            <p className={`${ui.status} ${ui.statusInline}`} role="status" aria-live="polite">
              <span className={ui.pulse} aria-hidden="true" />
              {step}…
            </p>
          ) : null}
          {error ? <p className={ui.note} role="alert">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
