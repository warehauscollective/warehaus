import type { Metadata } from 'next';
import { StyleGuideContent } from '@/components/pages/StyleGuideContent';

export const metadata: Metadata = {
  title: 'Style Guide — Brand. Website. Portal. — Warehaus',
};

export default function StyleGuidePage() {
  return <StyleGuideContent />;
}
