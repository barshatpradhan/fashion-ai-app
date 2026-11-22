'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ClosetGarment } from '@/lib/db/closet';
import type { Look } from '@/lib/domain/types';
import { depthOf, poseOf, stepSpring, wrap } from '@/lib/depth/engine';
import c from './looks.module.css';
import k from './closet.module.css';
import s from './result.module.css';

type Props = {
  looks: Look[];
  /** The user's pieces by id (for names and cut-outs). */
  garments: Record<string, ClosetGarment>;
  /** Saves a Look; rejects on failure. */
  onSave: (look: Look) => Promise<void>;
};

const lookKey = (l: Look) => `${l.name}|${l.garmentIds.join(',')}`;

/**
 * Three Looks standing in depth like a runway (phone "classic" line, spec §7.3 / ref §7.5). Drag sets the
 * target directly, release snaps to a whole Look, arrow keys move by one. Reduced motion jumps. Each frame
 * writes only transform, filter and opacity (plus the stacking order).
 */
export function LooksCarousel({ looks, garments, onSave }: Props) {
  const n = looks.length;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const motion = useRef({ cur: 0, vel: 0, target: 0, raf: 0, last: 0, width: 360, reduced: false });
  const drag = useRef<{ id: number; x: number; from: number } | null>(null);
  const [front, setFront] = useState(0);
  const [saved, setSaved] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const listId = useId();

  const paint = useCallback(() => {
    const m = motion.current;
    for (let i = 0; i < n; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const pose = poseOf(depthOf(i, m.cur, n), n, m.width);
      el.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${(-pose.bottom).toFixed(2)}px, 0) translateX(-50%) scale(${pose.scale.toFixed(4)})`;
      el.style.filter = pose.blur > 0.05 ? `blur(${pose.blur.toFixed(2)}px)` : 'none';
      el.style.opacity = pose.opacity.toFixed(3);
      el.style.zIndex = String(pose.z);
    }
  }, [n]);

  const tick = useCallback((t: number) => {
    const m = motion.current;
    const dt = m.last ? Math.min(0.05, (t - m.last) / 1000) : 1 / 60;
    m.last = t;
    const next = stepSpring(m.cur, m.vel, m.target, dt);
    m.cur = next.cur;
    m.vel = next.vel;
    paint();
    if (m.cur === m.target && m.vel === 0) {
      m.raf = 0;
      m.last = 0;
      return;
    }
    m.raf = requestAnimationFrame(tick);
  }, [paint]);

  const setTarget = useCallback((target: number) => {
    const m = motion.current;
    m.target = target;
    setFront(wrap(Math.round(target), Math.max(n, 1)));
    if (m.reduced) {
      m.cur = target;
      m.vel = 0;
      paint();
      return;
    }
    if (!m.raf) m.raf = requestAnimationFrame(tick);
  }, [n, paint, tick]);

  // New Looks: start again at the first, in place.
  useLayoutEffect(() => {
    const m = motion.current;
    if (m.raf) cancelAnimationFrame(m.raf);
    Object.assign(m, { cur: 0, vel: 0, target: 0, raf: 0, last: 0 });
    setFront(0);
    setSaved({});
    paint();
  }, [looks, paint]);

  useEffect(() => {
    const m = motion.current;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => { m.reduced = mq.matches; };
    onMq();
    mq.addEventListener('change', onMq);
    const stage = stageRef.current;
    const ro = stage ? new ResizeObserver(() => { m.width = stage.clientWidth || 360; paint(); }) : null;
    if (stage) {
      m.width = stage.clientWidth || 360;
      ro?.observe(stage);
    }
    paint();
    return () => {
      mq.removeEventListener('change', onMq);
      ro?.disconnect();
      if (m.raf) cancelAnimationFrame(m.raf);
      m.raf = 0;
    };
  }, [paint]);

  /** Pixels per Look while dragging (ref §7.5: max(90, W · 0.32 · 1.6)). */
  const unit = () => Math.max(90, motion.current.width * 0.32 * 1.6);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (n < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x: e.clientX, from: motion.current.target };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setTarget(d.from - (e.clientX - d.x) / unit());
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setTarget(Math.round(motion.current.target));
  }
  const step = (by: number) => setTarget(Math.round(motion.current.target) + by);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (n < 2) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    }
  }

  async function save(look: Look) {
    const key = lookKey(look);
    setSaved((cur) => ({ ...cur, [key]: 'saving' }));
    try {
      await onSave(look);
      setSaved((cur) => ({ ...cur, [key]: 'saved' }));
    } catch {
      setSaved((cur) => ({ ...cur, [key]: 'error' }));
    }
  }

  if (!n) return null;
  const current = looks[Math.min(front, n - 1)];
  const state = saved[lookKey(current)];

  return (
    <section className={c.wrap} aria-roledescription="carousel" aria-label="Your looks">
      <div
        ref={stageRef}
        className={c.stage}
        tabIndex={0}
        role="group"
        aria-label={`Look ${front + 1} of ${n}. Use the arrow keys or drag to see the others.`}
        aria-describedby={listId}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className={c.floor} aria-hidden="true" />
        {looks.map((look, i) => (
          <div key={lookKey(look)} ref={(el) => { itemRefs.current[i] = el; }} className={c.body} aria-hidden="true">
            {look.garmentIds.map((id) => {
              const g = garments[id];
              return (
                <span key={id} className={c.layer}>
                  {g?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                    <img src={g.imageUrl} alt="" draggable={false} />
                  ) : (
                    <span className={c.ghost} />
                  )}
                  {g?.imageKind === 'concept' ? <span className={`${k.flag} ${k.flagConcept} ${c.layerFlag}`}>Concept</span> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className={c.controls}>
        <button type="button" className={s.choice} onClick={() => step(-1)} disabled={n < 2} aria-label="Previous look">‹</button>
        <span className={c.count} aria-live="polite">{front + 1} / {n}</span>
        <button type="button" className={s.choice} onClick={() => step(1)} disabled={n < 2} aria-label="Next look">›</button>
      </div>

      <div id={listId} className={c.detail}>
        <div className={c.detailHead}>
          <div>
            <h2 className={c.lookName}>{current.name}</h2>
            {current.reason ? <p className={c.reason}>{current.reason}</p> : null}
          </div>
          <button
            type="button"
            className={`${c.heart} ${state === 'saved' ? c.heartOn : ''}`}
            aria-pressed={state === 'saved'}
            onClick={() => void save(current)}
            disabled={state === 'saving' || state === 'saved'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"
                fill={state === 'saved' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : 'Save look'}
          </button>
        </div>
        {state === 'error' ? <p className={s.note} role="alert">We couldn&apos;t save this look. Please try again.</p> : null}
        <ol className={c.pieces} aria-label={`Pieces in ${current.name}`}>
          {current.garmentIds.map((id, i) => {
            const g = garments[id];
            return (
              <li key={id} className={c.piece}>
                <span className={c.num} aria-hidden="true">{i + 1}</span>
                <span className={c.thumb}>
                  {g?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                    <img src={g.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className={c.ghost} />
                  )}
                </span>
                <span className={c.pieceText}>
                  <span>{g?.name ?? 'A piece from your closet'}</span>
                  <span className={c.pieceFlags}>
                    {g?.imageKind === 'concept' ? <span className={`${k.flag} ${k.flagConcept} ${k.flagInline}`}>Concept</span> : null}
                    {g?.isUpcycled ? <span className={`${k.flag} ${k.flagInline}`}>Reworked</span> : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
