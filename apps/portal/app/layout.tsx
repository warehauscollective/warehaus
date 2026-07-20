import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Geist, Geist_Mono } from 'next/font/google';
import { PortalShell } from '@/components/layout/PortalShell';
import '@/styles/global.css';

const eurostile = localFont({
  src: [
    { path: '../public/fonts/Eurostile.otf', weight: '400', style: 'normal' },
    {
      path: '../public/fonts/Eurostile Regular Oblique.otf',
      weight: '400',
      style: 'italic',
    },
    { path: '../public/fonts/Eurostile Medium.otf', weight: '500', style: 'normal' },
    {
      path: '../public/fonts/Eurostile Medium Italic.otf',
      weight: '500',
      style: 'italic',
    },
    { path: '../public/fonts/Eurostile Bold.otf', weight: '700', style: 'normal' },
    {
      path: '../public/fonts/Eurostile Bold Oblique.otf',
      weight: '700',
      style: 'italic',
    },
    { path: '../public/fonts/Eurostile Black.otf', weight: '900', style: 'normal' },
    {
      path: '../public/fonts/Eurostile Black Italic.otf',
      weight: '900',
      style: 'italic',
    },
  ],
  variable: '--font-display',
  display: 'swap',
});

const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Warehaus Portal',
  description: 'Where the work actually happens.',
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('warehaus-theme');
    var mode = (saved === 'light' || saved === 'dark' || saved === 'auto') ? saved : 'auto';
    var resolved = mode;
    if (mode === 'auto') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    if (resolved === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  } catch (e) {}
})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${eurostile.variable} ${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
