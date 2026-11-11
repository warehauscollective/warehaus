import type { StorybookConfig } from '@storybook/nextjs-vite';
import { existsSync } from 'node:fs';
import { dirname, join, sep } from 'path';
import { fileURLToPath } from 'url';

function resolveFile(base: string): string | null {
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    const index = join(base, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return null;
}

function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const storybookDir = dirname(fileURLToPath(import.meta.url));
const portalRoot = join(storybookDir, '../../portal');
const portalSrc = join(portalRoot, 'src');

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../../portal/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    getAbsolutePath('@chromatic-com/storybook'),
    getAbsolutePath('@storybook/addon-vitest'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-mcp'),
  ],
  framework: getAbsolutePath('@storybook/nextjs-vite'),
  staticDirs: ['../public'],
  async viteFinal(config) {
    config.plugins = [
      ...(config.plugins ?? []),
      {
        name: 'portal-story-aliases',
        enforce: 'pre',
        resolveId(source: string, importer?: string) {
          if (!importer || !importer.includes(`${sep}apps${sep}portal${sep}`)) return null;
          if (source === 'convex/react') return join(storybookDir, 'convex-react-stub.tsx');
          if (source.startsWith('@/')) return resolveFile(join(portalSrc, source.slice(2)));
          if (source.startsWith('@convex/')) return resolveFile(join(portalRoot, 'convex', source.slice('@convex/'.length)));
          return null;
        },
      },
    ];
    return config;
  },
};

export default config;
