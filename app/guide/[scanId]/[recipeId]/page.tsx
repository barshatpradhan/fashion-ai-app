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
import s from '@/components/result.module.css';
import g from '@/components/guide.module.css';

type GuideData = {
  steps: string[]; tools: string[]; history: KbEntry[];
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
      setRenderError(messageForError((err as Error).message));
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
          return setLoad({ kind: 'error', message: messageForError(r.json.error) });
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

  const back = <Link className={g.back} href="/scan">← Back to your scan</Link>;

  if (load.kind === 'locked') {
    return (
      <main className={s.page}>
        <p className={s.brand}>Revivo</p>
        <section className={g.upgrade} aria-labelledby="upgrade-title">
          <p className={s.eyebrow}>Premium</p>
          <h1 id="upgrade-title">This guide is part of Premium</h1>
          <p>Upgrade to open every redesign guide for your garments. Your free guide stays open.</p>
          <button type="button" className={s.button} disabled title="Coming soon">Upgrade</button>
        </section>
        {back}
      </main>
    );
  }

  return (
    <main className={s.page}>
      <p className={s.brand}>Revivo</p>
      {load.kind === 'loading' ? (
        <p className={s.status} role="status" aria-live="polite">
          <span className={s.pulse} aria-hidden="true" />
          Writing your guide…
        </p>
      ) : null}
      {load.kind === 'error' ? <p className={s.error} role="alert">{load.message}</p> : null}

      {load.kind === 'ready' ? (
        <>
          <p className={s.eyebrow}>Your guide</p>
          <h1 className={s.title}>From worn to reworked</h1>

          <section aria-label="Before and after">
            <div className={g.stage}>
              {beforeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                <img src={beforeUrl} alt="Your original garment" className={`${g.layer} ${showAfter ? g.hidden : g.visible}`} />
              ) : null}
              {afterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                <img src={afterUrl} alt="AI concept of the finished garment" className={`${g.layer} ${showAfter ? g.visible : g.hidden}`} />
              ) : null}
              <span className={g.badge}>{showAfter && afterUrl ? 'Concept' : 'Before'}</span>
            </div>
            {afterUrl ? (
              <div className={g.toggle} role="group" aria-label="Before or after">
                <button type="button" className={`${s.choice} ${!showAfter ? s.choicePrimary : ''}`} aria-pressed={!showAfter} onClick={() => setShowAfter(false)}>Before</button>
                <button type="button" className={`${s.choice} ${showAfter ? s.choicePrimary : ''}`} aria-pressed={showAfter} onClick={() => setShowAfter(true)}>Concept</button>
              </div>
            ) : null}
            {renderState === 'working' ? (
              <p className={g.rendering} role="status" aria-live="polite">Sketching the concept…</p>
            ) : null}
            {renderState === 'error' ? (
              <p className={g.rendering} role="alert">
                {renderError}{' '}
                <button type="button" className={s.choice} onClick={() => void renderImage()}>Try again</button>
              </p>
            ) : null}
            {afterUrl ? <p className={g.rendering}>Concept: an AI-generated picture, not a photo of a finished piece.</p> : null}
          </section>

          <section className={s.section} aria-labelledby="steps-title">
            <h2 id="steps-title" className={s.sectionTitle}>Steps</h2>
            <span className={g.label}>AI-generated guidance</span>
            <ol className={g.steps}>
              {load.guide.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </section>

          {load.guide.tools.length ? (
            <section className={s.section} aria-labelledby="tools-title">
              <h2 id="tools-title" className={s.sectionTitle}>Tools</h2>
              <ul className={g.tools}>
                {load.guide.tools.map((t) => <li key={t} className={s.tag}>{t}</li>)}
              </ul>
            </section>
          ) : null}

          {load.guide.history.length ? (
            <section className={s.section} aria-labelledby="sources-title">
              <h2 id="sources-title" className={s.sectionTitle}>Where this comes from</h2>
              <div className={s.grid}>
                {load.guide.history.map((h) => {
                  const sources = (h.sources ?? []).flatMap((src) => {
                    const url = safeUrl(src.url);
                    return url ? [{ ...src, url }] : [];
                  });
                  return (
                    <article key={h.id} className={s.card}>
                      <h3 className={s.cardTitle}>{h.title}</h3>
                      <ul className={s.sources} aria-label="Sources">
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

          <div className={g.actions}>
            <button type="button" className={s.button} aria-expanded={storyOpen} onClick={() => setStoryOpen((v) => !v)}>
              Create Garment Story card
            </button>
          </div>
          <MadeThis scanId={scanId} recipeId={recipeId} />
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
          {back}
        </>
      ) : null}
    </main>
  );
}
