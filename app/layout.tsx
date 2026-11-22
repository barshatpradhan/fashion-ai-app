import type { ReactNode } from 'react';
import './globals.css';
import { SiteNav } from '@/components/SiteNav';

export const metadata = { title: 'REVIVO' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
