'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BookOpen,
  Sparkles,
  Scroll,
  ArrowRight,
  ChevronDown,
  Flame,
  FlaskConical,
  Swords,
} from 'lucide-react';
import { useLayout } from '@/components/providers/LayoutProvider';
import { codexEntries } from '@/lib/data/codex';
import { ALL_SERVICES } from '@/lib/data/services';
import { Heading, Text, Eyebrow, Mono } from '@/components/react/ui/typography';
import { useFadeIn } from '@/hooks/useFadeIn';

/* ───────── Data ───────── */
const STATUS_FILTERS = [
  { key: 'all', label: 'All Works' },
  { key: 'artifact', label: 'Artifacts', icon: Flame },
  { key: 'quest', label: 'Quests', icon: Swords },
  { key: 'fragment', label: 'Fragments', icon: FlaskConical },
] as const;

const statusColors: Record<string, string> = {
  complete: 'border-emerald-400/30 text-emerald-400',
  'in-progress': 'border-amber-400/30 text-amber-400',
  experimental: 'border-violet-400/30 text-violet-400',
};

const statusGlow: Record<string, string> = {
  complete: 'bg-emerald-500',
  'in-progress': 'bg-amber-500',
  experimental: 'bg-violet-500',
};

const SIDEBAR_PAD = {
  paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 1rem)',
  paddingRight: 'calc(var(--right-sidebar-w, 0px) + 1rem)',
};

/* ───────── Component ───────── */
export function CodexContent() {
  const { setActiveSection } = useLayout();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [listRef, listVisible] = useFadeIn();
  const [ctaRef, ctaVisible] = useFadeIn();

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return codexEntries;
    return codexEntries.filter((e) => e.type === activeFilter);
  }, [activeFilter]);

  // Set default sidebar on mount
  useEffect(() => {
    setActiveSection('codex-intro');
    return () => setActiveSection('hero');
  }, [setActiveSection]);

  return (
    <div className="min-h-screen">

      {/* ════════ 1. HERO — The Codex ════════ */}
      <section
        data-section="codex-intro"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Background — deep library atmosphere */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a0a2e_0%,_#0a0a0f_60%,_#050505_100%)]" />

        {/* Floating book/scroll particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-purple-400/20"
              style={{
                left: `${10 + (i * 37) % 80}%`,
                top: `${10 + (i * 23) % 80}%`,
                animation: `pulse ${3 + (i % 4)}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>

        {/* Central codex visual */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-80 h-80 md:w-[500px] md:h-[500px]">
            {/* Outer ring — rotating runes */}
            <div
              className="absolute inset-0 rounded-lg border border-purple-500/10"
              style={{ animation: 'spin 60s linear infinite' }}
            />
            <div
              className="absolute inset-6 rounded-lg border border-purple-500/15 rotate-45"
              style={{ animation: 'spin 45s linear infinite reverse' }}
            />
            {/* Inner glow */}
            <div className="absolute inset-16 rounded-lg bg-purple-500/5 backdrop-blur-sm border border-purple-400/10" />
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpen className="w-16 h-16 md:w-24 md:h-24 text-purple-400/30" />
            </div>
          </div>
        </div>

        {/* Text overlay */}
        <div className="relative z-10 text-center px-6" style={SIDEBAR_PAD}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Scroll className="w-4 h-4 text-purple-400/60" />
              <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                The Collected Works
              </Eyebrow>
            </div>
            <Heading level={1} size="display" className="text-white mb-6 leading-[1.1]">
              Codex of<br />
              <span className="bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-transparent">
                Creations
              </span>
            </Heading>
            <Text lead className="text-gray-400 max-w-xl mx-auto">
              Every artifact forged, every quest undertaken, every fragment explored.
              The living record of everything we&apos;ve built.
            </Text>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <Eyebrow as="span" className="text-[9px]" style={{ color: 'rgb(192 132 252 / 0.4)' }}>
            Explore
          </Eyebrow>
          <ChevronDown className="w-4 h-4 text-purple-400/40 animate-bounce" />
        </div>
      </section>

      {/* ════════ 2. THE ARCHIVE — Project List ════════ */}
      <section
        ref={listRef}
        data-section="codex-archive"
        className="relative w-full min-h-screen py-32 overflow-hidden"
      >
        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#12061f_0%,_#050505_50%)]" />

        <div style={SIDEBAR_PAD} className="relative z-10 w-full">
          <div className="max-w-5xl mx-auto">
            {/* Section header */}
            <div
              className={`mb-12 transition-all duration-1000 ${
                listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-px bg-purple-500/40" />
                <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                  Archive
                </Eyebrow>
              </div>
              <Heading level={2} className="text-white mb-4">
                The works within.
              </Heading>
              <Text size="sm" className="text-gray-400 max-w-lg">
                Hover over any creation to reveal its details in the sidebar.
                Each entry holds the story of its making.
              </Text>
            </div>

            {/* Filter bar */}
            <div
              className={`flex flex-wrap gap-2 mb-10 transition-all duration-1000 delay-200 ${
                listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
                    activeFilter === f.key
                      ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                      : 'border-white/5 bg-white/[0.02] text-gray-500 hover:border-white/10 hover:text-gray-300'
                  }`}
                >
                  {'icon' in f && f.icon && <f.icon className="w-3 h-3" />}
                  {f.label}
                </button>
              ))}
            </div>

            {/* Project grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((entry, i) => (
                <Link
                  key={entry.slug}
                  href={`/codex/${entry.slug}`}
                  onMouseEnter={() => setActiveSection(`codex-${entry.slug}`)}
                  onMouseLeave={() => setActiveSection('codex-archive')}
                  className={`group relative block rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-all duration-500 hover:border-purple-500/20 hover:bg-purple-500/[0.03] ${
                    listVisible
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-8'
                  }`}
                  style={{
                    transitionDelay: listVisible ? `${300 + i * 100}ms` : '0ms',
                  }}
                >
                  {/* Cover image */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-purple-900/10">
                    {entry.coverImage ? (
                      <Image
                        src={entry.coverImage}
                        alt={entry.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-60 group-hover:opacity-80"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        unoptimized
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-purple-500/20" />
                      </div>
                    )}
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />

                    {/* Status indicator */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${statusGlow[entry.status]} animate-pulse`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${statusColors[entry.status].split(' ').pop()}`}>
                        {entry.type}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Eyebrow as="span" className="text-[9px]" style={{ color: 'rgb(192 132 252 / 0.5)' }}>
                        {entry.category}
                      </Eyebrow>
                      <Mono className="text-[9px] text-gray-600">
                        {entry.year}
                      </Mono>
                    </div>
                    <Heading level={3} display={false} className="text-white mb-2 transition-colors duration-300 group-hover:text-purple-300">
                      {entry.title}
                    </Heading>
                    <Text size="sm" className="text-gray-500 line-clamp-2">
                      {entry.description}
                    </Text>

                    {/* Services tags */}
                    <div className="flex flex-wrap gap-1 mt-3">
                      {entry.services.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="text-[9px] px-2 py-0.5 rounded-full border border-white/5 text-gray-500"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* Hover arrow */}
                    <div className="flex items-center gap-1 mt-4 text-[10px] font-bold uppercase tracking-wider text-purple-400/0 group-hover:text-purple-400/60 transition-all duration-300">
                      Open Entry <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="py-20 text-center">
                <Sparkles className="w-8 h-8 text-purple-500/20 mx-auto mb-4" />
                <Text size="sm" className="text-gray-500">
                  No entries found for this filter.
                </Text>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ════════ 3. CTA — Continue the journey ════════ */}
      <section
        ref={ctaRef}
        data-section="codex-cta"
        className="relative w-full h-screen min-h-[600px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#1a0a2e_0%,_#050505_60%)]" />

        <div
          className={`relative z-10 text-center px-6 transition-all duration-1000 ${
            ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="max-w-2xl mx-auto">
            <BookOpen className="w-10 h-10 text-purple-400/40 mx-auto mb-6" />
            <Heading level={2} size="display" className="text-white mb-6 leading-tight">
              Every creation starts<br />
              as a conversation.
            </Heading>
            <Text className="text-gray-400 mb-10 max-w-md mx-auto">
              Ready to add your project to the Codex?
              Tell us what you&apos;re building and we&apos;ll chart the path.
            </Text>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-bold hover:bg-purple-500/30 transition-all duration-300"
            >
              Start Your Project <ArrowRight className="w-4 h-4" />
            </Link>

            {/* Realm links */}
            <div className="mt-16 flex flex-wrap items-center justify-center gap-4">
              {ALL_SERVICES.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600 hover:text-purple-400 transition-colors duration-300"
                >
                  {s.realm}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
