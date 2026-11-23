import Link from 'next/link';
import ui from '@/components/ui.module.css';
import h from '@/components/home.module.css';
import { HomeRing } from '@/components/HomeRing';

const STEPS = [
  { n: 1, title: 'Scan', body: 'Photograph one garment. REVIVO reads its fabric and style.' },
  { n: 2, title: 'Learn', body: 'See its verified history, with the source for every fact.' },
  { n: 3, title: 'Remake', body: 'Follow a free redesign recipe, or unlock three more with Premium.' },
];

/** Front page: the "Keep it in the loop" ring, then where to start and how it works. */
export default function Home() {
  return (
    <main className={ui.page}>
      <HomeRing />

      <section className={`${ui.head} ${h.intro}`} aria-label="Start here">
        <p className={ui.lede}>
          Photograph a piece you no longer wear. Revivo reads its fabric and its verified history, then shows
          you how to rework it, and styles new looks from the clothes you already own.
        </p>
        <div className={`${ui.choices} ${h.actions}`}>
          <Link href="/scan" className={ui.button}>Scan a garment</Link>
          <Link href="/closet" className={`${ui.button} ${ui.ghost}`}>Your closet</Link>
          <Link href="/looks" className={`${ui.button} ${ui.ghost}`}>Style looks</Link>
        </div>
      </section>

      <section className={ui.head} aria-labelledby="how-title">
        <h2 id="how-title" className={ui.sectionTitle}>How it works</h2>
        <div className={ui.grid3}>
          {STEPS.map((s) => (
            <div key={s.n} className={ui.card}>
              <span className={h.num}>{s.n}</span>
              <h3 className={ui.cardTitle}>{s.title}</h3>
              <p className={ui.cardBody}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
