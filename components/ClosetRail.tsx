'use client';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ClosetGarment } from '@/lib/db/closet';
import { humanize } from '@/lib/ui/result';
import c from './closet.module.css';
import s from './result.module.css';

type Props = {
  garments: ClosetGarment[];
  /** Accessible name of the rail. */
  label: string;
  /** 'past' = pieces already given a second life (smaller, read-only-ish). */
  variant?: 'current' | 'past';
  onDelete?: (id: string) => Promise<void>;
};

/**
 * The clothing rail (reference video 2). Hover or keyboard focus lifts a piece; choosing it (click,
 * Enter or Space) brings it forward and blurs the others. Arrow keys move along the rail, Escape lets go.
 */
export function ClosetRail({ garments, label, variant = 'current', onDelete }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const detailId = useId();
  const active = garments.find((g) => g.id === activeId) ?? null;

  function choose(id: string) {
    setConfirming(false);
    setDeleteError(null);
    setActiveId((cur) => (cur === id ? null : id));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const move = (to: number) => {
      e.preventDefault();
      refs.current[(to + garments.length) % garments.length]?.focus();
    };
    if (e.key === 'ArrowRight') move(i + 1);
    else if (e.key === 'ArrowLeft') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(garments.length - 1);
    else if (e.key === 'Escape' && activeId) {
      e.preventDefault();
      setActiveId(null);
      setConfirming(false);
    }
  }

  async function confirmDelete() {
    if (!active || !onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(active.id);
      setActiveId(null);
      setConfirming(false);
    } catch {
      setDeleteError('We could not delete this piece. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={variant === 'past' ? c.past : undefined}>
      <div className={c.railWrap}>
        <div className={c.rod} aria-hidden="true" />
        <ul className={c.rail} aria-label={label} data-focused={active ? 'true' : 'false'}>
          {garments.map((g, i) => (
            <li key={g.id} className={c.slot}>
              <button
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                className={`${c.piece} ${g.id === activeId ? c.active : ''}`}
                aria-pressed={g.id === activeId}
                aria-controls={g.id === activeId ? detailId : undefined}
                aria-label={`${g.name}${g.category === 'accessory' ? ', accessory' : ''}${g.isUpcycled ? ', reworked' : ''}`}
                onClick={() => choose(g.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <Hanger />
                <span className={c.figure}>
                  {g.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                    <img src={g.imageUrl} alt="" loading="lazy" draggable={false} />
                  ) : (
                    <span className={c.placeholder} />
                  )}
                </span>
                {g.isUpcycled ? <span className={c.flag}>Reworked</span> : null}
                {!g.isUpcycled && g.category === 'accessory' ? <span className={c.flag}>Accessory</span> : null}
                <span className={c.pieceName} aria-hidden="true">{g.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {active ? (
        <section id={detailId} className={c.detail} aria-label={`${active.name} details`}>
          <h3 className={c.detailName}>{active.name}</h3>
          <p className={c.meta}>
            {active.category === 'accessory' ? 'Accessory' : 'Clothing'}
            {active.isUpcycled ? ' · made by you' : ''}
            {active.status === 'transformed' ? ' · given a second life' : ''}
          </p>
          {active.imageKind === 'concept' ? (
            <p className={c.meta}>Shown with its AI concept picture, not a photo of the finished piece.</p>
          ) : null}
          {active.tags.length ? (
            <ul className={c.tags} aria-label="Tags">
              {active.tags.map((t) => <li key={t} className={s.tag}>{humanize(t)}</li>)}
            </ul>
          ) : null}

          {onDelete ? (
            confirming ? (
              <div className={c.confirm} role="group" aria-label="Confirm delete">
                <p>Delete {active.name}? Its photos are removed for good. The upload it used is not returned.</p>
                <div className={c.detailActions}>
                  <button type="button" className={`${s.choice} ${c.dangerSolid}`} onClick={() => void confirmDelete()} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button type="button" className={s.choice} onClick={() => setConfirming(false)} disabled={deleting} autoFocus>
                    Keep it
                  </button>
                </div>
                {deleteError ? <p className={s.note} role="alert">{deleteError}</p> : null}
              </div>
            ) : (
              <div className={c.detailActions}>
                <button type="button" className={`${s.choice} ${c.danger}`} onClick={() => setConfirming(true)}>
                  Delete piece
                </button>
              </div>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Hanger() {
  return (
    <svg className={c.hanger} viewBox="0 0 64 34" fill="none" aria-hidden="true">
      <path d="M32 14c0-3 2.6-4.2 2.6-7A2.6 2.6 0 0 0 32 4.4 2.6 2.6 0 0 0 29.4 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M32 14 4 30h56L32 14Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
