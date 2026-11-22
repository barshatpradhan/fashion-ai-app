import { humanize } from '@/lib/ui/result';
import s from './result.module.css';

type Props = { title: string; difficulty?: string; teaser: string };

/** A Premium Recipe shown to free users: title, difficulty and a one-sentence teaser, no link. */
export function LockedRecipeCard({ title, difficulty, teaser }: Props) {
  return (
    <article className={`${s.card} ${s.locked}`} aria-label={`${title} (Premium)`}>
      <span className={s.lockBadge}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Premium
      </span>
      {difficulty ? <span className={s.tag}>{humanize(difficulty)}</span> : null}
      <h3 className={s.cardTitle}>{title}</h3>
      {teaser ? <p className={s.cardBody}>{teaser}</p> : null}
    </article>
  );
}
