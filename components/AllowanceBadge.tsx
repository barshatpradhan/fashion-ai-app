'use client';
import { allowanceLabel, type AllowanceView } from '@/lib/ui/closet';
import c from './closet.module.css';
import s from './result.module.css';

type Props = { allowance: AllowanceView; now?: Date };

/** "{n} uploads left · next in {h}h", or "Unlimited". */
export function AllowanceBadge({ allowance, now }: Props) {
  return (
    <p className={c.badge} aria-live="polite">
      <span className={c.badgeDot} aria-hidden="true" />
      <span>
        <span className={s.visuallyHidden}>Uploads: </span>
        {allowanceLabel(allowance, now)}
      </span>
    </p>
  );
}
