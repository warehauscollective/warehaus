'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { GlassCard } from '@/components/react/ui/GlassCard';
import { FilterBar } from '@/components/react/ui/FilterBar';
import { Heading, Text, Eyebrow } from '@/components/react/ui/typography';
import { BasePanel } from './BasePanel';

export interface ContentItem {
  id: string;
  title: string;
  category: string;
  image?: string;
  href: string;
  description?: string;
}

interface ContentPanelProps {
  items: ContentItem[];
  categories?: string[];
}

export function ContentPanel({ items, categories }: ContentPanelProps) {
  const derivedCategories = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    return [...new Set(items.map((item) => item.category))];
  }, [categories, items]);

  // Read initial category from URL search params
  const [activeCategory, setActiveCategory] = useState<string | undefined>(
    () => {
      if (typeof window === 'undefined') return undefined;
      const params = new URLSearchParams(window.location.search);
      return params.get('category') ?? undefined;
    },
  );

  const filteredItems = useMemo(() => {
    if (!activeCategory) return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  const handleCategoryChange = (category: string | null) => {
    setActiveCategory(category ?? undefined);

    // Sync to URL search params
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (category) {
        url.searchParams.set('category', category);
      } else {
        url.searchParams.delete('category');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <BasePanel>
      <div className="mb-5">
        <FilterBar
          categories={derivedCategories}
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group block transition-transform duration-200 hover:-translate-y-0.5"
          >
            <GlassCard className="h-full p-0 overflow-hidden">
              {item.image && (
                <div className="aspect-video w-full overflow-hidden relative">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized
                  />
                </div>
              )}
              <div className="p-4">
                <Eyebrow
                  as="span"
                  className={cn(
                    'mb-2 inline-block rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] text-accent',
                  )}
                >
                  {item.category}
                </Eyebrow>
                <Heading
                  level={6}
                  display={false}
                  className="text-sm text-foreground transition-colors duration-200 group-hover:text-accent"
                >
                  {item.title}
                </Heading>
                {item.description && (
                  <Text size="sm" muted className="mt-1 line-clamp-2 text-xs">
                    {item.description}
                  </Text>
                )}
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <Text size="sm" muted className="py-8 text-center">
          No items found in this category.
        </Text>
      )}
    </BasePanel>
  );
}
