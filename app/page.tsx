import Link from 'next/link';
import ui from '@/components/ui.module.css';
import h from '@/components/home.module.css';

const STEPS = [
  { n: 1, title: 'Scan', body: 'Photograph one garment. REVIVO reads its fabric and style.' },
  { n: 2, title: 'Learn', body: 'See its verified history, with the source for every fact.' },
  { n: 3, title: 'Remake', body: 'Follow a free redesign recipe, or unlock three more with Premium.' },
];

/** Static hero (spec §9b fallback for the floating cluster): what REVIVO does, and where to start. */
export default function Home() {
  return (
    <main className={ui.page}>
      <div className={ui.cols}>
        <section className={ui.col} aria-labelledby="home-title">
          <p className={ui.eyebrow}>Circular fashion</p>
          <h1 id="home-title" className={ui.title}>Every garment has a second life.</h1>
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
        <div className={`${ui.colWide} ${ui.panel} ${h.stage}`} aria-hidden="true">
          <div className={h.turntable}>
            <svg className={h.garment} viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round">
              <path d="M70 24 L28 48 L14 92 L44 100 L50 84 L50 176 L150 176 L150 84 L156 100 L186 92 L172 48 L130 24 C124 40 76 40 70 24 Z" />
            </svg>
          </div>
          <div className={h.floor} />
        </div>
      </div>

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
