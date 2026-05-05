import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://splitwala.hardeep.cv'),
  title: 'SplitWala | Split expenses. Not friendships.',
  description:
    'Free forever. Add @splitwala_bot to your Telegram group and split expenses in peace. No app needed, no sign-up, always-on debt simplification.',
  openGraph: {
    title: 'SplitWala | Split expenses. Not friendships.',
    description: 'Free Telegram bot for splitting group expenses.',
    url: 'https://splitwala.hardeep.cv',
    siteName: 'SplitWala',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SplitWala | Split expenses. Not friendships.',
    description: 'Free Telegram bot for splitting group expenses.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
