'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ui from '@/components/ui.module.css';
import s from '@/components/homeRing.module.css';
import { Badge } from '@/components/Badge';
import { SECOND_LIVES, ringPose, swatchSrc, FABRIC_LABEL, type Fabric } from '@/components/secondLives';

const N = SECOND_LIVES.length;

function Garment({ d, fill, detail }: { d: string; fill: string; detail?: string }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <path d={d} fill={fill} />
      {detail ? <path d={detail} fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="5" /> : null}
    </svg>
  );
}

/** An original AI-made person wearing the second life, seen from above. The button carries the name. */
function Figure({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static WebP; next/image adds nothing here
    <img src={src} alt="" data-figure draggable={false} decoding="async" className={s.figure} />
  );
}

/** A real fabric texture for a piece in the pieces strip. Decorative: the fabric is named in text. */
function Swatch({ fabric }: { fabric: Fabric }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 96px static WebP
    <img src={swatchSrc(fabric)} alt="" data-swatch={fabric} width={40} height={40} className={s.swatch} />
  );
}

/** Front page: nine second lives orbiting a headline. Ring or grid; autoplay stops on any interaction. */
export function HomeRing() {
  const [rot, setRot] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [view, setView] = useState<'ring' | 'grid'>('ring');
  /** A figure under the pointer or keyboard focus: the dock previews it without turning the ring. */
  const [hover, setHover] = useState<number | null>(null);

  // Reduced motion: never autoplay. Stop on mount and whenever the preference turns on.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) setPlaying(false);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setPlaying(false); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!playing || view !== 'ring' || hover !== null) return;
    const id = setInterval(() => setRot((r) => (r + 1) % N), 3500);
    return () => clearInterval(id);
  }, [playing, view, hover]);

  const cur = SECOND_LIVES[hover ?? rot];
  const num = String(rot + 1).padStart(2, '0');
  const preview = (i: number) => ({
    onMouseEnter: () => setHover(i),
    onMouseLeave: () => setHover((h) => (h === i ? null : h)),
    onFocus: () => setHover(i),
    onBlur: () => setHover((h) => (h === i ? null : h)),
  });

  function onKeyDown(e: React.KeyboardEvent) {
    if (view !== 'ring') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setRot((r) => (r + 1) % N); setPlaying(false); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setRot((r) => (r + N - 1) % N); setPlaying(false); }
  }

  return (
    <section className={s.wrap} aria-roledescription="carousel" aria-label="Nine second lives">
      <div className={s.stage} onKeyDown={onKeyDown} tabIndex={0} role="group" aria-label="Nine second lives, use arrow keys">
        <Badge variant="concept" className={s.concept} />
        <div className={`${ui.seg} ${s.toggle}`} role="group" aria-label="View">
          <button type="button" className={ui.choice} aria-pressed={view === 'ring'} onClick={() => setView('ring')}>Ring</button>
          <button type="button" className={ui.choice} aria-pressed={view === 'grid'} onClick={() => { setView('grid'); setPlaying(false); }}>Grid</button>
        </div>

        {view === 'ring' ? (
          <>
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
                  {...preview(i)}
                >
                  <Figure src={l.figure} />
                </button>
              );
            })}
          </>
        ) : (
          <>
            <h1 className={ui.visuallyHidden}>Keep it in the loop</h1>
          <div className={s.grid}>
            {SECOND_LIVES.map((l, i) => (
              <button key={l.name} type="button" className={s.cell} onClick={() => { setRot(i); setView('ring'); setPlaying(false); setHover(null); }} {...preview(i)}>
                <Figure src={l.figure} />
                {l.name}
              </button>
            ))}
          </div>
          </>
        )}
      </div>

      <div className={s.dock}>
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
          <p className={s.name} aria-live={playing || hover !== null ? 'off' : 'polite'}>{cur.name}</p>
          <p className={s.meta}>{cur.recipe} · {cur.time}</p>
        </div>

        <ul className={s.pieces} aria-label={`What ${cur.name} is wearing`}>
          <li className={s.piece}>
            <Swatch fabric={cur.fabric} />
            <div><strong>{cur.name}</strong><span>{FABRIC_LABEL[cur.fabric]} · from {cur.from.toLowerCase()}</span></div>
          </li>
          {cur.pieces.map(([piece, how, fabric]) => (
            <li key={piece} className={s.piece}>
              <Swatch fabric={fabric} />
              <div><strong>{piece}</strong><span>{FABRIC_LABEL[fabric]} · {how.charAt(0).toLowerCase() + how.slice(1)}</span></div>
            </li>
          ))}
        </ul>

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
