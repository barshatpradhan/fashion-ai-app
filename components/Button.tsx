import type { ButtonHTMLAttributes } from 'react';
import ui from './ui.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Outline style on paper instead of solid ink. */
  ghost?: boolean;
  /** Busy: disables the button, sets aria-busy and shows the busy ring. Keep a "…ing" label alongside. */
  loading?: boolean;
};

/** The primary pill button (ui.module.css .button) with its ghost and loading states. */
export function Button({ ghost = false, loading = false, disabled, className, type = 'button', ...rest }: Props) {
  const classes = [ui.button, ghost ? ui.ghost : '', loading ? ui.loading : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    />
  );
}
