import type { Metadata } from 'next';
import { AboutContent } from '@/components/pages/AboutContent';

export const metadata: Metadata = {
  title: 'The World Bible — About — Warehaus',
};

export default function AboutPage() {
  return <AboutContent />;
}
