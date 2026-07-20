import type { Metadata } from 'next';
import { HomeContent } from '@/components/pages/HomeContent';

export const metadata: Metadata = {
  title: 'Warehaus — Dream. Design. Develop.',
};

export default function HomePage() {
  return <HomeContent />;
}
