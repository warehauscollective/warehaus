import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CodexEntryContent } from '@/components/pages/CodexEntryContent';
import { codexEntries } from '@/lib/data/codex';

export function generateStaticParams() {
  return codexEntries.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const entry = codexEntries.find((e) => e.slug === slug);
    return {
      title: entry ? `${entry.title} — Codex — Warehaus` : 'Entry — Warehaus',
    };
  });
}

export default async function CodexEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = codexEntries.find((e) => e.slug === slug);

  if (!entry) {
    notFound();
  }

  return <CodexEntryContent entry={entry} />;
}
