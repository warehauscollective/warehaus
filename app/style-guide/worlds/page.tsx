import type { Metadata } from 'next';
import { WorldsContent } from '@/components/pages/WorldsContent';

export const metadata: Metadata = {
  title: 'Worlds — Dream. Design. Develop. — Warehaus',
};

export default function WorldsPage() {
  return <WorldsContent />;
}
