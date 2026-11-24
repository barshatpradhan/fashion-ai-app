'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ensureSession } from '@/lib/db/browser';
import { UnsupportedImageError } from '@/lib/image/prepare';
import { MESSAGES, messageForError } from '@/lib/ui/messages';
import { filterGarments, noUploadsMessage, type AllowanceView, type ClosetFilter } from '@/lib/ui/closet';
import { cutOutSavedPhoto, postCloset, removeUploaded, uploadPhoto } from '@/lib/ui/closetClient';
import type { ClosetGarment } from '@/lib/db/closet';
import { ClosetRail } from '@/components/ClosetRail';
import { AllowanceBadge } from '@/components/AllowanceBadge';
import { UpgradeButton } from '@/components/UpgradeButton';
import { Button } from '@/components/Button';
import ui from '@/components/ui.module.css';
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
  const [filter, setFilter] = useState<ClosetFilter>('all');
  /** Photo-only pieces being cut out now (ids), so each is tried once per visit. */
  const [cutting, setCutting] = useState<number>(0);
  const tried = useRef(new Set<string>());

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

  // Pieces saved as a plain photo get cut out and cropped to the cloth, one at a time, in the background.
  const garmentsNow = load.kind === 'ready' ? load.closet.garments : null;
  useEffect(() => {
    if (!garmentsNow) return;
    const todo = garmentsNow.filter((g) => g.needsCutout && g.imageUrl && !tried.current.has(g.id)).slice(0, 6);
    if (!todo.length) return;
    todo.forEach((g) => tried.current.add(g.id));
    let live = true;
    setCutting(todo.length);
    void (async () => {
      for (const g of todo) {
        const url = await cutOutSavedPhoto(g.id, g.imageUrl as string);
        if (!live) return;
        setCutting((n) => Math.max(0, n - 1));
        if (url) {
          setLoad((l) => l.kind !== 'ready' ? l : {
            kind: 'ready',
            closet: { ...l.closet, garments: l.closet.garments.map((x) => (x.id === g.id ? { ...x, imageUrl: url, needsCutout: false } : x)) },
          });
        }
      }
    })();
    return () => { live = false; };
  }, [garmentsNow]);

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
  const shown = filterGarments(current, filter);
  const working = step !== null;

  const openForm = (m: Mode) => {
    setError(null);
    setNotice(null);
    setMode((cur) => (cur === m ? null : m));
  };

  const FILTERS: { value: ClosetFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'accessory', label: 'Accessories' },
  ];

  return (
    <main className={ui.page}>
      <div className={ui.headRow}>
        <div className={ui.head}>
          <p className={ui.eyebrow}>Closet</p>
          <h1 className={ui.title}>Your rail</h1>
        </div>
        <div className={c.headTools}>
          {closet ? (
            <div className={ui.seg} role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" className={ui.choice} aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
          {uploads ? <AllowanceBadge allowance={uploads} /> : null}
        </div>
      </div>

      <div className={c.tools}>
      <div className={c.toolbar}>
        <button type="button" className={`${ui.button} ${mode === 'quick_add' ? '' : ui.ghost}`} aria-expanded={mode === 'quick_add'}
          onClick={() => openForm('quick_add')} disabled={!closet || working}>
          Quick add
        </button>
        <button type="button" className={`${ui.button} ${mode === 'accessory' ? '' : ui.ghost}`} aria-expanded={mode === 'accessory'}
          onClick={() => openForm('accessory')} disabled={!closet || working}>
          Add accessory
        </button>
        <Link className={`${ui.button} ${ui.ghost}`} href="/scan">Scan a garment</Link>
      </div>

      {mode ? (
        outOfUploads ? (
          <p className={ui.error} role="alert">{noUploadsMessage(uploads?.nextCreditAt)} <UpgradeButton label="Go Premium · $7.99/month" ghost /></p>
        ) : (
          <form className={c.form} onSubmit={(e) => void onSubmit(e)} aria-labelledby="add-title">
            <h2 id="add-title" className={c.formTitle}>{FORM_COPY[mode].title}</h2>
            <label className={c.field}>
              Photo
              <input className={`${c.input} ${c.fileInput}`} name="photo" type="file" required disabled={working}
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" />
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
              <Button type="submit" loading={working}>Hang it on the rail</Button>
              <button type="button" className={ui.choice} onClick={() => setMode(null)} disabled={working}>Cancel</button>
            </div>
          </form>
        )
      ) : null}

      {working ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          {step}…
        </p>
      ) : null}
      {error ? <p className={ui.error} role="alert">{error}</p> : null}
      {notice ? <p className={c.inline} role="status">{notice}</p> : null}
      {cutting ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          Cutting {cutting === 1 ? 'one photo' : `${cutting} photos`} out of their backgrounds…
        </p>
      ) : null}
      </div>

      {load.kind === 'loading' ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          Opening your closet…
        </p>
      ) : null}
      {load.kind === 'error' ? <p className={ui.error} role="alert">We couldn&apos;t open your closet. Please refresh the page.</p> : null}

      {closet ? (
        <>
          <div>
            {current.length ? (
              shown.length ? (
                <ClosetRail garments={shown} label="Your pieces" onDelete={onDelete} />
              ) : (
                <p className={c.inline}>Nothing here yet. Try another filter.</p>
              )
            ) : (
              <p className={`${ui.empty} ${c.inline} ${c.emptyRail}`}>
                Your rail is empty. Scan a garment and choose “Add to closet”, or quick add a piece.
              </p>
            )}
          </div>

          {past.length ? (
            <section className={ui.section} aria-labelledby="past-title">
              <h2 id="past-title" className={ui.sectionTitle}>Given a second life</h2>
              <p className={`${ui.hint} ${ui.hintWide}`}>The originals of pieces you reworked.</p>
              <ClosetRail garments={past} label="Reworked originals" variant="past" onDelete={onDelete} />
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
