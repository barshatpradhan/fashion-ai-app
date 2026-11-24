import { safeHex } from '@/lib/ui/result';
import s from './result.module.css';

export function Swatches({ colors }: { colors: { name: string; hex: string }[] }) {
  const valid = colors.flatMap((c) => {
    const hex = safeHex(c.hex);
    return hex ? [{ name: c.name, hex }] : [];
  });
  if (!valid.length) return null;
  return (
    <ul className={s.swatches} aria-label="Detected colours">
      {valid.map((c) => (
        <li key={`${c.name}-${c.hex}`} className={s.swatch}>
          <span className={s.swatchDot} style={{ background: c.hex }} aria-hidden="true" />
          {c.name}
        </li>
      ))}
    </ul>
  );
}
