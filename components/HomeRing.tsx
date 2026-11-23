'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ui from '@/components/ui.module.css';
import s from '@/components/homeRing.module.css';
import { SECOND_LIVES, ringPose } from '@/components/secondLives';

const N = SECOND_LIVES.length;

function Garment({ d, fill, detail }: { d: string; fill: string; detail?: string }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <path d={d} fill={fill} />
      {detail ? <path d={detail} fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="5" /> : null}
    </svg>
  );
}

/** Front page: nine second lives orbiting a headline. Ring or grid; autoplay stops on any interaction. */
export function HomeRing() {
  const [rot, setRot] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [view, setView] = useState<'ring' | 'grid'>('ring');

  useEffect(() => {
    if (!playing || view !== 'ring') return;
    const id = setInterval(() => {
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) setRot((r) => (r + 1) % N);
    }, 3500);
    return () => clearInterval(id);
  }, [playing, view]);

  const cur = SECOND_LIVES[rot];
  const num = String(rot + 1).padStart(2, '0');

  function onKeyDown(e: React.KeyboardEvent) {
    if (view !== 'ring') return;
    if (e.key === 'ArrowRight') { setRot((r) => (r + 1) % N); setPlaying(false); }
    else if (e.key === 'ArrowLeft') { setRot((r) => (r + N - 1) % N); setPlaying(false); }
  }

  return (
    <section className={s.wrap} aria-roledescription="carousel" aria-label="Nine second lives">
      <div className={s.stage} onKeyDown={onKeyDown}>
        <div className={`${ui.seg} ${s.toggle}`} role="group" aria-label="View">
          <button type="button" className={ui.choice} aria-pressed={view === 'ring'} onClick={() => setView('ring')}>Ring</button>
          <button type="button" className={ui.choice} aria-pressed={view === 'grid'} onClick={() => { setView('grid'); setPlaying(false); }}>Grid</button>
        </div>

        {view === 'ring' ? (
          <>
            <div className={s.ellipse} aria-hidden="true" />
            <div className={s.title}>
              <h1>Keep it in the loop</h1>
              <span className={s.mono}>Vol. 01 — nine second lives</span>
            </div>
            {SECOND_LIVES.map((l, i) => {
              const p = ringPose(i, rot, N);
              return (
                <button
                  key={l.name}
                  type="button"
                  className={s.item}
                  aria-label={`Show ${l.name}`}
                  style={{
                    left: `${p.x.toFixed(2)}%`,
                    top: `${p.y.toFixed(2)}%`,
                    transform: `translate(-50%, -50%) scale(${p.scale.toFixed(3)})`,
                    zIndex: p.z,
                    opacity: Number(p.opacity.toFixed(2)),
                  }}
                  onClick={() => { setRot(i); setPlaying(false); }}
                >
                  <Garment d={l.d} fill={l.fill} detail={l.detail} />
                </button>
              );
            })}
          </>
        ) : (
          <div className={s.grid}>
            {SECOND_LIVES.map((l, i) => (
              <button key={l.name} type="button" className={s.cell} onClick={() => { setRot(i); setView('ring'); setPlaying(false); }}>
                <Garment d={l.d} fill={l.fill} detail={l.detail} />
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={s.dock} aria-live="polite">
        <div>
          <div className={s.count}>
            <span>{num} / 09</span>
            <button type="button" className={s.pause} aria-label={playing ? 'Pause the ring' : 'Play the ring'} onClick={() => setPlaying((p) => !p)}>
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="2" y="1" width="3" height="10" fill="currentColor" />
                  <rect x="7" y="1" width="3" height="10" fill="currentColor" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 1 L11 6 L3 11 Z" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
          <p className={s.name}>{cur.name}</p>
        </div>

        <div className={s.chips}>
          <div className={s.chip}>
            <span className={s.dot} aria-hidden="true"><Garment d={cur.fromD} fill={cur.fromFill} /></span>
            <div><strong>Made from</strong><span>{cur.from}</span></div>
          </div>
          <div className={s.chip}>
            <span className={s.dot} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
              </svg>
            </span>
            <div><strong>Recipe</strong><span>{cur.recipe}</span></div>
          </div>
          <div className={s.chip}>
            <span className={s.dot} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
            </span>
            <div><strong>Time</strong><span>{cur.time}</span></div>
          </div>
        </div>

        <div className={s.cta}>
          <span className={s.mono}>Remake yours</span>
          <Link href="/scan" className={`${ui.button} ${s.round}`} aria-label="Scan a garment to remake it">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
