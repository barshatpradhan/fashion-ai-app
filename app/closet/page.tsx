'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ensureSession } from '@/lib/db/browser';
import { UnsupportedImageError } from '@/lib/image/prepare';
import { MESSAGES, messageForError } from '@/lib/ui/messages';
import { noUploadsMessage, type AllowanceView } from '@/lib/ui/closet';
import { postCloset, removeUploaded, uploadPhoto } from '@/lib/ui/closetClient';
import type { ClosetGarment } from '@/lib/db/closet';
import { ClosetRail } from '@/components/ClosetRail';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import { UpgradeButton } from '@/components/UpgradeButton';
import s from '@/components/result.module.css';
import c from '@/components/closet.module.css';

type Closet = { garments: ClosetGarment[]; allowance: { uploads: AllowanceView; looks: AllowanceView } };
type Load = { kind: 'loading' } | { kind: 'ready'; closet: Closet } | { kind: 'error' };
type Mode = 'quick_add' | 'accessory';

const FORM_COPY: Record<Mode, { title: string; namePlaceholder: string; tagsPlaceholder: string }> = {
  quick_add: { title: 'Quick add a piece', namePlaceholder: 'Blue denim jacket', tagsPlaceholder: 'jacket, denim, relaxed' },
  accessory: { title: 'Add an accessory', namePlaceholder: 'Woven belt', tagsPlaceholder: 'belt, leather' },
};

export default function ClosetPage() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await ensureSession();
    const res = await fetch('/api/closet', { cache: 'no-store' });
    const json = (await res.json().catch(() => ({}))) as Partial<Closet>;
    if (!res.ok || !Array.isArray(json.garments) || !json.allowance) throw new Error('load failed');
    setLoad({ kind: 'ready', closet: json as Closet });
  }, []);

  useEffect(() => {
    refresh().catch((err) => {
      console.error('closet load failed', err);
      setLoad({ kind: 'error' });
    });
  }, [refresh]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mode) return;
    const form = new FormData(e.currentTarget);
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a photo first.');
      return;
    }
    const name = String(form.get('name') ?? '');
    const tags = String(form.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    setError(null);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      const photo = await uploadPhoto(file, setStep);
      uploaded = photo.paths;
      setStep('Hanging it on the rail');
      const r = await postCloset({ action: mode, imagePath: photo.imagePath, cutoutPath: photo.cutoutPath, name, tags });
      if (r.status === 402) {
        await removeUploaded(uploaded);
        setError(noUploadsMessage(r.json.nextCreditAt));
      } else if (r.status !== 200) {
        await removeUploaded(uploaded);
        setError(messageForError(r.json.error));
      } else {
        setMode(null);
        setNotice(mode === 'accessory' ? 'Accessory added to your rail.' : 'Added to your rail.');
        await refresh();
      }
    } catch (err) {
      console.error('closet add failed', err);
      await removeUploaded(uploaded);
      setError(err instanceof UnsupportedImageError ? MESSAGES.unsupportedFormat : messageForError(null));
    } finally {
      setStep(null);
    }
  }

  async function onDelete(id: string) {
    const r = await postCloset({ action: 'delete', garmentId: id });
    if (r.status !== 200) throw new Error(r.json.error ?? 'server_error');
    setNotice('Piece deleted.');
    await refresh();
  }

  const closet = load.kind === 'ready' ? load.closet : null;
  const uploads = closet?.allowance.uploads;
  const outOfUploads = uploads !== undefined && uploads.remaining !== 'unlimited' && uploads.remaining < 1;
  const current = closet?.garments.filter((g) => g.status === 'active') ?? [];
  const past = closet?.garments.filter((g) => g.status === 'transformed') ?? [];
  const working = step !== null;

  const openForm = (m: Mode) => {
    setError(null);
    setNotice(null);
    setMode((cur) => (cur === m ? null : m));
  };

  return (
    <main className={s.page}>
      <p className={s.brand}>Revivo</p>

      <div className={c.header}>
        <div>
          <p className={s.eyebrow}>Closet</p>
          <h1 className={s.title}>Your rail</h1>
        </div>
        {uploads ? <AllowanceBadge allowance={uploads} /> : null}
      </div>

      <div className={c.toolbar}>
        <button type="button" className={`${s.button} ${mode === 'quick_add' ? '' : s.ghost}`} aria-expanded={mode === 'quick_add'}
          onClick={() => openForm('quick_add')} disabled={!closet || working}>
          Quick add
        </button>
        <button type="button" className={`${s.button} ${mode === 'accessory' ? '' : s.ghost}`} aria-expanded={mode === 'accessory'}
          onClick={() => openForm('accessory')} disabled={!closet || working}>
          Add accessory
        </button>
        <Link className={`${s.button} ${s.ghost}`} href="/scan">Scan a garment</Link>
      </div>

      {mode ? (
        outOfUploads ? (
          <p className={s.error} role="alert">{noUploadsMessage(uploads?.nextCreditAt)} <UpgradeButton label="Go Premium · $7.99/month" ghost /></p>
        ) : (
          <form className={c.form} onSubmit={(e) => void onSubmit(e)} aria-labelledby="add-title">
            <h2 id="add-title" className={c.formTitle}>{FORM_COPY[mode].title}</h2>
            <label className={c.field}>
              Photo
              <input className={c.input} name="photo" type="file" required disabled={working}
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" style={{ paddingTop: 10 }} />
              <span className={c.fieldHint}>The piece only, no faces, please. Uses 1 upload.</span>
            </label>
            <label className={c.field}>
              Name (optional)
              <input className={c.input} name="name" type="text" maxLength={60} placeholder={FORM_COPY[mode].namePlaceholder} disabled={working} />
            </label>
            <label className={c.field}>
              Tags (optional)
              <input className={c.input} name="tags" type="text" placeholder={FORM_COPY[mode].tagsPlaceholder} disabled={working} />
              <span className={c.fieldHint}>Separate with commas. We keep words from our garment, fabric and style list.</span>
            </label>
            <div className={c.detailActions}>
              <button type="submit" className={s.button} disabled={working}>Hang it on the rail</button>
              <button type="button" className={s.choice} onClick={() => setMode(null)} disabled={working}>Cancel</button>
            </div>
          </form>
        )
      ) : null}

      {working ? (
        <p className={s.status} role="status" aria-live="polite">
          <span className={s.pulse} aria-hidden="true" />
          {step}…
        </p>
      ) : null}
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      {notice ? <p className={c.inline} role="status">{notice}</p> : null}

      {load.kind === 'loading' ? (
        <p className={s.status} role="status" aria-live="polite">
          <span className={s.pulse} aria-hidden="true" />
          Opening your closet…
        </p>
      ) : null}
      {load.kind === 'error' ? <p className={s.error} role="alert">We couldn&apos;t open your closet. Please refresh the page.</p> : null}

      {closet ? (
        <>
          {current.length ? (
            <ClosetRail garments={current} label="Your pieces" onDelete={onDelete} />
          ) : (
            <p className={`${s.empty} ${c.inline}`} style={{ marginTop: 40 }}>
              Your rail is empty. Scan a garment and choose “Add to closet”, or quick add a piece.
            </p>
          )}

          {past.length ? (
            <section className={s.section} aria-labelledby="past-title">
              <h2 id="past-title" className={s.sectionTitle}>Given a second life</h2>
              <p className={s.hint} style={{ maxWidth: '52ch' }}>The originals of pieces you reworked.</p>
              <ClosetRail garments={past} label="Reworked originals" variant="past" onDelete={onDelete} />
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
