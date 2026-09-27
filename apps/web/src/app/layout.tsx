import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { parseTheme, THEME_COOKIE } from '@/lib/cookies';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Waylorn', template: '%s · Waylorn' },
  description: 'Industrial infrastructure control plane',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" {...(theme === 'system' ? {} : { 'data-theme': theme })}>
      <body>{children}</body>
    </html>
  );
}
