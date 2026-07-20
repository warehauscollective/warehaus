import type { Metadata } from 'next';
import { CodexContent } from '@/components/pages/CodexContent';

export const metadata: Metadata = {
  title: 'Codex of Creations — Warehaus',
};

export default function CodexPage() {
  return <CodexContent />;
}
