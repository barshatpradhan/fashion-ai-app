import type { FeatureLabel } from '@/lib/ui/result';
import s from './result.module.css';

type Props = {
  src: string;
  alt: string;
  /** Shown in large faded type behind the garment. */
  fabric: string;
  features: FeatureLabel[];
  /** False when background removal failed and the original photo is shown. */
  isCutout: boolean;
};

export function HeroGarment({ src, alt, fabric, features, isCutout }: Props) {
  const left = features.filter((_, i) => i % 2 === 0);
  const right = features.filter((_, i) => i % 2 === 1);
  const list = (items: FeatureLabel[], side: string) => (
    <ul className={`${s.features} ${side}`}>
      {items.map((f) => (
        <li key={`${f.label}-${f.value}`} className={s.feature}>
          <span className={s.featureLabel}>{f.label}</span>
          <span className={s.featureValue}>{f.value}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className={s.hero} aria-label="Your garment">
      <div className={s.fabricBackdrop} aria-hidden="true">
        <span>{fabric}</span>
      </div>
      <div className={s.garmentWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the user's own photo */}
        <img src={src} alt={alt} className={`${s.garment} ${isCutout ? '' : s.garmentFramed}`} />
      </div>
      {list(left, s.featuresLeft)}
      {list(right, s.featuresRight)}
    </section>
  );
}
