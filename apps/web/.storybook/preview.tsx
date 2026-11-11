import type { Preview } from '@storybook/nextjs-vite';
import * as React from 'react';
import '../src/styles/global.css';
import './storybook-fonts.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color|fill|stroke)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: 'todo' },
    chromatic: {
      modes: {
        dark: { theme: 'dark' },
        light: { theme: 'light' },
      },
    },
  },
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
        document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
      }
      return (
        <div
          className="ds-scope"
          data-theme={theme}
          style={{
            minHeight: '100vh',
            width: '100%',
            background: 'var(--bg)',
            color: 'var(--fg)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
