import Link from 'next/link';
import s from '@/components/result.module.css';

/** Static hero (spec §9b fallback for the floating cluster): what REVIVO does, and where to start. */
export default function Home() {
  return (
    <main className={s.page}>
      <p className={s.brand}>Revivo</p>
      <section aria-labelledby="home-title">
        <p className={s.eyebrow}>Circular fashion</p>
        <h1 id="home-title" className={s.title}>Every garment has a second life.</h1>
        <p className={s.lede}>
          Photograph a piece you no longer wear. Revivo reads its fabric and its verified history, then shows
          you how to rework it, and styles new looks from the clothes you already own.
        </p>
        <div className={s.choices} style={{ marginTop: 28 }}>
          <Link href="/scan" className={s.button}>Scan a garment</Link>
          <Link href="/closet" className={`${s.button} ${s.ghost}`}>Your closet</Link>
          <Link href="/looks" className={`${s.button} ${s.ghost}`}>Style looks</Link>
        </div>
      </section>
    </main>
  );
}
