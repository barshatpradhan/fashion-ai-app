import Link from 'next/link';
import ui from '@/components/ui.module.css';
import h from '@/components/home.module.css';
import { HomeRing } from '@/components/HomeRing';

const STEPS = [
  { n: '01', title: 'Scan', body: 'Photograph one garment. REVIVO reads its fabric and style.' },
  { n: '02', title: 'Learn', body: 'See its verified history, with the source for every fact.' },
  { n: '03', title: 'Remake', body: 'Follow a free redesign recipe, or get three more with Premium.' },
];

/** Front page: the "Keep it in the loop" ring, then how it works in three steps. */
export default function Home() {
  return (
    <main className={`${ui.page} ${h.page}`}>
      <HomeRing />

      <section className={h.how} aria-labelledby="how-title">
        <h2 id="how-title" className={ui.sectionTitle}>How it works</h2>
        <ol className={h.steps}>
          {STEPS.map((s) => (
            <li key={s.n} className={h.step}>
              <span className={h.num} data-step>{s.n}</span>
              <h3 className={h.stepTitle}>{s.title}</h3>
              <p className={h.stepBody}>
                {s.body}
                {s.n === '03' ? (
                  <> Then <Link href="/looks" className={h.inline}>style new looks</Link> from what you already own.</>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
