import type { Metadata } from 'next';
import { ContactContent } from '@/components/pages/ContactContent';

export const metadata: Metadata = {
  title: 'Step Inside — Contact — Warehaus',
};

export default function ContactPage() {
  return <ContactContent />;
}
