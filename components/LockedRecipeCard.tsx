import { humanize } from '@/lib/ui/result';
import { Badge } from './Badge';
import ui from './ui.module.css';
import s from './result.module.css';

type Props = { title: string; difficulty?: string; teaser: string };

/** A Premium Recipe shown to free users: title, difficulty and a one-sentence teaser, no link. */
export function LockedRecipeCard({ title, difficulty, teaser }: Props) {
  return (
    <article className={`${ui.card} ${s.locked}`} aria-label={`${title} (Premium)`}>
      <Badge variant="premium" className={s.lockBadge} />
      {difficulty ? <span className={ui.chip}>{humanize(difficulty)}</span> : null}
      <h3 className={ui.cardTitle}>{title}</h3>
      {teaser ? <p className={ui.cardBody}>{teaser}</p> : null}
    </article>
  );
}
