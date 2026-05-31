import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { DM_Sans, Geist, Geist_Mono } from 'next/font/google';
import { VercelToolbar } from '@vercel/toolbar/next';
import { AppShell } from '@/components/layout/AppShell';
import { AgentationProvider } from '@/components/providers/AgentationProvider';
import { BevelInspectorProvider } from '@/components/dev/bevelInspector';
import '@/styles/global.css';

const eurostile = localFont({
  src: [
    { path: "../public/Font's/Eurostile.otf", weight: '400', style: 'normal' },
    { path: "../public/Font's/Eurostile Regular Oblique.otf", weight: '400', style: 'italic' },
    { path: "../public/Font's/Eurostile Medium.otf", weight: '500', style: 'normal' },
    { path: "../public/Font's/Eurostile Medium Italic.otf", weight: '500', style: 'italic' },
    { path: "../public/Font's/Eurostile Bold.otf", weight: '700', style: 'normal' },
    { path: "../public/Font's/Eurostile Bold Oblique.otf", weight: '700', style: 'italic' },
    { path: "../public/Font's/Eurostile Black.otf", weight: '900', style: 'normal' },
    { path: "../public/Font's/Eurostile Black Italic.otf", weight: '900', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

// Design-system body + mono voices (Warehaus style guide). Geist carries
// everything you read; Geist Mono handles eyebrows, codes, and tabular data.
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
  title: 'Warehaus',
  description: 'Dream. Design. Develop.',
  icons: [
    { rel: 'icon', type: 'image/svg+xml', url: '/favicon.svg' },
    { rel: 'icon', url: '/favicon.ico' },
  ],
};

// Blocking inline script that resolves the theme BEFORE first paint.
// Reads the persisted mode (auto | light | dark) from localStorage, resolves
// `auto` against `prefers-color-scheme`, and adds the `.light` class to
// <html> when appropriate. Mirrors the logic in LayoutProvider so the two
// stay in sync and there's no flash during hydration / on the loading screen.
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
      className={`${eurostile.variable} ${dmSans.variable} ${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-background text-foreground font-body antialiased" suppressHydrationWarning>
        <BevelInspectorProvider>
          <AppShell>{children}</AppShell>
        </BevelInspectorProvider>
        <AgentationProvider />
        {(process.env.NODE_ENV === 'development' ||
          process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview') && <VercelToolbar />}
      </body>
    </html>
  );
}
