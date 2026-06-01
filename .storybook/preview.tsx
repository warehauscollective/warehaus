import type { Preview } from '@storybook/nextjs-vite';
import * as React from 'react';
import '../src/styles/global.css';

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
          className="ds-scope"
          style={{ minHeight: '60vh', width: '100%', padding: '2rem', background: 'var(--bg)', color: 'var(--fg)' }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
