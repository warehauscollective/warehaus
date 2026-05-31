import type { StyleGuideTab } from '@/components/providers/LayoutProvider';

/**
 * Section registry for the style-guide sub-nav rail. Each tab (Brand / Website
 * / Portal) lists the in-page sections a visitor can jump to. The `key` matches
 * the `data-section` attribute on each <section>, so the scroll observer's
 * `activeSection` lines up with the rail highlight.
 */
export interface StyleGuideSection {
  key: string;
  label: string;
}

export const STYLE_GUIDE_SECTIONS: Record<StyleGuideTab, StyleGuideSection[]> = {
  brand: [
    { key: 'brand-hero', label: 'Overview' },
    { key: 'brand-principles', label: 'Principles' },
    { key: 'brand-logo', label: 'Logo' },
    { key: 'brand-color', label: 'Color' },
    { key: 'brand-type', label: 'Typography' },
    { key: 'brand-shape', label: 'Shape & Space' },
    { key: 'brand-voice', label: 'Voice & Tone' },
    { key: 'brand-worlds', label: 'Worlds' },
  ],
  website: [
    { key: 'website-hero', label: 'Overview' },
    { key: 'website-layout', label: 'Layout & Grid' },
    { key: 'website-components', label: 'Components' },
    { key: 'website-patterns', label: 'Bento Patterns' },
  ],
  portal: [
    { key: 'portal-hero', label: 'Overview' },
    { key: 'portal-shell', label: 'App Shell' },
    { key: 'portal-data', label: 'Data & Forms' },
    { key: 'portal-flows', label: 'User Flows' },
    { key: 'portal-chamfer', label: 'Chamfer System' },
  ],
};
