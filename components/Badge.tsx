import type { HTMLAttributes, ReactNode } from 'react';
import ui from './ui.module.css';

export type BadgeVariant = 'concept' | 'premium' | 'reworked' | 'accessory' | 'allowance' | 'neutral';

const LABEL: Partial<Record<BadgeVariant, string>> = {
  concept: 'Concept',
  premium: 'Premium',
  reworked: 'Reworked',
  accessory: 'Accessory',
};

const VARIANT_CLASS: Record<BadgeVariant, string | undefined> = {
  concept: ui.badgeConcept,
  premium: ui.badgePremium,
  reworked: ui.badgeReworked,
  accessory: ui.badgeAccessory,
  allowance: ui.badgeAllowance,
  neutral: ui.badgeNeutral,
};

type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  variant: BadgeVariant;
  /** Allowance and neutral badges carry their own text. The others always show their fixed label. */
  children?: ReactNode;
  /** Element to render; 'p' for a badge that stands as its own line (the allowance counter). */
  as?: 'span' | 'p';
};

/**
 * The one badge. Spec rule: a Concept Image always carries a visible "Concept" label, so the concept
 * variant ignores children and is never visually hidden. Position it with a local class via className.
 */
export function Badge({ variant, children, as: Tag = 'span', className, ...rest }: Props) {
  const fixed = LABEL[variant];
  const classes = [ui.badge, VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <Tag className={classes} data-variant={variant} {...rest}>
      {variant === 'premium' ? <LockIcon /> : null}
      {fixed ?? children}
    </Tag>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
