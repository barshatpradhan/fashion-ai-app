import Link from 'next/link';
import ui from '@/components/ui.module.css';
import h from '@/components/home.module.css';

/** Static hero (spec §9b fallback for the floating cluster): what REVIVO does, and where to start. */
export default function Home() {
  return (
    <main className={ui.page}>
      <p className={ui.brand}>Revivo</p>
      <section aria-labelledby="home-title">
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
    </main>
  );
}
