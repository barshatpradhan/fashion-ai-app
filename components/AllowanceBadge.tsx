'use client';
import { allowanceLabel, type AllowanceUnit, type AllowanceView } from '@/lib/ui/closet';
import c from './closet.module.css';
import s from './result.module.css';

type Props = { allowance: AllowanceView; now?: Date; unit?: AllowanceUnit };

/** "{n} uploads left · next in {h}h" (or "looks"), or "Unlimited". */
export function AllowanceBadge({ allowance, now, unit = 'upload' }: Props) {
  return (
    <p className={c.badge} aria-live="polite">
      <span className={c.badgeDot} aria-hidden="true" />
      <span>
        <span className={s.visuallyHidden}>{unit === 'look' ? 'Looks' : 'Uploads'}: </span>
        {allowanceLabel(allowance, now, unit)}
      </span>
    </p>
  );
}
