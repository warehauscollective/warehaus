'use client';

import { cn } from '@/lib/utils/cn';

interface FilterBarProps {
  categories: string[];
  activeCategory?: string;
  onCategoryChange: (category: string | null) => void;
}

export function FilterBar({
  categories,
  activeCategory,
  onCategoryChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onCategoryChange(null)}
        className={cn(
          'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
          !activeCategory
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border-subtle bg-surface text-muted hover:border-border hover:text-foreground',
        )}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onCategoryChange(category)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
            activeCategory === category
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border-subtle bg-surface text-muted hover:border-border hover:text-foreground',
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
