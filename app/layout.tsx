import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';

// Oswald is bundled locally: next/font/google intermittently failed to self-host it.
const oswald = localFont({
  src: [{ path: './fonts/Oswald-latin.woff2', weight: '200 700', style: 'normal' }],
  variable: '--font-oswald',
  display: 'swap',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], weight: '500', variable: '--font-jbmono' });

export const metadata = { title: 'REVIVO' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} ${jbmono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
