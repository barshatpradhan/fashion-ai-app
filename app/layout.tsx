import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono, Oswald } from 'next/font/google';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';

const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-oswald' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], weight: '500', variable: '--font-jbmono' });

export const metadata = { title: 'REVIVO' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} ${jbmono.variable}`}>
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
