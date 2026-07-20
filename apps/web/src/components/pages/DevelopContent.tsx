'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Code2,
  Compass,
  Globe,
  Smartphone,
  ShoppingCart,
  Bot,
  Cable,
  ChevronDown,
  ArrowRight,
  Zap,
  Hammer,
} from 'lucide-react';
import { GlassCard } from '@/components/react/ui/GlassCard';
import { ALL_SERVICES } from '@/lib/data/services';
import { useFadeIn } from '@/hooks/useFadeIn';
import { Heading, Text, Eyebrow, Mono } from '@/components/react/ui/typography';

/* ───────── Data ───────── */
const disciplines = [
  { icon: Globe, loreTitle: 'Raising the Walls', realTitle: 'Web Development' },
  { icon: Smartphone, loreTitle: 'The Pocket Towers', realTitle: 'App Development' },
  { icon: ShoppingCart, loreTitle: 'The Merchant Gates', realTitle: 'E-commerce' },
  { icon: Bot, loreTitle: 'Binding the Constructs', realTitle: 'AI Automation' },
  { icon: Cable, loreTitle: 'The Flowing Channels', realTitle: 'API Integration' },
];

const artifacts = [
  { icon: Globe, loreTitle: 'Living Architecture', realTitle: 'Websites & Web Apps' },
  { icon: Smartphone, loreTitle: 'Pocket Strongholds', realTitle: 'Mobile Applications' },
  { icon: ShoppingCart, loreTitle: 'Merchant Fortresses', realTitle: 'E-commerce Stores' },
  { icon: Bot, loreTitle: 'Bound Constructs', realTitle: 'AI Workflows' },
  { icon: Cable, loreTitle: 'The Water Channels', realTitle: 'API Integrations' },
];

const SIDEBAR_PAD = {
  paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 1rem)',
  paddingRight: 'calc(var(--right-sidebar-w, 0px) + 1rem)',
};

/* ───────── Component ───────── */
export function DevelopContent() {
  const [blueprintRef, blueprintVisible] = useFadeIn();
  const [guideRef, guideVisible] = useFadeIn();
  const [towerRef, towerVisible] = useFadeIn();
  const [shapeRef, shapeVisible] = useFadeIn();
  const [artifactsRef, artifactsVisible] = useFadeIn();
  const [companionRef, companionVisible] = useFadeIn();
  const [ctaRef, ctaVisible] = useFadeIn();

  const siblings = ALL_SERVICES.filter((s) => s.href !== '/develop');

  return (
    <div className="min-h-screen">

      {/* ════════ 1. THE SPARK — Designs are ready, now build ════════ */}
      <section
        data-section="spark"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Golden tower background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#052e16_0%,_#0a1a0f_40%,_#050505_80%)]" />
          {/* Circuit-like grid */}
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: 'linear-gradient(rgba(16,185,129,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.15) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'linear-gradient(rgba(16,185,129,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.1) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }} />
          {/* Upward glow — tower base */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[600px] bg-gradient-to-t from-emerald-600/8 to-transparent" />
        </div>

        {/* Tower sigil — vertical structure */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[300px] h-[600px] md:w-[400px] md:h-[700px]">
            <div className="absolute inset-0 rounded-sm bg-emerald-500/3 blur-[60px]" />
            {/* Tower structure — vertical lines */}
            <div className="absolute left-[20%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-400/12 to-emerald-300/8" />
            <div className="absolute left-[40%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-400/10 to-emerald-300/6" />
            <div className="absolute left-[60%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-400/10 to-emerald-300/6" />
            <div className="absolute left-[80%] top-0 w-px h-full bg-gradient-to-b from-transparent via-emerald-400/12 to-emerald-300/8" />
            {/* Horizontal floors */}
            <div className="absolute top-[15%] left-0 w-full h-px bg-emerald-400/8" />
            <div className="absolute top-[30%] left-[10%] w-[80%] h-px bg-emerald-400/10" />
            <div className="absolute top-[45%] left-[15%] w-[70%] h-px bg-emerald-400/12" />
            <div className="absolute top-[60%] left-[10%] w-[80%] h-px bg-emerald-400/10" />
            <div className="absolute top-[75%] left-[5%] w-[90%] h-px bg-emerald-400/8" />
            <div className="absolute top-[90%] left-0 w-full h-px bg-emerald-400/6" />
            {/* Pinnacle glow */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-300/50 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]" />
            <div className="absolute -top-10 left-1/2 -translate-x-px w-px h-10 bg-gradient-to-t from-emerald-300/30 to-transparent" />
            {/* Node points at intersections */}
            <div className="absolute top-[30%] left-[40%] w-1.5 h-1.5 rounded-full bg-emerald-400/30 animate-pulse [animation-delay:0.3s]" />
            <div className="absolute top-[45%] left-[60%] w-1.5 h-1.5 rounded-full bg-emerald-300/25 animate-pulse [animation-delay:0.8s]" />
            <div className="absolute top-[60%] left-[40%] w-1 h-1 rounded-full bg-emerald-400/20 animate-pulse [animation-delay:1.2s]" />
            <div className="absolute top-[15%] left-[80%] w-1 h-1 rounded-full bg-green-300/30 animate-pulse [animation-delay:0.5s]" />
            <div className="absolute top-[75%] left-[20%] w-1 h-1 rounded-full bg-emerald-300/20 animate-pulse [animation-delay:1.5s]" />
          </div>
        </div>

        {/* Text overlay */}
        <div className="relative z-10 text-center" style={SIDEBAR_PAD}>
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-sm bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-emerald-400" />
            </div>
            <Eyebrow as="span" className="text-emerald-400">
              The High Tower
            </Eyebrow>
          </div>

          <Heading level={1} size="display" className="text-white/90 mb-8">
            DEVELOP.
          </Heading>

          <Text size="lg" className="text-white/40 max-w-lg mx-auto">
            The blueprints are drawn. The designs are forged.
            <br className="hidden md:block" />
            <span className="text-white/25">Now we build something that lives.</span>
          </Text>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => document.querySelector('[data-section="blueprint"]')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center gap-2 text-emerald-300/40 hover:text-emerald-300/80 transition-colors"
          >
            <span className="text-[10px] tracking-[0.3em] uppercase">Ascend the Tower</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ════════ 2. THE BLUEPRINT — Beautiful but static ════════ */}
      <section
        data-section="blueprint"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0a120d] to-[#050505]" />
        {/* Faint blueprint grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(16,185,129,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.2) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[400px] rounded-full bg-emerald-600/3 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-green-600/2 blur-[100px]" />

        <div
          ref={blueprintRef}
          className={`relative z-10 text-center transition-all duration-[1500ms] ${
            blueprintVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-emerald-400/30 mb-8">
            The gap
          </Eyebrow>
          <Heading level={2} size="h1" className="text-white/70 max-w-2xl mx-auto mb-6">
            Pixel-perfect designs.
            <br />
            <span className="text-white/30">That don&apos;t do anything yet.</span>
          </Heading>
          <Text size="lg" className="text-white/20 max-w-md mx-auto">
            Figma files that look incredible but can&apos;t handle a click. Prototypes that fake it. The gap between what it looks like and what it does — that&apos;s the chasm the Tower bridges.
          </Text>
        </div>
      </section>

      {/* ════════ 3. THE ARCHITECTS — Meet Cirion & The Council ════════ */}
      <section
        data-section="guide"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute inset-0 opacity-[0.05]" style={{
          backgroundImage: 'linear-gradient(rgba(16,185,129,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.15) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-emerald-600/4 blur-[100px]" />

        <div
          ref={guideRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            guideVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="flex flex-col items-center">
            {/* Cirion portrait — tower/architectural visual */}
            <div className="relative w-[260px] h-[340px] md:w-[320px] md:h-[420px] mb-10">
              <div className="absolute inset-0 rounded-sm bg-gradient-to-b from-emerald-950/50 via-[#0a120d] to-emerald-950/25 border border-emerald-500/10 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Tower/spire visual */}
                  <div className="relative w-32 h-48 md:w-40 md:h-56">
                    {/* Vertical tower lines */}
                    <div className="absolute left-[25%] top-0 w-px h-full bg-emerald-400/20" />
                    <div className="absolute left-[50%] top-0 w-px h-full bg-emerald-400/15" />
                    <div className="absolute left-[75%] top-0 w-px h-full bg-emerald-400/20" />
                    {/* Horizontal spans */}
                    <div className="absolute top-[20%] left-[15%] w-[70%] h-px bg-emerald-400/15" />
                    <div className="absolute top-[40%] left-[10%] w-[80%] h-px bg-emerald-400/12" />
                    <div className="absolute top-[60%] left-[5%] w-[90%] h-px bg-emerald-400/10" />
                    <div className="absolute top-[80%] left-0 w-full h-px bg-emerald-400/8" />
                    {/* Pinnacle */}
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-300/60 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.3)]" />
                    {/* Node lights */}
                    <div className="absolute top-[20%] left-[25%] w-1.5 h-1.5 rounded-full bg-emerald-400/30 animate-pulse [animation-delay:0.3s]" />
                    <div className="absolute top-[40%] left-[75%] w-1 h-1 rounded-full bg-emerald-300/25 animate-pulse [animation-delay:0.8s]" />
                    <div className="absolute top-[60%] left-[50%] w-1.5 h-1.5 rounded-full bg-green-400/20 animate-pulse [animation-delay:1.2s]" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-emerald-950/50 to-transparent" />
                {/* Ambient particles */}
                <div className="absolute top-[12%] left-[18%] w-1 h-1 rounded-full bg-emerald-300/15 animate-pulse [animation-delay:0.5s]" />
                <div className="absolute top-[25%] right-[15%] w-0.5 h-0.5 rounded-full bg-green-300/25 animate-pulse [animation-delay:1s]" />
                <div className="absolute bottom-[38%] left-[22%] w-0.5 h-0.5 rounded-full bg-emerald-200/15 animate-pulse [animation-delay:0.8s]" />
                <div className="absolute top-[42%] right-[12%] w-1 h-1 rounded-full bg-green-400/20 animate-pulse [animation-delay:1.5s]" />
              </div>
              <div className="absolute -inset-8 rounded-sm bg-emerald-500/3 blur-2xl -z-10" />
            </div>

            <Eyebrow className="text-emerald-400/30 mb-4">
              The master architects
            </Eyebrow>
            <Heading level={2} className="text-white text-center mb-3">
              Cirion & The Council
            </Heading>
            <Text size="sm" className="text-emerald-300/30 italic max-w-sm text-center">
              The Council of Architects. They transform blueprints into living systems — code forged with intent and tempered by performance.
            </Text>
          </div>
        </div>
      </section>

      {/* ════════ 4. THE HIGH TOWER — Where code becomes architecture ════════ */}
      <section
        data-section="tower"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#0a1a0f_0%,_#0a120d_50%,_#050505_100%)]" />
          {/* Data flow lines — code running through the tower */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
            {/* Vertical data streams */}
            <line x1="20%" y1="0%" x2="20%" y2="100%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="40%" y1="0%" x2="40%" y2="100%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="60%" y1="0%" x2="60%" y2="100%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="80%" y1="0%" x2="80%" y2="100%" stroke="#10b981" strokeWidth="0.5" />
            {/* Horizontal connections */}
            <line x1="20%" y1="25%" x2="40%" y2="25%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="40%" y1="25%" x2="60%" y2="40%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="60%" y1="40%" x2="80%" y2="35%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="20%" y1="60%" x2="40%" y2="55%" stroke="#10b981" strokeWidth="0.5" />
            <line x1="60%" y1="70%" x2="80%" y2="65%" stroke="#10b981" strokeWidth="0.5" />
            {/* Node points */}
            <circle cx="20%" cy="25%" r="2.5" fill="#10b981" opacity="0.4" />
            <circle cx="40%" cy="25%" r="2" fill="#34d399" opacity="0.3" />
            <circle cx="60%" cy="40%" r="3" fill="#10b981" opacity="0.5" />
            <circle cx="80%" cy="35%" r="2" fill="#34d399" opacity="0.4" />
            <circle cx="20%" cy="60%" r="2" fill="#10b981" opacity="0.3" />
            <circle cx="40%" cy="55%" r="2.5" fill="#34d399" opacity="0.4" />
            <circle cx="60%" cy="70%" r="2" fill="#10b981" opacity="0.3" />
            <circle cx="80%" cy="65%" r="3" fill="#34d399" opacity="0.5" />
          </svg>
        </div>

        {/* Tower structure — rising architecture */}
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none pb-20">
          <div className="relative w-[500px] h-[500px] md:w-[700px] md:h-[600px]">
            {/* Ascending horizontal platforms */}
            <div className="absolute bottom-0 left-[5%] w-[90%] h-px bg-emerald-400/15" />
            <div className="absolute bottom-[15%] left-[10%] w-[80%] h-px bg-emerald-400/12" />
            <div className="absolute bottom-[30%] left-[15%] w-[70%] h-px bg-emerald-400/10" />
            <div className="absolute bottom-[45%] left-[20%] w-[60%] h-px bg-emerald-400/10" />
            <div className="absolute bottom-[60%] left-[25%] w-[50%] h-px bg-emerald-400/8" />
            <div className="absolute bottom-[75%] left-[30%] w-[40%] h-px bg-emerald-400/6" />
            <div className="absolute bottom-[90%] left-[38%] w-[24%] h-px bg-emerald-400/5" />
            {/* Vertical columns */}
            <div className="absolute bottom-0 left-[10%] w-px h-[85%] bg-gradient-to-t from-emerald-400/12 to-transparent" />
            <div className="absolute bottom-0 left-[30%] w-px h-[75%] bg-gradient-to-t from-emerald-400/10 to-transparent" />
            <div className="absolute bottom-0 left-[50%] w-px h-[95%] bg-gradient-to-t from-emerald-400/15 to-transparent" />
            <div className="absolute bottom-0 left-[70%] w-px h-[75%] bg-gradient-to-t from-emerald-400/10 to-transparent" />
            <div className="absolute bottom-0 left-[90%] w-px h-[85%] bg-gradient-to-t from-emerald-400/12 to-transparent" />
            {/* Pinnacle glow */}
            <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-300/40 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
          </div>
        </div>

        <div
          ref={towerRef}
          className={`relative z-10 text-center transition-all duration-1000 ${
            towerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-emerald-400/40 mb-6">
            Construction begins
          </Eyebrow>
          <Heading level={2} size="h1" className="text-white">
            The Tower
            <br />
            <span className="text-emerald-300/50">rises.</span>
          </Heading>
          <Text size="sm" className="mt-6 text-white/25 max-w-sm mx-auto">
            Where designs become living systems. Every line of code laid with intent. Every component engineered to perform.
          </Text>
        </div>
      </section>

      {/* ════════ 5. THE DISCIPLINES — How we build ════════ */}
      <section
        data-section="shape"
        className="relative w-full min-h-screen flex items-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0a120d] to-[#050505]" />

        <div
          ref={shapeRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            shapeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="mb-16 text-center">
            <Eyebrow className="text-emerald-400/40 mb-4">
              The architecture
            </Eyebrow>
            <Heading level={2} size="h1" className="text-white">
              Five pillars of the Tower.
            </Heading>
            <Text size="sm" className="mt-4 text-white/20 max-w-md mx-auto">
              Each discipline builds a layer of your product. Together, they create something that stands.
            </Text>
          </div>

          {/* Discipline constellation — vertical tower arrangement */}
          <div className="max-w-5xl mx-auto">
            <div className="relative">
              <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <line x1="20%" y1="25%" x2="50%" y2="20%" stroke="#10b981" strokeWidth="0.5" />
                <line x1="50%" y1="20%" x2="80%" y2="25%" stroke="#10b981" strokeWidth="0.5" />
                <line x1="30%" y1="75%" x2="70%" y2="75%" stroke="#10b981" strokeWidth="0.5" />
                <line x1="20%" y1="25%" x2="30%" y2="75%" stroke="#10b981" strokeWidth="0.5" />
                <line x1="80%" y1="25%" x2="70%" y2="75%" stroke="#10b981" strokeWidth="0.5" />
                <line x1="50%" y1="20%" x2="50%" y2="50%" stroke="#10b981" strokeWidth="0.5" />
              </svg>

              <div className="grid grid-cols-3 gap-y-16 gap-x-8 md:gap-x-16 py-8">
                {disciplines.slice(0, 3).map((d) => {
                  const Icon = d.icon;
                  return (
                    <div key={d.realTitle} className="flex flex-col items-center text-center group">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-sm bg-emerald-500/8 border border-emerald-500/15 flex items-center justify-center mb-5 group-hover:bg-emerald-500/15 group-hover:border-emerald-500/30 transition-all duration-500">
                        <Icon className="w-8 h-8 md:w-10 md:h-10 text-emerald-400/70 group-hover:text-emerald-400 transition-colors" />
                      </div>
                      <Heading level={3} className="text-white/80 mb-1">
                        {d.loreTitle}
                      </Heading>
                      <Mono className="text-[10px] text-emerald-400/40">
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
                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-sm bg-emerald-500/8 border border-emerald-500/15 flex items-center justify-center mb-5 group-hover:bg-emerald-500/15 group-hover:border-emerald-500/30 transition-all duration-500">
                          <Icon className="w-8 h-8 md:w-10 md:h-10 text-emerald-400/70 group-hover:text-emerald-400 transition-colors" />
                        </div>
                        <Heading level={3} className="text-white/80 mb-1">
                          {d.loreTitle}
                        </Heading>
                        <Mono className="text-[10px] text-emerald-400/40">
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

      {/* ════════ 6. THE ARTIFACTS — What you launch with ════════ */}
      <section
        data-section="artifacts"
        className="relative w-full min-h-screen flex items-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

        <div
          ref={artifactsRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            artifactsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="text-center mb-16">
            <Eyebrow className="text-emerald-400/40 mb-4">
              Built and launched
            </Eyebrow>
            <Heading level={2} size="h1" className="text-white">
              What you launch with.
            </Heading>
            <Text size="sm" className="mt-4 text-white/20 max-w-md mx-auto">
              Not prototypes. Not demos. Production systems that handle real users, real traffic, and real business.
            </Text>
          </div>

          {/* Artifact cards */}
          <div className="max-w-6xl mx-auto grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {artifacts.map((artifact) => {
              const Icon = artifact.icon;
              return (
                <div key={artifact.realTitle} className="group">
                  <div className="relative overflow-hidden rounded-sm border border-emerald-500/10 group-hover:border-emerald-500/25 transition-colors duration-500">
                    <div className="aspect-[3/4] w-full bg-gradient-to-br from-emerald-950/40 via-[#0a120d] to-green-950/25 relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-sm bg-emerald-500/8 flex items-center justify-center">
                            <Icon className="w-8 h-8 text-emerald-400/30 group-hover:text-emerald-400/50 transition-colors duration-500" />
                          </div>
                          <div className="absolute inset-0 rounded-sm bg-emerald-500/5 blur-xl scale-150" />
                        </div>
                      </div>
                      <div className="absolute inset-0 opacity-[0.03]" style={{
                        backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)',
                        backgroundSize: '30px 30px',
                      }} />
                      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#050505] to-transparent" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <Heading level={3} size="h3" className="text-white mb-1">
                        {artifact.loreTitle}
                      </Heading>
                      <Mono as="p" className="text-[9px] text-emerald-400/50 uppercase tracking-wider">
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

      {/* ════════ 7. YOUR COMPANION — Axiom, the AI familiar ════════ */}
      <section
        data-section="companion"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0a120d] to-[#050505]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(90deg, #10b981 0px, transparent 1px, transparent 40px)`,
        }} />

        <div
          ref={companionRef}
          className={`relative z-10 flex flex-col items-center transition-all duration-1000 ${
            companionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-emerald-400/30 mb-8">
            Your tower guardian
          </Eyebrow>

          {/* Axiom familiar visual — angular/architectural */}
          <div className="relative w-[200px] h-[200px] md:w-[280px] md:h-[280px] mb-10">
            <div className="absolute inset-0 rounded-sm border border-emerald-500/15 animate-[spin_30s_linear_infinite]" />
            <div className="absolute inset-4 rounded-sm border border-emerald-500/20 animate-[spin_22s_linear_infinite_reverse]" />
            <div className="absolute inset-8 rounded-sm border border-emerald-500/10" />
            <div className="absolute inset-12 rounded-full bg-emerald-500/8 flex items-center justify-center">
              <Code2 className="w-16 h-16 md:w-20 md:h-20 text-emerald-400/60" />
            </div>
            <div className="absolute inset-12 rounded-full bg-emerald-400/10 animate-ping" />
            {/* Data nodes */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-300/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <div className="absolute bottom-[8%] right-[8%] w-1.5 h-1.5 rounded-full bg-green-400/40" />
            <div className="absolute top-[30%] left-[5%] w-1 h-1 rounded-full bg-emerald-300/30" />
            <div className="absolute -inset-8 rounded-full bg-emerald-500/4 blur-2xl" />
          </div>

          <Heading level={2} className="text-white text-center mb-2">
            Meet Axiom.
          </Heading>
          <Text size="sm" className="text-emerald-300/30 max-w-sm text-center mb-6">
            Your AI familiar. Axiom writes tests, catches bugs before they ship, and optimizes performance — a tireless guardian watching every build.
          </Text>

          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {['Automated Testing', 'Bug Detection', 'Performance Tuning', 'Code Review', 'CI/CD Ops'].map((cap) => (
              <span key={cap} className="text-[10px] text-emerald-300/50 border border-emerald-500/15 rounded-full px-3 py-1.5 bg-emerald-500/5">
                {cap}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ 8. CTA — Ascend the Tower ════════ */}
      <section
        data-section="cta"
        className="relative w-full min-h-[70vh] flex items-center justify-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0d1a12] to-[#050505]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[120px]" />

        <div
          ref={ctaRef}
          className={`relative z-10 w-full text-center transition-all duration-1000 ${
            ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="relative w-16 h-16 mx-auto mb-8">
            <div className="absolute inset-0 rounded-sm border border-emerald-400/30" />
            <div className="absolute inset-2 rounded-sm border border-emerald-400/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Building2 className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <Heading level={2} size="h1" className="text-white mb-4">
            The Tower awaits.
          </Heading>
          <Text size="lg" className="text-foreground/40 max-w-lg mx-auto mb-12">
            Bring your designs. The Council will build something that performs as good as it looks.
          </Text>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-3 rounded-full bg-emerald-600 hover:bg-emerald-500 px-10 py-4 text-lg font-bold text-white transition-all hover:scale-105 group"
            >
              Ascend the Tower
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/dream"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 hover:border-emerald-500/60 px-8 py-4 text-sm font-semibold text-emerald-300/80 hover:text-emerald-300 transition-all"
            >
              Back to the Dream
              <Compass className="w-4 h-4" />
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
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

        <div className="relative z-10" style={SIDEBAR_PAD}>
          <Heading level={2} display={false} size="h3" className="mb-3 text-center text-foreground/40">
            The journey continues
          </Heading>
          <Text size="sm" className="text-center text-foreground/30 mb-10 max-w-md mx-auto">
            Develop is where it all becomes real. But every tower needs a dream and a design.
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
