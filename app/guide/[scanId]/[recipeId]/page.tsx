'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { browserClient, ensureSession } from '@/lib/db/browser';
import { messageForError } from '@/lib/ui/messages';
import { safeUrl } from '@/lib/ui/result';
import { StoryCard } from '@/components/StoryCard';
import { MadeThis } from '@/components/MadeThis';
import type { KbEntry } from '@/lib/domain/types';
import { UpgradeButton } from '@/components/UpgradeButton';
import { Badge } from '@/components/Badge';
import ui from '@/components/ui.module.css';
import g from '@/components/guide.module.css';

type GuideData = {
  steps: string[]; tools: string[];
  /** Every verified History Entry matched to the garment; historyRefs marks the ones the guide drew on. */
  history: KbEntry[]; historyRefs?: string[];
  story?: { garmentType: string; fabric: string; recipeTitle: string; difficulty: KbEntry['difficulty'] | null };
};
type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; guide: GuideData }
  | { kind: 'locked' }
  | { kind: 'error'; message: string };

async function post<T>(url: string, body: unknown): Promise<{ status: number; json: T & { error?: string } }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T & { error?: string } };
}

export default function GuidePage() {
  const { scanId, recipeId } = useParams<{ scanId: string; recipeId: string }>();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<'idle' | 'working' | 'error'>('idle');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showAfter, setShowAfter] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);

  const renderImage = useCallback(async () => {
    setRenderState('working');
    setRenderError(null);
    try {
      const r = await post<{ imageUrl?: string }>('/api/render', { scanId, recipeId });
      if (r.status !== 200 || !r.json.imageUrl) throw new Error(r.json.error ?? 'server_error');
      setAfterUrl(r.json.imageUrl);
      setRenderState('idle');
      setShowAfter(true);
    } catch (err) {
      setRenderError(messageForError((err as Error).message, 'guide'));
      setRenderState('error');
    }
  }, [scanId, recipeId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureSession();
        const r = await post<GuideData>('/api/guide', { scanId, recipeId });
        if (!alive) return;
        if (r.status === 402) return setLoad({ kind: 'locked' });
        if (r.status !== 200 || !Array.isArray(r.json.steps)) {
          return setLoad({ kind: 'error', message: messageForError(r.json.error, 'guide') });
        }
        setLoad({ kind: 'ready', guide: r.json });
        // Before image: the scan's cut-out (RLS: own scans and own storage folder only).
        const sb = browserClient();
        const { data: scan } = await sb.from('scans').select('cutout_path').eq('id', scanId).maybeSingle();
        if (scan?.cutout_path) {
          const { data } = await sb.storage.from('garments').createSignedUrl(scan.cutout_path as string, 600);
          if (alive && data?.signedUrl) setBeforeUrl(data.signedUrl);
        }
        if (alive) void renderImage();
      } catch (err) {
        console.error('guide failed', err);
        if (alive) setLoad({ kind: 'error', message: messageForError(null) });
      }
    })();
    return () => { alive = false; };
  }, [scanId, recipeId, renderImage]);

  const conceptShown = Boolean(showAfter && afterUrl);
  const back = <Link className={g.backLink} href="/scan">← Back to your scan</Link>;

  if (load.kind === 'locked') {
    return (
      <main className={ui.page}>
        {back}
        <section className={g.upgrade} aria-labelledby="upgrade-title">
          <p className={ui.eyebrow}>Premium</p>
          <h1 id="upgrade-title">This guide is part of Premium</h1>
          <p>Upgrade to open every redesign guide for your garments. Your free guide stays open.</p>
          <UpgradeButton label="Upgrade · $7.99/month" />
        </section>
      </main>
    );
  }

  return (
    <main className={ui.page}>
      {load.kind === 'loading' ? (
        <p className={ui.status} role="status" aria-live="polite">
          <span className={ui.pulse} aria-hidden="true" />
          Writing your guide…
        </p>
      ) : null}
      {load.kind === 'error' ? (
        <>
          {back}
          <p className={ui.error} role="alert">{load.message}</p>
        </>
      ) : null}

      {load.kind === 'ready' ? (
        <>
          {back}
          <div className={ui.head}>
            <p className={ui.eyebrow}>Your guide</p>
            <h1 className={ui.title}>From worn to reworked</h1>
          </div>

          <div className={ui.cols}>
            <div className={ui.colWide}>
          <section aria-label="Before and after" className={ui.col}>
            <div className={g.stage}>
              <div className={`${g.flip} ${conceptShown ? g.flipped : ''}`}>
                <div className={g.face} aria-hidden={conceptShown || undefined} inert={conceptShown || undefined}>
                  {beforeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                    <img src={beforeUrl} alt="Your original garment" className={g.layer} />
                  ) : null}
                  <Badge variant="neutral" className={g.stageBadge}>Before</Badge>
                </div>
                {afterUrl ? (
                  <div className={`${g.face} ${g.back}`} aria-hidden={!conceptShown || undefined} inert={!conceptShown || undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
                    <img src={afterUrl} alt="AI concept of the finished garment" className={g.layer} />
                    <Badge variant="concept" className={g.stageBadge} />
                  </div>
                ) : null}
              </div>
            </div>
            {afterUrl ? (
              <div className={`${ui.seg} ${g.toggle}`} role="group" aria-label="Before or after">
                <button type="button" className={`${ui.choice} ${!showAfter ? ui.choicePrimary : ''}`} aria-pressed={!showAfter} onClick={() => setShowAfter(false)}>Before</button>
                <button type="button" className={`${ui.choice} ${showAfter ? ui.choicePrimary : ''}`} aria-pressed={showAfter} onClick={() => setShowAfter(true)}>Concept</button>
              </div>
            ) : null}
            {renderState === 'working' ? (
              <p className={g.rendering} role="status" aria-live="polite">Sketching the concept…</p>
            ) : null}
            {renderState === 'error' ? (
              <p className={g.rendering} role="alert">
                {renderError}{' '}
                <button type="button" className={ui.choice} onClick={() => void renderImage()}>Try again</button>
              </p>
            ) : null}
            {afterUrl ? <p className={g.rendering}>Concept: an AI-generated picture, not a photo of a finished piece.</p> : null}
          </section>


          <div className={g.actions}>
            <button type="button" className={ui.button} aria-expanded={storyOpen} onClick={() => setStoryOpen((v) => !v)}>
              Create Garment Story card
            </button>
          </div>
          {storyOpen ? (
            <StoryCard
              scanId={scanId}
              garmentType={load.guide.story?.garmentType ?? 'garment'}
              fabric={load.guide.story?.fabric ?? 'unknown'}
              recipeTitle={load.guide.story?.recipeTitle ?? 'Redesign'}
              difficulty={load.guide.story?.difficulty ?? null}
              history={load.guide.history.map((h) => ({ title: h.title, sources: h.sources }))}
              isConcept={Boolean(afterUrl && showAfter)}
              imageUrl={showAfter && afterUrl ? afterUrl : beforeUrl}
            />
          ) : null}
            </div>
            <div className={ui.colSide}>
          <section className={ui.section} aria-labelledby="steps-title">
            <h2 id="steps-title" className={ui.sectionTitle}>Steps</h2>
            <span className={g.label}>AI-generated guidance</span>
            <ol className={g.steps}>
              {load.guide.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </section>

          {load.guide.tools.length ? (
            <section className={ui.section} aria-labelledby="tools-title">
              <h2 id="tools-title" className={ui.sectionTitle}>Tools</h2>
              <ul className={g.tools}>
                {load.guide.tools.map((t) => <li key={t} className={ui.chip}>{t}</li>)}
              </ul>
            </section>
          ) : null}

          {load.guide.history.length ? (
            <section className={ui.section} aria-labelledby="sources-title">
              <h2 id="sources-title" className={ui.sectionTitle}>Where this comes from</h2>
              <div className={ui.grid}>
                {load.guide.history.map((h) => {
                  const sources = (h.sources ?? []).flatMap((src) => {
                    const url = safeUrl(src.url);
                    return url ? [{ ...src, url }] : [];
                  });
                  return (
                    <article key={h.id} className={ui.card}>
                      <h3 className={ui.cardTitle}>{h.title}</h3>
                      {load.guide.historyRefs?.includes(h.id) ? <span className={ui.chip}>Used in your guide</span> : null}
                      <ul className={ui.sources} aria-label="Sources">
                        {sources.map((src) => (
                          <li key={src.url}>
                            Source: <a href={src.url} target="_blank" rel="noopener noreferrer">{src.citation}</a>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <MadeThis scanId={scanId} recipeId={recipeId} />
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
