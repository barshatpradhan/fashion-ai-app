'use client';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ClosetGarment } from '@/lib/db/closet';
import { humanize } from '@/lib/ui/result';
import { Badge } from './Badge';
import { ClothImage } from './ClothImage';
import ui from './ui.module.css';
import c from './closet.module.css';

type Props = {
  garments: ClosetGarment[];
  /** Accessible name of the rail. */
  label: string;
  /** 'past' = pieces already given a second life (smaller, read-only-ish). */
  variant?: 'current' | 'past';
  onDelete?: (id: string) => Promise<void>;
};

/**
 * The clothing rail (reference videos 2 and 3). Pieces hang side-on along a full-width rod; hover or
 * keyboard focus turns one to face you and names it under the rail. Choosing it (click, Enter or Space)
 * blurs the rail and opens the piece large beside its details. Arrow keys move along, Escape or Close lets go.
 */
export function ClosetRail({ garments, label, variant = 'current', onDelete }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const detailId = useId();
  const active = garments.find((g) => g.id === activeId) ?? null;
  const activeIndex = active ? garments.indexOf(active) : -1;
  const hovered = garments.find((g) => g.id === hoverId) ?? null;
  const pad = (n: number) => String(n).padStart(2, '0');

  function close() {
    const i = activeIndex;
    setActiveId(null);
    setConfirming(false);
    if (i >= 0) refs.current[i]?.focus();
  }

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
    <div className={`${c.stage} ${variant === 'past' ? c.past : ''}`} data-open={active ? 'true' : undefined}>
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
                aria-label={`${g.name}${g.category === 'accessory' ? ', accessory' : ''}${g.isUpcycled ? ', reworked' : ''}${g.imageKind === 'concept' ? ', concept image' : ''}`}
                onClick={() => choose(g.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onMouseEnter={() => setHoverId(g.id)}
                onMouseLeave={() => setHoverId((h) => (h === g.id ? null : h))}
                onFocus={() => setHoverId(g.id)}
                onBlur={() => setHoverId((h) => (h === g.id ? null : h))}
              >
                <Hook />
                <span className={c.figure}>
                  {g.imageUrl ? (
                    <ClothImage src={g.imageUrl} loading="lazy" />
                  ) : (
                    <span className={c.placeholder} />
                  )}
                </span>
                <span className={c.flags}>
                  {g.imageKind === 'concept' ? <Badge variant="concept" /> : null}
                  {g.isUpcycled ? <Badge variant="reworked" className={c.extraFlag} /> : null}
                  {!g.isUpcycled && g.category === 'accessory' ? <Badge variant="accessory" className={c.extraFlag} /> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className={c.caption} data-testid="rail-caption" aria-hidden="true">
          {hovered ? hovered.name : `${garments.length} ${garments.length === 1 ? 'piece' : 'pieces'} on the rail`}
        </p>
      </div>

      {active ? (
        <section id={detailId} className={c.detail} aria-label={`${active.name} details`}>
          <span className={c.ghost} aria-hidden="true">{humanize(active.tags[0] ?? active.category)}</span>
          <div className={c.detailFigure}>
            <Hook />
            {active.imageUrl ? (
              <ClothImage src={active.imageUrl} />
            ) : (
              <span className={c.placeholder} />
            )}
          </div>
          <div className={c.detailInfo}>
            <button type="button" className={c.close} onClick={close} aria-label="Close">
              <span aria-hidden="true">Close</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" /></svg>
            </button>
            <p className={c.index}>{pad(activeIndex + 1)} / {pad(garments.length)}</p>
            <h3 className={c.detailName}>{active.name}</h3>
            <p className={c.meta}>
              {active.category === 'accessory' ? 'Accessory' : 'Clothing'}
              {active.isUpcycled ? ' · made by you' : ''}
              {active.status === 'transformed' ? ' · given a second life' : ''}
            </p>
            {active.imageKind === 'concept' ? (
              <p className={c.meta}>
                <Badge variant="concept" />{' '}
                Shown with its AI concept picture, not a photo of the finished piece.
              </p>
            ) : null}
            {active.tags.length ? (
              <ul className={c.tags} aria-label="Tags">
                {active.tags.map((t) => <li key={t} className={ui.chip}>{humanize(t)}</li>)}
              </ul>
            ) : null}

            {onDelete ? (
              confirming ? (
                <div className={c.confirm} role="group" aria-label="Confirm delete">
                  <p>Delete {active.name}? Its photos are removed for good. The upload it used is not returned.</p>
                  <div className={c.detailActions}>
                    <button type="button" className={c.dangerSolid} onClick={() => void confirmDelete()} disabled={deleting}>
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                    <button type="button" className={ui.choice} onClick={() => setConfirming(false)} disabled={deleting} autoFocus>
                      Keep it
                    </button>
                  </div>
                  {deleteError ? <p className={ui.note} role="alert">{deleteError}</p> : null}
                </div>
              ) : (
                <div className={c.detailActions}>
                  <button type="button" className={c.danger} onClick={() => setConfirming(true)}>
                    Delete piece
                  </button>
                </div>
              )
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** A small hook and shoulder bar: the hanger shows only above the garment, as on a real rail. */
function Hook() {
  return (
    <svg className={c.hook} viewBox="0 0 40 26" fill="none" aria-hidden="true">
      <path d="M20 12c0-2.6 2.2-3.6 2.2-6A2.2 2.2 0 0 0 20 3.8 2.2 2.2 0 0 0 17.8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 12 5 22h30L20 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
