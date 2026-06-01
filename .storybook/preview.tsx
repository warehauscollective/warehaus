import type { Preview } from '@storybook/nextjs-vite';
import * as React from 'react';
import localFont from 'next/font/local';
import { DM_Sans, Geist, Geist_Mono } from 'next/font/google';
import '../src/styles/global.css';

// Mirror app/layout.tsx so stories render in the real brand fonts.
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
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const geist = Geist({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono', display: 'swap' });
const fontVars = `${eurostile.variable} ${dmSans.variable} ${geist.variable} ${geistMono.variable}`;

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color|fill|stroke)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: 'todo' },
  },
  // Light/dark toggle in the toolbar — flips the `.light` class the tokens use.
  globalTypes: {
    theme: {
      description: 'Theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark', icon: 'circle' },
          { value: 'light', title: 'Light', icon: 'circlehollow' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals.theme as string) || 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('light', theme === 'light');
      }
      // .ds-scope provides the brand palette + fonts; components read its tokens.
      return (
        <div
          className={`ds-scope ${fontVars}`}
          style={{ minHeight: '60vh', width: '100%', padding: '2rem', background: 'var(--bg)', color: 'var(--fg)' }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
