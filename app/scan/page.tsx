'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserClient, ensureSession } from '@/lib/db/browser';
import { prepareImage, removeBackground, preloadBackgroundRemoval, UnsupportedImageError, TooLargeImageError } from '@/lib/image/prepare';
import { MESSAGES, messageForError, isExpectedOutcome } from '@/lib/ui/messages';
import { ResultView, type AnalyzeResponse, type ScanSource } from '@/components/ResultView';
import { ScanCapture } from '@/components/ScanCapture';
import { loadRecentScans, supabaseRecentScans, type RecentScan } from '@/lib/ui/recentScans';
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
  const [preview, setPreview] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const objectUrl = useRef<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  const refreshRecent = useCallback(async () => {
    try {
      await ensureSession();
      setRecent(await loadRecentScans(supabaseRecentScans(browserClient()), 5));
    } catch {
      setRecent([]);
    }
  }, []);

  // Anonymous start: no sign-up wall. Premium access is decided server-side (locked Recipes arrive redacted).
  useEffect(() => {
    ensureSession().catch((err) => console.warn('session start failed', err));
  }, []);

  // Fetch the background-removal model while the user picks a photo (skipped when the browser asks to save data).
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!conn?.saveData) void preloadBackgroundRemoval();
  }, []);

  useEffect(() => {
    if (phase.kind === 'idle') void refreshRecent();
  }, [phase.kind, refreshRecent]);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function showPreview(blob: Blob | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = blob ? URL.createObjectURL(blob) : null;
    setPreview(previewUrl.current);
  }

  function fail(err: unknown) {
    const expected =
      err instanceof UnsupportedImageError || err instanceof TooLargeImageError ||
      (err instanceof ApiError && isExpectedOutcome(err.message));
    (expected ? console.warn : console.error)('scan failed', err);
    setError(
      err instanceof UnsupportedImageError
        ? MESSAGES.unsupportedFormat
        : err instanceof TooLargeImageError
          ? MESSAGES.photoTooLarge
          : messageForError(err instanceof ApiError ? err.message : null),
    );
    showPreview(null);
    setPhase({ kind: 'idle' });
  }

  async function analyze(source: ScanSource): Promise<AnalyzeResponse> {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(source),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<AnalyzeResponse> & { error?: string };
    if (!res.ok || !json.scanId || !json.vision || !json.match) throw new ApiError(json.error ?? 'server_error');
    return json as AnalyzeResponse;
  }

  /** A recent scan answers from the server's hash cache: no AI call and no daily-cap spend. */
  async function onOpenRecent(r: RecentScan) {
    setError(null);
    showPreview(null);
    setPreview(r.thumb);
    try {
      setPhase({ kind: 'working', step: 'Opening your scan' });
      const result = await analyze(r.source);
      setPhase({ kind: 'done', result, heroSrc: r.thumb, isCutout: r.isCutout, source: r.source });
      setPreview(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      fail(err);
    }
  }

  function setHero(blob: Blob): string {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob);
    return objectUrl.current;
  }

  async function onFile(file: File) {
    setError(null);
    try {
      setPhase({ kind: 'working', step: 'Preparing your photo' });
      const userId = await ensureSession();
      const prepared = await prepareImage(file);
      showPreview(prepared.jpeg);

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
      const source = { imagePath, cutoutPath, imageHash: prepared.hash };
      const result = await analyze(source);

      const usedCutout = cutoutPath !== imagePath && cutout !== null;
      const heroSrc = setHero(usedCutout ? cutout : prepared.jpeg);
      setPhase({ kind: 'done', result, heroSrc, isCutout: usedCutout, source });
      showPreview(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      fail(err);
    }
  }

  const working = phase.kind === 'working';

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
          <div className={s.again}>
            <button type="button" className={`${ui.button} ${ui.ghost}`} onClick={() => { setPhase({ kind: 'idle' }); window.scrollTo({ top: 0 }); }}>
              Scan another garment
            </button>
          </div>
        </>
      ) : (
        <section className={ui.cols} aria-labelledby="scan-title">
          <div className={ui.colSide}>
            <div className={ui.head}>
              <p className={ui.eyebrow}>Scan</p>
              <h1 id="scan-title" className={ui.title}>Scan a garment</h1>
              <p className={ui.lede}>
                Take a photo or upload one. We read its fabric and its story, then show what it could become.
              </p>
            </div>
          </div>
          <div className={ui.colWide}>
            <ScanCapture
              working={working}
              step={phase.kind === 'working' ? phase.step : null}
              preview={preview}
              recent={recent}
              onFile={onFile}
              onOpenRecent={onOpenRecent}
            />
          </div>
        </section>
      )}

      {error ? (
        <p className={ui.error} role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
