'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Compass,
  Sparkles,
  Eye,
  Map,
  BookOpen,
  Star,
  ChevronDown,
  ArrowRight,
  Orbit,
  ScrollText,
  Telescope,
  Swords,
} from 'lucide-react';
import { GlassCard } from '@/components/react/ui/GlassCard';
import { ALL_SERVICES } from '@/lib/data/services';
import { useFadeIn } from '@/hooks/useFadeIn';
import { Heading, Text, Eyebrow, Mono } from '@/components/react/ui/typography';

/* ───────── Data ───────── */
const disciplines = [
  { icon: Eye, loreTitle: 'Rune Reading', realTitle: 'Brand Strategy' },
  { icon: Map, loreTitle: 'Cartography of Kingdoms', realTitle: 'Market Research' },
  { icon: Telescope, loreTitle: 'Summoning the North Star', realTitle: 'Product Visioning' },
  { icon: ScrollText, loreTitle: 'Whisper Inscription', realTitle: 'Content Strategy' },
  { icon: Star, loreTitle: 'Starlight Projection', realTitle: 'Creative Direction' },
];

const artifacts = [
  { icon: BookOpen, loreTitle: 'Grimoire of House Symbols', realTitle: 'Brand Style Guides' },
  { icon: Orbit, loreTitle: 'Star Maps of Becoming', realTitle: 'Product Roadmaps' },
  { icon: Sparkles, loreTitle: 'Whisper Keys', realTitle: 'Naming & Messaging' },
];

const SIDEBAR_PAD = {
  paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 1rem)',
  paddingRight: 'calc(var(--right-sidebar-w, 0px) + 1rem)',
};

/* ───────── Component ───────── */
export function DreamContent() {
  const [fogRef, fogVisible] = useFadeIn();
  const [guideRef, guideVisible] = useFadeIn();
  const [mapRef, mapVisible] = useFadeIn();
  const [shapeRef, shapeVisible] = useFadeIn();
  const [forgeRef, forgeVisible] = useFadeIn();
  const [companionRef, companionVisible] = useFadeIn();
  const [ctaRef, ctaVisible] = useFadeIn();

  const siblings = ALL_SERVICES.filter((s) => s.href !== '/dream');

  return (
    <div className="min-h-screen">

      {/* ════════ 1. THE SPARK — You have a vision ════════ */}
      <section
        data-section="spark"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Deep cosmos background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e1b4b_0%,_#0c0a1a_40%,_#050505_80%)]" />
          <div className="absolute inset-0 opacity-40" style={{
            backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }} />
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'radial-gradient(white 1.5px, transparent 1.5px)',
            backgroundSize: '200px 200px',
            backgroundPosition: '40px 40px',
          }} />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(ellipse at 30% 50%, #4338ca 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, #6d28d9 0%, transparent 50%)',
          }} />
        </div>

        {/* Large compass sigil */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[500px] h-[500px] md:w-[700px] md:h-[700px]">
            <div className="absolute inset-0 rounded-full bg-indigo-500/5 blur-[80px]" />
            <div className="absolute inset-0 rounded-full border border-indigo-300/10" />
            <div className="absolute inset-8 rounded-full border border-indigo-400/15" />
            <div className="absolute inset-16 rounded-full border border-indigo-400/12" />
            <div className="absolute inset-28 rounded-full border border-indigo-500/10" />
            <div className="absolute inset-36 rounded-full border border-indigo-500/8" />
            <div className="absolute top-0 left-1/2 -translate-x-px w-px h-full bg-gradient-to-b from-indigo-300/25 via-indigo-400/10 to-indigo-300/25" />
            <div className="absolute top-1/2 left-0 -translate-y-px w-full h-px bg-gradient-to-r from-indigo-300/25 via-indigo-400/10 to-indigo-300/25" />
            <div className="absolute inset-0 origin-center rotate-45">
              <div className="absolute top-0 left-1/2 -translate-x-px w-px h-full bg-indigo-400/8" />
              <div className="absolute top-1/2 left-0 -translate-y-px w-full h-px bg-indigo-400/8" />
            </div>
            <div className="absolute -top-24 left-1/2 -translate-x-px w-px h-24 bg-gradient-to-t from-indigo-300/30 to-transparent" />
            <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-indigo-300/60 animate-pulse shadow-[0_0_20px_rgba(129,140,248,0.5)]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-indigo-400/40 shadow-[0_0_30px_rgba(99,102,241,0.4)]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-indigo-300/80" />
            <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-indigo-300/50 animate-pulse" />
            <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400/40 animate-pulse [animation-delay:1s]" />
            <div className="absolute top-1/2 left-[5%] -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400/40 animate-pulse [animation-delay:0.5s]" />
            <div className="absolute top-1/2 right-[5%] -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400/40 animate-pulse [animation-delay:1.5s]" />
            <div className="absolute top-[18%] right-[12%] w-1 h-1 rounded-full bg-indigo-300/30 animate-pulse [animation-delay:0.3s]" />
            <div className="absolute bottom-[22%] left-[18%] w-1 h-1 rounded-full bg-indigo-300/30 animate-pulse [animation-delay:0.8s]" />
            <div className="absolute top-[30%] left-[8%] w-1.5 h-1.5 rounded-full bg-violet-300/25 animate-pulse [animation-delay:2s]" />
            <div className="absolute bottom-[15%] right-[10%] w-1 h-1 rounded-full bg-violet-300/20 animate-pulse [animation-delay:1.3s]" />
          </div>
        </div>

        {/* Text overlay */}
        <div className="relative z-10 text-center" style={SIDEBAR_PAD}>
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Compass className="w-4 h-4 text-indigo-400" />
            </div>
            <Eyebrow as="span" className="text-indigo-400">
              The Navigator Realm
            </Eyebrow>
          </div>

          <Heading level={1} size="display" className="text-white/90 mb-8">
            Build your Dream
          </Heading>

          <Text size="lg" className="text-white/40 max-w-lg mx-auto">
            It starts here. A spark. An ambition you can&apos;t quite name yet.
            <br className="hidden md:block" />
            <span className="text-white/25">That&apos;s exactly where we begin.</span>
          </Text>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => document.querySelector('[data-section="fog"]')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center gap-2 text-indigo-300/40 hover:text-indigo-300/80 transition-colors"
          >
            <span className="text-[10px] tracking-[0.3em] uppercase">Step into the unknown</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ════════ 2. THE FOG — You're lost, overwhelmed ════════ */}
      <section
        data-section="fog"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Dense fog atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0c0a1a] to-[#050505]" />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '120px 120px',
        }} />
        {/* Fog layers — heavy, disorienting */}
        <div className="absolute top-0 left-0 right-0 h-2/3 bg-gradient-to-b from-indigo-900/8 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-indigo-900/6 to-transparent" />
        <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full bg-indigo-600/4 blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] rounded-full bg-violet-600/3 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/3 blur-[100px]" />

        <div
          ref={fogRef}
          className={`relative z-10 text-center transition-all duration-[1500ms] ${
            fogVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-indigo-400/30 mb-8">
            The Unknown
          </Eyebrow>
          <Heading level={2} size="h1" className="text-white/70 max-w-2xl mx-auto mb-6">
            You know something
            <br />
            <span className="text-white/30">needs to exist.</span>
          </Heading>
          <Text size="lg" className="text-white/20 max-w-md mx-auto">
            But the vision is still forming. Too many directions. Too much noise. The path forward isn&apos;t clear yet.
          </Text>
        </div>
      </section>

      {/* ════════ 3. THE GUIDE APPEARS — Meet your pathfinder ════════ */}
      <section
        data-section="guide"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        {/* Subtle starfield — fog is clearing */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-600/5 blur-[100px]" />

        <div
          ref={guideRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            guideVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="flex flex-col items-center">
            {/* Vaelen portrait */}
            <div className="relative w-[260px] h-[340px] md:w-[320px] md:h-[420px] mb-10">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-indigo-950/80 via-[#0c0a1a] to-indigo-950/40 border border-indigo-500/10 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-36 h-36 md:w-48 md:h-48">
                    <div className="absolute inset-0 rounded-full border border-indigo-400/20" />
                    <div className="absolute inset-4 rounded-full border border-indigo-400/15" />
                    <div className="absolute inset-8 rounded-full border border-indigo-500/10" />
                    <div className="absolute top-0 left-1/2 -translate-x-px w-px h-full bg-indigo-300/20" />
                    <div className="absolute top-1/2 left-0 -translate-y-px w-full h-px bg-indigo-300/20" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-indigo-400/50" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-300" />
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/60 animate-pulse shadow-[0_0_12px_rgba(255,255,255,0.3)]" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-indigo-950/80 to-transparent" />
                <div className="absolute top-[10%] left-[15%] w-1 h-1 rounded-full bg-white/20 animate-pulse [animation-delay:0.5s]" />
                <div className="absolute top-[20%] right-[20%] w-0.5 h-0.5 rounded-full bg-white/30 animate-pulse [animation-delay:1.2s]" />
                <div className="absolute bottom-[40%] left-[25%] w-0.5 h-0.5 rounded-full bg-white/20 animate-pulse [animation-delay:0.8s]" />
                <div className="absolute top-[35%] right-[10%] w-1 h-1 rounded-full bg-indigo-300/30 animate-pulse [animation-delay:1.5s]" />
              </div>
              <div className="absolute -inset-8 rounded-[2rem] bg-indigo-500/5 blur-2xl -z-10" />
            </div>

            <Eyebrow className="text-indigo-400/30 mb-4">
              Your guide has arrived
            </Eyebrow>
            <Heading level={2} className="text-white text-center mb-3">
              Meet Vaelen
            </Heading>
            <Text size="sm" className="text-indigo-300/30 italic max-w-sm text-center">
              The Dark Elf Pathfinder. He&apos;s charted a thousand futures and knows which ones are worth chasing.
            </Text>
          </div>
        </div>
      </section>

      {/* ════════ 4. MAPPING THE LANDSCAPE — The fog clears, we see the terrain ════════ */}
      <section
        data-section="landscape"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Cosmic background — brighter, clearer than the fog section */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a1040_0%,_#0a0818_50%,_#050505_100%)]" />
          {/* Constellation lines — the map is forming */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <line x1="10%" y1="20%" x2="30%" y2="35%" stroke="#818cf8" strokeWidth="1" />
            <line x1="30%" y1="35%" x2="25%" y2="60%" stroke="#818cf8" strokeWidth="1" />
            <line x1="25%" y1="60%" x2="45%" y2="70%" stroke="#818cf8" strokeWidth="1" />
            <line x1="60%" y1="15%" x2="75%" y2="30%" stroke="#818cf8" strokeWidth="1" />
            <line x1="75%" y1="30%" x2="70%" y2="55%" stroke="#818cf8" strokeWidth="1" />
            <line x1="70%" y1="55%" x2="85%" y2="65%" stroke="#818cf8" strokeWidth="1" />
            <line x1="45%" y1="70%" x2="70%" y2="55%" stroke="#818cf8" strokeWidth="0.5" />
            <line x1="85%" y1="25%" x2="75%" y2="30%" stroke="#818cf8" strokeWidth="0.5" />
            <circle cx="10%" cy="20%" r="3" fill="#818cf8" opacity="0.6" />
            <circle cx="30%" cy="35%" r="2.5" fill="#a5b4fc" opacity="0.5" />
            <circle cx="25%" cy="60%" r="2" fill="#818cf8" opacity="0.4" />
            <circle cx="45%" cy="70%" r="3" fill="#a5b4fc" opacity="0.6" />
            <circle cx="60%" cy="15%" r="2" fill="#818cf8" opacity="0.5" />
            <circle cx="75%" cy="30%" r="3.5" fill="#a5b4fc" opacity="0.6" />
            <circle cx="70%" cy="55%" r="2" fill="#818cf8" opacity="0.4" />
            <circle cx="85%" cy="65%" r="2.5" fill="#a5b4fc" opacity="0.5" />
          </svg>
        </div>

        {/* Large rotating observatory rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[600px] h-[600px] md:w-[800px] md:h-[800px]">
            <div className="absolute inset-0 rounded-full border border-indigo-400/8 animate-[spin_60s_linear_infinite]" />
            <div className="absolute inset-12 rounded-full border border-indigo-400/10 animate-[spin_45s_linear_infinite_reverse]" />
            <div className="absolute inset-24 rounded-full border border-indigo-400/12 animate-[spin_30s_linear_infinite]" />
            <div className="absolute inset-36 rounded-full border border-indigo-500/10 animate-[spin_50s_linear_infinite_reverse]" />
            <div className="absolute inset-48 rounded-full border border-indigo-500/15" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-indigo-400/40 shadow-[0_0_12px_rgba(129,140,248,0.4)]" />
            <div className="absolute bottom-[12%] right-[12%] w-2 h-2 rounded-full bg-violet-400/30 shadow-[0_0_10px_rgba(167,139,250,0.3)]" />
            <div className="absolute top-[30%] left-[5%] w-1.5 h-1.5 rounded-full bg-indigo-300/30" />
            <div className="absolute bottom-[25%] left-[15%] w-2 h-2 rounded-full bg-indigo-400/25" />
            <div className="absolute top-[15%] right-[20%] w-1 h-1 rounded-full bg-white/30" />
            <div className="absolute inset-[40%] rounded-full bg-indigo-500/8 blur-xl" />
          </div>
        </div>

        <div
          ref={mapRef}
          className={`relative z-10 text-center transition-all duration-1000 ${
            mapVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-indigo-400/40 mb-6">
            The fog clears
          </Eyebrow>
          <Heading level={2} size="h1" className="text-white">
            Now we see
            <br />
            <span className="text-indigo-300/60">everything.</span>
          </Heading>
          <Text size="sm" className="mt-6 text-white/25 max-w-sm mx-auto">
            Together, we map the terrain. Your market. Your audience. Your competition. Every path laid bare.
          </Text>
        </div>
      </section>

      {/* ════════ 5. SHAPING THE VISION — The disciplines we use to refine ════════ */}
      <section
        data-section="shape"
        className="relative w-full min-h-screen flex items-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0a0818] to-[#050505]" />

        <div
          ref={shapeRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            shapeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="mb-16 text-center">
            <Eyebrow className="text-indigo-400/40 mb-4">
              Refining the vision
            </Eyebrow>
            <Heading level={2} size="h1" className="text-white">
              From fog to compass bearing.
            </Heading>
            <Text size="sm" className="mt-4 text-white/20 max-w-md mx-auto">
              Five disciplines. Each one sharpens your dream into something you can act on.
            </Text>
          </div>

          {/* Discipline constellation */}
          <div className="max-w-5xl mx-auto">
            <div className="relative">
              <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <line x1="20%" y1="25%" x2="50%" y2="20%" stroke="#818cf8" strokeWidth="0.5" />
                <line x1="50%" y1="20%" x2="80%" y2="25%" stroke="#818cf8" strokeWidth="0.5" />
                <line x1="30%" y1="75%" x2="70%" y2="75%" stroke="#818cf8" strokeWidth="0.5" />
                <line x1="20%" y1="25%" x2="30%" y2="75%" stroke="#818cf8" strokeWidth="0.5" />
                <line x1="80%" y1="25%" x2="70%" y2="75%" stroke="#818cf8" strokeWidth="0.5" />
                <line x1="50%" y1="20%" x2="50%" y2="50%" stroke="#818cf8" strokeWidth="0.5" />
              </svg>

              <div className="grid grid-cols-3 gap-y-16 gap-x-8 md:gap-x-16 py-8">
                {disciplines.slice(0, 3).map((d) => {
                  const Icon = d.icon;
                  return (
                    <div key={d.realTitle} className="flex flex-col items-center text-center group">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-indigo-500/8 border border-indigo-500/15 flex items-center justify-center mb-5 group-hover:bg-indigo-500/15 group-hover:border-indigo-500/30 transition-all duration-500">
                        <Icon className="w-8 h-8 md:w-10 md:h-10 text-indigo-400/70 group-hover:text-indigo-400 transition-colors" />
                      </div>
                      <Heading level={3} className="text-white/80 mb-1">
                        {d.loreTitle}
                      </Heading>
                      <Mono className="text-[10px] text-indigo-400/40">
                        {'// '}{d.realTitle}
                      </Mono>
                    </div>
                  );
                })}

                <div className="col-start-1 col-end-4 flex justify-center gap-8 md:gap-32">
                  {disciplines.slice(3).map((d) => {
                    const Icon = d.icon;
                    return (
                      <div key={d.realTitle} className="flex flex-col items-center text-center group">
                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-indigo-500/8 border border-indigo-500/15 flex items-center justify-center mb-5 group-hover:bg-indigo-500/15 group-hover:border-indigo-500/30 transition-all duration-500">
                          <Icon className="w-8 h-8 md:w-10 md:h-10 text-indigo-400/70 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <Heading level={3} className="text-white/80 mb-1">
                          {d.loreTitle}
                        </Heading>
                        <Mono className="text-[10px] text-indigo-400/40">
                          {'// '}{d.realTitle}
                        </Mono>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ 6. FORGING THE PLAN — Tangible artifacts emerge ════════ */}
      <section
        data-section="forge"
        className="relative w-full min-h-screen flex items-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />

        <div
          ref={forgeRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            forgeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="text-center mb-16">
            <Eyebrow className="text-indigo-400/40 mb-4">
              The dream takes form
            </Eyebrow>
            <Heading level={2} size="h1" className="text-white">
              You leave with a plan.
            </Heading>
            <Text size="sm" className="mt-4 text-white/20 max-w-md mx-auto">
              Not just ideas. Tangible artifacts you can hold, share, and build from.
            </Text>
          </div>

          {/* Artifact cards with placeholder images */}
          <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
            {artifacts.map((artifact) => {
              const Icon = artifact.icon;
              return (
                <div key={artifact.realTitle} className="group">
                  <div className="relative overflow-hidden rounded-2xl border border-indigo-500/10 group-hover:border-indigo-500/25 transition-colors duration-500">
                    <div className="aspect-[4/5] w-full bg-gradient-to-br from-indigo-950/60 via-[#0c0a1a] to-violet-950/40 relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-full bg-indigo-500/8 flex items-center justify-center">
                            <Icon className="w-12 h-12 text-indigo-400/30 group-hover:text-indigo-400/50 transition-colors duration-500" />
                          </div>
                          <div className="absolute inset-0 rounded-full bg-indigo-500/5 blur-xl scale-150" />
                        </div>
                      </div>
                      <div className="absolute inset-0 opacity-[0.03]" style={{
                        backgroundImage: 'linear-gradient(rgba(129,140,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(129,140,248,0.3) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                      }} />
                      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#050505] to-transparent" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <Heading level={3} size="h3" className="text-white mb-1">
                        {artifact.loreTitle}
                      </Heading>
                      <Mono as="p" className="text-[11px] text-indigo-400/50 uppercase tracking-wider">
                        {artifact.realTitle}
                      </Mono>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════ 7. YOUR COMPANION — Echo amplifies the journey ════════ */}
      <section
        data-section="companion"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0a0818] to-[#050505]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(90deg, #818cf8 0px, transparent 1px, transparent 40px)`,
        }} />

        <div
          ref={companionRef}
          className={`relative z-10 flex flex-col items-center transition-all duration-1000 ${
            companionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-indigo-400/30 mb-8">
            You&apos;re never alone
          </Eyebrow>

          {/* Echo familiar visual */}
          <div className="relative w-[200px] h-[200px] md:w-[280px] md:h-[280px] mb-10">
            <div className="absolute inset-0 rounded-full border border-indigo-500/15 animate-[spin_20s_linear_infinite]" />
            <div className="absolute inset-4 rounded-full border border-indigo-500/20 animate-[spin_15s_linear_infinite_reverse]" />
            <div className="absolute inset-8 rounded-full border border-indigo-500/10" />
            <div className="absolute inset-12 rounded-full bg-indigo-500/8 flex items-center justify-center">
              <Sparkles className="w-16 h-16 md:w-20 md:h-20 text-indigo-400/60" />
            </div>
            <div className="absolute inset-12 rounded-full bg-indigo-400/10 animate-ping" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-indigo-300/50 shadow-[0_0_8px_rgba(129,140,248,0.4)]" />
            <div className="absolute bottom-[8%] right-[8%] w-1.5 h-1.5 rounded-full bg-indigo-400/40" />
            <div className="absolute top-[30%] left-[5%] w-1 h-1 rounded-full bg-indigo-300/30" />
            <div className="absolute -inset-8 rounded-full bg-indigo-500/5 blur-2xl" />
          </div>

          <Heading level={2} className="text-white text-center mb-2">
            Meet Echo.
          </Heading>
          <Text size="sm" className="text-indigo-300/30 max-w-sm text-center mb-6">
            Your AI familiar. While Vaelen guides the strategy, Echo crunches the data — surfacing insights that would take weeks to find alone.
          </Text>

          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {['Research Synthesis', 'Insight Clustering', 'Trend Detection', 'Strategy Simulation'].map((cap) => (
              <span key={cap} className="text-[10px] text-indigo-300/50 border border-indigo-500/15 rounded-full px-3 py-1.5 bg-indigo-500/5">
                {cap}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ 8. THE COMPASS POINTS FORWARD — CTA ════════ */}
      <section
        data-section="cta"
        className="relative w-full min-h-[70vh] flex items-center justify-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0e0c22] to-[#050505]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px]" />

        <div
          ref={ctaRef}
          className={`relative z-10 w-full text-center transition-all duration-1000 ${
            ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="relative w-16 h-16 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border border-indigo-400/30" />
            <div className="absolute inset-2 rounded-full border border-indigo-400/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Compass className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          <Heading level={2} size="h1" className="text-white mb-4">
            Your compass is set.
          </Heading>
          <Text size="lg" className="text-foreground/40 max-w-lg mx-auto mb-12">
            Every great thing starts as a conversation. Tell us what you&apos;re dreaming, and we&apos;ll help you find the path.
          </Text>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-3 rounded-full bg-indigo-600 hover:bg-indigo-500 px-10 py-4 text-lg font-bold text-white transition-all hover:scale-105 group"
            >
              Start the journey
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/design"
              className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 hover:border-indigo-500/60 px-8 py-4 text-sm font-semibold text-indigo-300/80 hover:text-indigo-300 transition-all"
            >
              Continue to the Forge
              <Swords className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════ 9. OTHER REALMS ════════ */}
      <section
        data-section="realms"
        className="relative w-full overflow-hidden py-24"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />

        <div className="relative z-10" style={SIDEBAR_PAD}>
          <Heading level={2} display={false} size="h3" className="mb-3 text-center text-foreground/40">
            The journey continues
          </Heading>
          <Text size="sm" className="text-center text-foreground/30 mb-10 max-w-md mx-auto">
            Dream is where it starts. Design and Develop are where it becomes real.
          </Text>
          <div className="max-w-3xl mx-auto grid gap-4 sm:grid-cols-2">
            {siblings.map((s) => (
              <Link key={s.href} href={s.href} className="group block">
                <GlassCard className="transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${s.color}15` }}
                    >
                      <Compass className="w-4 h-4" style={{ color: s.color }} />
                    </div>
                    <Heading level={3} display={false} size="sm" style={{ color: s.color }}>
                      {s.realm}
                    </Heading>
                  </div>
                  <p className="text-xs text-foreground/40">Guided by {s.mentor}</p>
                  <p className="text-xs text-foreground/30 mt-1 line-clamp-2">{s.loreBlurb.slice(0, 100)}...</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
