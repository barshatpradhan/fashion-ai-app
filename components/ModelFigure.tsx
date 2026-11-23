'use client';
import { useEffect, useRef, useState } from 'react';
import { dollLayout, resolveDots, separateDots, type Slot } from '@/lib/domain/slots';
import { Badge } from './Badge';
import m from './modelFigure.module.css';

export type FigurePiece = { id: string; slot: Slot; name: string; imageUrl: string | null; concept: boolean };

type Props = {
  pieces: FigurePiece[];
  showDots: boolean;
  activeId?: string | null;
  onDot?: (id: string) => void;
  /** Changing this spins the figure once (the outfit change). */
  spinKey?: string | number;
};

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** A drawn, front-facing model wearing the pieces' cut-outs in their slots. No AI, no face, no skin tone. */
export function ModelFigure({ pieces, showDots, activeId, onDot, spinKey }: Props) {
  const [spin, setSpin] = useState(false);
  const prev = useRef(spinKey);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (prev.current === spinKey) return;
    prev.current = spinKey;
    if (spinKey === undefined) return; // not the front figure
    // Reduced motion: the outfit swaps instantly, no spin.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setSpin(true);
  }, [spinKey]);
  // Native listener: clears the spin when the keyframe ends.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const end = () => setSpin(false);
    el.addEventListener('animationend', end);
    return () => el.removeEventListener('animationend', end);
  }, []);

  const layout = dollLayout(pieces);
  const dots = separateDots(pieces.map((p) => p.id), resolveDots(pieces, null));

  return (
    <div ref={root} className={m.figure} data-spin={spin ? 'true' : undefined}>
      <div className={m.shadow} aria-hidden="true" />
      <svg className={m.model} data-model viewBox="0 0 200 400" aria-hidden="true" focusable="false">
        <ellipse className={m.skin} cx="100" cy="38" rx="21" ry="26" />
        <rect className={m.skin} x="91" y="60" width="18" height="22" rx="6" />
        <path className={m.body} d="M66 84 Q100 74 134 84 L140 200 Q100 212 60 200 Z" />
        <path className={m.limb} d="M66 86 L44 190 L54 194 L74 100 Z" />
        <path className={m.limb} d="M134 86 L156 190 L146 194 L126 100 Z" />
        <path className={m.limb} d="M62 196 L78 372 L96 372 L100 214 Z" />
        <path className={m.limb} d="M138 196 L122 372 L104 372 L100 214 Z" />
      </svg>
      {pieces.map((p) => {
        const b = layout[p.id];
        return (
          <span
            key={p.id}
            className={m.layer}
            data-piece={p.id}
            style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
              <img src={p.imageUrl} alt="" draggable={false} />
            ) : (
              <span className={m.placeholder} />
            )}
            {p.concept ? <Badge variant="concept" className={m.badge} /> : null}
          </span>
        );
      })}
      {showDots
        ? pieces.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={m.dot}
              data-active={activeId === p.id ? 'true' : undefined}
              style={{ left: pct(dots[p.id].x), top: pct(dots[p.id].y) }}
              aria-label={`${i + 1}, ${p.name}`}
              onClick={() => onDot?.(p.id)}
            >
              <span aria-hidden="true">{i + 1}</span>
            </button>
          ))
        : null}
    </div>
  );
}
