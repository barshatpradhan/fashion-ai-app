'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { browserClient, ensureSession } from '@/lib/db/browser';
import { prepareImage, removeBackground, UnsupportedImageError } from '@/lib/image/prepare';
import { MESSAGES, messageForError } from '@/lib/ui/messages';
import { ResultView, type AnalyzeResponse, type ScanSource } from '@/components/ResultView';
import ui from '@/components/ui.module.css';
import s from '@/components/result.module.css';

const BUCKET = 'garments';

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; step: string }
  | { kind: 'done'; result: AnalyzeResponse; heroSrc: string; isCutout: boolean; source: ScanSource };

class ApiError extends Error {}

export default function ScanPage() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  // Anonymous start: no sign-up wall. Premium access is decided server-side (locked Recipes arrive redacted).
  useEffect(() => {
    ensureSession().catch((err) => console.warn('session start failed', err));
  }, []);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function setHero(blob: Blob): string {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob);
    return objectUrl.current;
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setError(null);
    try {
      setPhase({ kind: 'working', step: 'Preparing your photo' });
      const userId = await ensureSession();
      const prepared = await prepareImage(file);

      setPhase({ kind: 'working', step: 'Lifting the garment from the background' });
      const cutout = await removeBackground(prepared.jpeg);

      setPhase({ kind: 'working', step: 'Uploading' });
      const storage = browserClient().storage.from(BUCKET);
      const id = crypto.randomUUID();
      const imagePath = `${userId}/${id}.jpg`;
      const up = await storage.upload(imagePath, prepared.jpeg, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw new ApiError('image_not_found');
      // Without a cut-out the original stands in, so no second upload is needed.
      let cutoutPath = imagePath;
      if (cutout) {
        const p = `${userId}/${id}-cutout.png`;
        const upCut = await storage.upload(p, cutout, { contentType: 'image/png', upsert: false });
        if (!upCut.error) cutoutPath = p;
      }

      setPhase({ kind: 'working', step: 'Reading the garment' });
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imagePath, cutoutPath, imageHash: prepared.hash }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<AnalyzeResponse> & { error?: string };
      if (!res.ok || !json.scanId || !json.vision || !json.match) throw new ApiError(json.error ?? 'server_error');

      const usedCutout = cutoutPath !== imagePath && cutout !== null;
      const heroSrc = setHero(usedCutout ? cutout : prepared.jpeg);
      setPhase({ kind: 'done', result: json as AnalyzeResponse, heroSrc, isCutout: usedCutout, source: { imagePath, cutoutPath, imageHash: prepared.hash } });
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error('scan failed', err);
      setError(
        err instanceof UnsupportedImageError
          ? MESSAGES.unsupportedFormat
          : messageForError(err instanceof ApiError ? err.message : null),
      );
      setPhase({ kind: 'idle' });
    }
  }

  const working = phase.kind === 'working';

  const upload = (label: string, ghost = false) => (
    <div className={`${ui.imgSlot} ${s.dropzone}`}>
      <div className={s.upload}>
      <input
        id="garment-photo"
        className={s.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={onFile}
        disabled={working}
      />
      <label htmlFor="garment-photo" className={`${ui.button} ${s.uploadLabel} ${ghost ? ui.ghost : ''}`} aria-disabled={working}>
        {label}
      </label>
      <p className={ui.hint}>Photograph the garment only, no faces, please.</p>
      </div>
    </div>
  );

  return (
    <main className={ui.page}>
      {phase.kind === 'done' ? (
        <>
          <ResultView
            key={phase.result.scanId}
            result={phase.result}
            heroSrc={phase.heroSrc}
            isCutout={phase.isCutout}
            source={phase.source}
          />
          <div className={s.again}>{upload('Scan another garment', true)}</div>
        </>
      ) : (
        <section className={ui.cols} aria-labelledby="scan-title">
          <div className={ui.colSide}>
            <div className={ui.head}>
              <p className={ui.eyebrow}>Scan</p>
              <h1 id="scan-title" className={ui.title}>Every garment has a second life.</h1>
              <p className={ui.lede}>
                Lay the piece flat or hang it in good light. We will read its fabric, its story and what it could become.
              </p>
            </div>
          </div>
          <div className={ui.colWide}>{upload('Upload a photo')}</div>
        </section>
      )}

      {working ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          {phase.step}…
        </p>
      ) : null}
      {error ? (
        <p className={ui.error} role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
