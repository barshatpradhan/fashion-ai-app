'use client';
import { allowanceLabel, type AllowanceUnit, type AllowanceView } from '@/lib/ui/closet';
import { Badge } from './Badge';
import ui from './ui.module.css';

type Props = { allowance: AllowanceView; now?: Date; unit?: AllowanceUnit };

/** "{n} uploads left · next in {h}h" (or "looks"), or "Unlimited". */
export function AllowanceBadge({ allowance, now, unit = 'upload' }: Props) {
  return (
    <Badge variant="allowance" as="p" aria-live="polite">
      <span>
        <span className={ui.visuallyHidden}>{unit === 'look' ? 'Looks' : 'Uploads'}: </span>
        {allowanceLabel(allowance, now, unit)}
      </span>
    </Badge>
  );
}
