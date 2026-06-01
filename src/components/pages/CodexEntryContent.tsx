'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useFadeIn } from '@/hooks/useFadeIn';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Layers,
  Target,
  Wrench,
  ImageIcon,
  TrendingUp,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { useLayout } from '@/components/providers/LayoutProvider';
import type { CodexEntry } from '@/lib/types/service';
import { codexEntries } from '@/lib/data/codex';
import { Heading, Text, Eyebrow, Mono } from '@/components/react/ui/typography';

/* ───────── Constants ───────── */
const SIDEBAR_PAD = {
  paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 1rem)',
  paddingRight: 'calc(var(--right-sidebar-w, 0px) + 1rem)',
};

const statusGlow: Record<string, string> = {
  complete: 'bg-emerald-500',
  'in-progress': 'bg-amber-500',
  experimental: 'bg-violet-500',
};

const statusLabel: Record<string, string> = {
  complete: 'Complete',
  'in-progress': 'In Progress',
  experimental: 'Experimental',
};

const mentorRealm: Record<string, string> = {
  Korr: 'The Forge',
  Vaelen: 'Navigator Realm',
  Cirion: 'The High Tower',
};

interface CodexEntryContentProps {
  entry: CodexEntry;
}

export function CodexEntryContent({ entry }: CodexEntryContentProps) {
  const { setActiveSection } = useLayout();
  const currentIndex = codexEntries.findIndex((e) => e.slug === entry.slug);
  const prev = currentIndex > 0 ? codexEntries[currentIndex - 1] : null;
  const next = currentIndex < codexEntries.length - 1 ? codexEntries[currentIndex + 1] : null;

  const [overviewRef, overviewVisible] = useFadeIn();
  const [challengeRef, challengeVisible] = useFadeIn();
  const [servicesRef, servicesVisible] = useFadeIn();
  const [galleryRef, galleryVisible] = useFadeIn();
  const [resultsRef, resultsVisible] = useFadeIn();
  const [navRef, navVisible] = useFadeIn();

  // Set sidebar to entry intro on mount
  useEffect(() => {
    setActiveSection(`entry-hero`);
    return () => setActiveSection('hero');
  }, [setActiveSection]);

  return (
    <div className="min-h-screen">

      {/* ════════ BACK NAV — Sticky ════════ */}
      <div
        className="fixed top-0 left-0 right-0 z-40 pointer-events-none"
        style={SIDEBAR_PAD}
      >
        <div className="max-w-5xl mx-auto pt-4">
          <Link
            href="/codex"
            className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl text-xs text-gray-400 hover:text-white hover:border-purple-500/30 transition-all duration-300"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Codex
          </Link>
        </div>
      </div>

      {/* ════════ 1. HERO — Cover + Title ════════ */}
      <section
        data-section="entry-hero"
        className="relative w-full h-[70vh] min-h-[500px] flex items-end overflow-hidden"
      >
        {/* Cover image */}
        {entry.coverImage ? (
          <Image
            src={entry.coverImage}
            alt={entry.title}
            fill
            className="object-cover opacity-40"
            sizes="100vw"
            priority
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a0a2e_0%,_#050505_60%)]" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />

        {/* Content */}
        <div className="relative z-10 w-full pb-16" style={SIDEBAR_PAD}>
          <div className="max-w-5xl mx-auto">
            {/* Tags */}
            <div className="flex items-center gap-3 mb-4">
              <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                {entry.category}
              </Eyebrow>
              <span className="text-gray-700">|</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${statusGlow[entry.status]} animate-pulse`} />
                <Eyebrow as="span" className="text-gray-500">
                  {entry.type} — {statusLabel[entry.status]}
                </Eyebrow>
              </div>
            </div>

            <Heading level={1} size="display" className="text-white mb-4 leading-[1.05]">
              {entry.title}
            </Heading>
            <Text lead className="text-gray-400 max-w-2xl">
              {entry.description}
            </Text>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <ChevronDown className="w-4 h-4 text-purple-400/30 animate-bounce" />
        </div>
      </section>

      {/* ════════ 2. OVERVIEW — Meta strip ════════ */}
      <section
        ref={overviewRef}
        data-section="entry-overview"
        className="relative w-full py-20"
      >
        <div style={SIDEBAR_PAD} className="w-full">
          <div
            className={`max-w-5xl mx-auto transition-all duration-1000 ${
              overviewVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            {/* Meta grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              {[
                { label: 'Client', value: entry.client },
                { label: 'Year', value: String(entry.year) },
                { label: 'Mentor', value: entry.mentor },
                { label: 'Realm', value: mentorRealm[entry.mentor] || 'Unknown' },
              ].map((meta) => (
                <div
                  key={meta.label}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <Eyebrow className="text-[9px] mb-1" style={{ color: 'rgb(192 132 252 / 0.5)' }}>
                    {meta.label}
                  </Eyebrow>
                  <Text size="sm" className="font-semibold text-white">{meta.value}</Text>
                </div>
              ))}
            </div>

            {/* Services pills */}
            <div className="flex flex-wrap gap-2">
              {entry.services.map((s) => (
                <span
                  key={s}
                  className="px-3 py-1 rounded-full border border-purple-500/20 bg-purple-500/5 text-xs text-purple-300"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════ 3. THE CHALLENGE — What we solved ════════ */}
      {entry.challenge && (
        <section
          ref={challengeRef}
          data-section="entry-challenge"
          className="relative w-full py-20"
        >
          <div style={SIDEBAR_PAD} className="w-full">
            <div
              className={`max-w-5xl mx-auto transition-all duration-1000 ${
                challengeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Challenge */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-4 h-4 text-purple-400/60" />
                    <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                      The Challenge
                    </Eyebrow>
                  </div>
                  <Text className="text-gray-300">
                    {entry.challenge}
                  </Text>
                </div>

                {/* Approach */}
                {entry.approach && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="w-4 h-4 text-purple-400/60" />
                      <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                        Our Approach
                      </Eyebrow>
                    </div>
                    <Text className="text-gray-300">
                      {entry.approach}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ════════ 4. SERVICES — Detailed breakdown ════════ */}
      {entry.serviceDetails && entry.serviceDetails.length > 0 && (
        <section
          ref={servicesRef}
          data-section="entry-services"
          className="relative w-full py-20"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#12061f_0%,_transparent_60%)]" />
          <div style={SIDEBAR_PAD} className="relative z-10 w-full">
            <div className="max-w-5xl mx-auto">
              <div
                className={`mb-12 transition-all duration-1000 ${
                  servicesVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Wrench className="w-4 h-4 text-purple-400/60" />
                  <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                    Services Applied
                  </Eyebrow>
                </div>
                <Heading level={2} className="text-white">
                  How we built it.
                </Heading>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {entry.serviceDetails.map((sd, i) => (
                  <div
                    key={sd.name}
                    className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-700 ${
                      servicesVisible
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-8'
                    }`}
                    style={{ transitionDelay: servicesVisible ? `${200 + i * 150}ms` : '0ms' }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                      <Mono className="text-[10px] font-bold text-purple-400">
                        {String(i + 1).padStart(2, '0')}
                      </Mono>
                    </div>
                    <Heading level={6} display={false} className="text-white mb-2">{sd.name}</Heading>
                    <Text size="sm" className="text-gray-400">{sd.description}</Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ════════ 5. SHOWCASE — Work examples ════════ */}
      <section
        ref={galleryRef}
        data-section="entry-showcase"
        className="relative w-full py-20"
      >
        <div style={SIDEBAR_PAD} className="w-full">
          <div className="max-w-5xl mx-auto">
            <div
              className={`mb-12 transition-all duration-1000 ${
                galleryVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="w-4 h-4 text-purple-400/60" />
                <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                  Showcase
                </Eyebrow>
              </div>
              <Heading level={2} className="text-white">
                The work, up close.
              </Heading>
            </div>

            {/* Main showcase image */}
            <div
              className={`rounded-xl border border-white/[0.06] overflow-hidden mb-4 transition-all duration-1000 delay-200 ${
                galleryVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="relative aspect-[16/9] w-full bg-purple-900/10">
                {entry.coverImage ? (
                  <Image
                    src={entry.coverImage}
                    alt={`${entry.title} showcase`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 960px"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <BookOpen className="w-12 h-12 text-purple-500/20" />
                    <Text size="sm" className="text-gray-600">
                      Project visuals will be loaded from CMS
                    </Text>
                  </div>
                )}
              </div>
            </div>

            {/* Gallery grid — placeholder for CMS images */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`rounded-xl border border-white/[0.06] overflow-hidden transition-all duration-700 ${
                    galleryVisible
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-8'
                  }`}
                  style={{ transitionDelay: galleryVisible ? `${300 + i * 100}ms` : '0ms' }}
                >
                  <div className="relative aspect-[4/3] w-full bg-purple-900/5">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <ImageIcon className="w-6 h-6 text-purple-500/15" />
                      <Eyebrow className="text-[9px] tracking-wider text-gray-700">
                        Gallery {String(i).padStart(2, '0')}
                      </Eyebrow>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════ 6. RESULTS — Impact ════════ */}
      {entry.results && entry.results.length > 0 && (
        <section
          ref={resultsRef}
          data-section="entry-results"
          className="relative w-full py-20"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#12061f_0%,_transparent_60%)]" />
          <div style={SIDEBAR_PAD} className="relative z-10 w-full">
            <div className="max-w-5xl mx-auto">
              <div
                className={`mb-12 transition-all duration-1000 ${
                  resultsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-purple-400/60" />
                  <Eyebrow as="span" style={{ color: 'rgb(192 132 252 / 0.6)' }}>
                    Results
                  </Eyebrow>
                </div>
                <Heading level={2} className="text-white">
                  The impact.
                </Heading>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {entry.results.map((result, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-700 ${
                      resultsVisible
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-8'
                    }`}
                    style={{ transitionDelay: resultsVisible ? `${200 + i * 150}ms` : '0ms' }}
                  >
                    <div className="w-2 h-2 rounded-full bg-purple-500/40 mb-4" />
                    <Text size="sm" className="text-white">{result}</Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ════════ 7. NAVIGATION — Prev/Next ════════ */}
      <section
        ref={navRef}
        data-section="entry-nav"
        className="relative w-full py-20 border-t border-white/[0.06]"
      >
        <div style={SIDEBAR_PAD} className="w-full">
          <div
            className={`max-w-5xl mx-auto transition-all duration-1000 ${
              navVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            {/* Back to codex */}
            <div className="text-center mb-12">
              <Link
                href="/codex"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300 hover:bg-purple-500/20 transition-all duration-300"
              >
                <BookOpen className="w-4 h-4" />
                Back to Codex
              </Link>
            </div>

            {/* Prev/Next */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prev ? (
                <Link
                  href={`/codex/${prev.slug}`}
                  className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-purple-500/20 transition-all duration-300"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600 group-hover:text-purple-400 transition-colors" />
                  <div>
                    <Eyebrow className="text-[9px] mb-1 text-gray-600">
                      Previous
                    </Eyebrow>
                    <Text size="sm" className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                      {prev.title}
                    </Text>
                  </div>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/codex/${next.slug}`}
                  className="group flex items-center justify-end gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-purple-500/20 transition-all duration-300 text-right"
                >
                  <div>
                    <Eyebrow className="text-[9px] mb-1 text-gray-600">
                      Next
                    </Eyebrow>
                    <Text size="sm" className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                      {next.title}
                    </Text>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-600 group-hover:text-purple-400 transition-colors" />
                </Link>
              ) : (
                <div />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
