'use client';
import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { humanize } from '@/lib/ui/result';
import c from '@/components/story.module.css';

/** How long the download's Blob URL stays alive after click() (iOS Safari reads it asynchronously). */
const REVOKE_DELAY_MS = 30_000;

export type StorySource = { citation: string; url: string };
export type StoryCardData = {
  scanId: string;
  garmentType: string;
  fabric: string;
  recipeTitle: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  history: { title: string; sources?: StorySource[] }[];
  isConcept: boolean;
  imageUrl: string | null;
};

export function StoryCard(d: StoryCardData) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const citations = d.history.flatMap((h) => (h.sources ?? []).map((s) => s.citation));
  const hasHistory = d.history.length > 0 && citations.length > 0;

  async function download() {
    if (!ref.current) return;
    setBusy(true);
    setError(null);
    let url: string | null = null;
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#fbfaf7', cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revivo-story-${d.scanId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('story card failed', err);
      setError("Couldn't create the image. Please try again.");
    } finally {
      // Deferred: iOS Safari reads the Blob after click() returns, so revoking at once breaks the download.
      if (url) {
        const toRevoke = url;
        setTimeout(() => URL.revokeObjectURL(toRevoke), REVOKE_DELAY_MS);
      }
      setBusy(false);
    }
  }

  return (
    <div className={c.wrap}>
      <div ref={ref} className={c.card}>
        <p className={c.brand}>REVIVO</p>
        <p className={c.sub}>Garment Story</p>
        <hr className={c.rule} />
        {d.imageUrl ? (
          <div className={c.imageBox}>
            {/* eslint-disable-next-line @next/next/no-img-element -- captured to PNG; signed URL */}
            <img src={d.imageUrl} alt="" crossOrigin="anonymous" className={c.image} />
            {d.isConcept ? <span className={c.badge}>Concept</span> : null}
          </div>
        ) : null}
        <dl className={c.rows}>
          <div><dt>Garment</dt><dd>{humanize(d.garmentType)}</dd></div>
          <div><dt>Fabric</dt><dd>{humanize(d.fabric)}</dd></div>
          <div><dt>Redesign{d.difficulty ? ` · ${d.difficulty}` : ''}</dt><dd>{d.recipeTitle}</dd></div>
        </dl>
        <hr className={c.rule} />
        <p className={c.heading}>Story</p>
        {hasHistory ? (
          <ul className={c.story}>
            {d.history.filter((h) => (h.sources ?? []).length).map((h) => (
              <li key={h.title}>
                <span>{h.title}</span>
                {(h.sources ?? []).map((s) => <span key={s.citation} className={c.source}>Source: {s.citation}</span>)}
              </li>
            ))}
          </ul>
        ) : (
          <p className={c.empty}>No verified history for this piece yet.</p>
        )}
        <hr className={c.rule} />
        <p className={c.footer}>Reworked, not replaced. Thank you.</p>
      </div>
      <button type="button" className={c.download} onClick={() => void download()} disabled={busy}>
        {busy ? 'Creating…' : 'Download'}
      </button>
      {error ? <p className={c.error} role="alert">{error}</p> : null}
    </div>
  );
}
