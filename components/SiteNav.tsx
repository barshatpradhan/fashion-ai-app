import Link from 'next/link';
import n from './nav.module.css';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/scan', label: 'Scan' },
  { href: '/closet', label: 'Closet' },
  { href: '/looks', label: 'Looks' },
  { href: '/profile', label: 'Profile' },
];

export function SiteNav() {
  return (
    <nav className={n.nav} aria-label="Main">
      {LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
    </nav>
  );
}
