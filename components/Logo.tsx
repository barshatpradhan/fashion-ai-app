import n from './nav.module.css';

export function Logo({ size = 19 }: { size?: number }) {
  return (
    <span className={n.logo}>
      REVIV
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <path d="M85.91 47.49 A36 36 0 1 1 64.64 17.11" fill="none" stroke="var(--slate)" strokeWidth="12" />
        <path d="M69.11 7.06 L78.34 23.21 L60.17 27.16 Z" fill="var(--slate)" />
        <circle cx="82.89" cy="35.36" r="6.5" fill="var(--steel)" />
      </svg>
    </span>
  );
}
