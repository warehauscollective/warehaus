'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Hammer,
  Flame,
  Layers,
  Palette,
  Sparkles,
  PenTool,
  ChevronDown,
  ArrowRight,
  Box,
  Compass,
  MonitorSmartphone,
  Play,
} from 'lucide-react';
import { GlassCard } from '@/components/react/ui/GlassCard';
import { ALL_SERVICES } from '@/lib/data/services';
import { useFadeIn } from '@/hooks/useFadeIn';
import { Heading, Text, Eyebrow, Mono } from '@/components/react/ui/typography';

/* ───────── Data ───────── */
const disciplines = [
  { icon: MonitorSmartphone, loreTitle: 'Shaping the Interface', realTitle: 'UI/UX Design' },
  { icon: Layers, loreTitle: 'Forging the System', realTitle: 'Design Systems' },
  { icon: Play, loreTitle: 'Breathing Life', realTitle: 'Prototyping & Motion' },
  { icon: Palette, loreTitle: 'The Brand Mark', realTitle: 'Brand Identity' },
  { icon: PenTool, loreTitle: 'Precision Craft', realTitle: 'Visual Design' },
];

const artifacts = [
  { icon: PenTool, loreTitle: 'Forge Blueprints', realTitle: 'Figma Files' },
  { icon: Play, loreTitle: 'Living Prototypes', realTitle: 'Interactive Prototypes' },
  { icon: Layers, loreTitle: 'The Anvil System', realTitle: 'Design Systems' },
  { icon: Palette, loreTitle: 'The Brand Sigil', realTitle: 'Brand Identities' },
];

const SIDEBAR_PAD = {
  paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 1rem)',
  paddingRight: 'calc(var(--right-sidebar-w, 0px) + 1rem)',
};

/* ───────── Component ───────── */
export function DesignContent() {
  const [rawRef, rawVisible] = useFadeIn();
  const [guideRef, guideVisible] = useFadeIn();
  const [forgeRef, forgeVisible] = useFadeIn();
  const [shapeRef, shapeVisible] = useFadeIn();
  const [artifactsRef, artifactsVisible] = useFadeIn();
  const [companionRef, companionVisible] = useFadeIn();
  const [ctaRef, ctaVisible] = useFadeIn();

  const siblings = ALL_SERVICES.filter((s) => s.href !== '/design');

  return (
    <div className="min-h-screen">

      {/* ════════ 1. THE SPARK — Vision needs form ════════ */}
      <section
        data-section="spark"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Warm forge background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#451a03_0%,_#1c0a00_40%,_#050505_80%)]" />
          {/* Ember particles */}
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: 'radial-gradient(#f97316 1px, transparent 1px)',
            backgroundSize: '100px 100px',
          }} />
          <div className="absolute inset-0 opacity-15" style={{
            backgroundImage: 'radial-gradient(#fbbf24 1px, transparent 1px)',
            backgroundSize: '180px 180px',
            backgroundPosition: '50px 50px',
          }} />
          {/* Heat glow */}
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-orange-900/10 to-transparent" />
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-600/8 blur-[120px]" />
        </div>

        {/* Anvil/hammer sigil — center visual */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[500px] h-[500px] md:w-[700px] md:h-[700px]">
            <div className="absolute inset-0 rounded-full bg-orange-500/3 blur-[80px]" />
            {/* Forge rings */}
            <div className="absolute inset-0 rounded-full border border-orange-300/8" />
            <div className="absolute inset-8 rounded-full border border-orange-400/10" />
            <div className="absolute inset-20 rounded-full border border-orange-400/8" />
            <div className="absolute inset-32 rounded-full border border-orange-500/6" />
            {/* Cross lines — the anvil axes */}
            <div className="absolute top-0 left-1/2 -translate-x-px w-px h-full bg-gradient-to-b from-orange-300/15 via-orange-400/8 to-orange-300/15" />
            <div className="absolute top-1/2 left-0 -translate-y-px w-full h-px bg-gradient-to-r from-orange-300/15 via-orange-400/8 to-orange-300/15" />
            {/* Center forge glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-orange-400/30 shadow-[0_0_40px_rgba(249,115,22,0.3)]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-300/80" />
            {/* Spark points */}
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-orange-300/40 animate-pulse" />
            <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400/30 animate-pulse [animation-delay:1s]" />
            <div className="absolute top-1/2 left-[8%] -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400/30 animate-pulse [animation-delay:0.5s]" />
            <div className="absolute top-1/2 right-[8%] -translate-y-1/2 w-1 h-1 rounded-full bg-amber-400/30 animate-pulse [animation-delay:1.5s]" />
            <div className="absolute top-[22%] right-[15%] w-1 h-1 rounded-full bg-orange-300/20 animate-pulse [animation-delay:0.3s]" />
            <div className="absolute bottom-[18%] left-[20%] w-1 h-1 rounded-full bg-orange-300/20 animate-pulse [animation-delay:0.8s]" />
            <div className="absolute top-[35%] left-[12%] w-0.5 h-0.5 rounded-full bg-amber-300/25 animate-pulse [animation-delay:2s]" />
          </div>
        </div>

        {/* Text overlay */}
        <div className="relative z-10 text-center" style={SIDEBAR_PAD}>
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-400/30 flex items-center justify-center">
              <Hammer className="w-4 h-4 text-orange-400" />
            </div>
            <Eyebrow as="span" className="text-orange-400">
              The Forge
            </Eyebrow>
          </div>

          <Heading level={1} size="display" className="text-white/90 mb-8">
            DESIGN.
          </Heading>

          <Text size="lg" className="text-white/40 max-w-lg mx-auto">
            You have a vision. Now it needs a form.
            <br className="hidden md:block" />
            <span className="text-white/25">Something people can see, touch, and feel.</span>
          </Text>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => document.querySelector('[data-section="raw"]')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center gap-2 text-orange-300/40 hover:text-orange-300/80 transition-colors"
          >
            <span className="text-[10px] tracking-[0.3em] uppercase">Enter the Forge</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ════════ 2. THE RAW MATERIAL — Ideas are unformed ════════ */}
      <section
        data-section="raw"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Dark, rough texture */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0d0805] to-[#050505]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(#f97316 1px, transparent 1px)',
          backgroundSize: '100px 100px',
        }} />
        {/* Scattered, chaotic sparks — representing unrefined ideas */}
        <div className="absolute top-1/4 left-1/5 w-[400px] h-[400px] rounded-full bg-orange-600/3 blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-amber-600/2 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-orange-500/2 blur-[130px]" />

        <div
          ref={rawRef}
          className={`relative z-10 text-center transition-all duration-[1500ms] ${
            rawVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-orange-400/30 mb-8">
            Raw material
          </Eyebrow>
          <Heading level={2} size="h1" className="text-white/70 max-w-2xl mx-auto mb-6">
            The strategy is set.
            <br />
            <span className="text-white/30">But it&apos;s still just words on a page.</span>
          </Heading>
          <Text size="lg" className="text-white/20 max-w-md mx-auto">
            Wireframes without soul. Mood boards that don&apos;t quite click. Ideas scattered across whiteboards and sticky notes. The raw material is there — it just needs a master&apos;s hand.
          </Text>
        </div>
      </section>

      {/* ════════ 3. THE SHAPER ARRIVES — Meet Korr ════════ */}
      <section
        data-section="guide"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        {/* Warm starfield — forge embers */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'radial-gradient(#f97316 1px, transparent 1px)',
          backgroundSize: '90px 90px',
        }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-600/5 blur-[100px]" />

        <div
          ref={guideRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            guideVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="flex flex-col items-center">
            {/* Korr portrait */}
            <div className="relative w-[260px] h-[340px] md:w-[320px] md:h-[420px] mb-10">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-orange-950/60 via-[#0d0805] to-orange-950/30 border border-orange-500/10 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Anvil/hammer visual */}
                  <div className="relative w-36 h-36 md:w-48 md:h-48">
                    <div className="absolute inset-0 rounded-2xl border border-orange-400/15 rotate-45" />
                    <div className="absolute inset-6 rounded-xl border border-orange-400/12 rotate-45" />
                    <div className="absolute inset-12 rounded-lg border border-orange-500/10 rotate-45" />
                    {/* Center forge flame */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-orange-400/40 shadow-[0_0_20px_rgba(249,115,22,0.3)]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-300/80" />
                    {/* Rising sparks */}
                    <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-300/50 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.3)]" />
                    <div className="absolute top-[25%] left-[35%] w-1 h-1 rounded-full bg-orange-300/40 animate-pulse [animation-delay:0.7s]" />
                    <div className="absolute top-[20%] right-[30%] w-1 h-1 rounded-full bg-amber-400/30 animate-pulse [animation-delay:1.2s]" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-orange-950/60 to-transparent" />
                {/* Ember dots */}
                <div className="absolute top-[12%] left-[18%] w-1 h-1 rounded-full bg-orange-300/20 animate-pulse [animation-delay:0.5s]" />
                <div className="absolute top-[22%] right-[15%] w-0.5 h-0.5 rounded-full bg-amber-300/30 animate-pulse [animation-delay:1s]" />
                <div className="absolute bottom-[35%] left-[22%] w-0.5 h-0.5 rounded-full bg-orange-200/20 animate-pulse [animation-delay:0.8s]" />
                <div className="absolute top-[40%] right-[12%] w-1 h-1 rounded-full bg-amber-400/25 animate-pulse [animation-delay:1.5s]" />
              </div>
              <div className="absolute -inset-8 rounded-[2rem] bg-orange-500/4 blur-2xl -z-10" />
            </div>

            <Eyebrow className="text-orange-400/30 mb-4">
              The master craftsman
            </Eyebrow>
            <Heading level={2} className="text-white text-center mb-3">
              Meet Korr
            </Heading>
            <Text size="sm" className="text-orange-300/30 italic max-w-sm text-center">
              The Shaper. He bends light and pixel with equal mastery — forging interfaces that feel alive and identities that burn into memory.
            </Text>
          </div>
        </div>
      </section>

      {/* ════════ 4. THE FORGE — Where raw becomes refined ════════ */}
      <section
        data-section="forge"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        {/* Warm, glowing background — the forge is lit */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#2d1400_0%,_#120800_50%,_#050505_100%)]" />
          {/* Forge sparks flying */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
            <line x1="15%" y1="25%" x2="35%" y2="40%" stroke="#f97316" strokeWidth="1" />
            <line x1="35%" y1="40%" x2="30%" y2="65%" stroke="#f97316" strokeWidth="1" />
            <line x1="30%" y1="65%" x2="50%" y2="75%" stroke="#f97316" strokeWidth="1" />
            <line x1="55%" y1="20%" x2="70%" y2="35%" stroke="#f97316" strokeWidth="1" />
            <line x1="70%" y1="35%" x2="65%" y2="60%" stroke="#f97316" strokeWidth="1" />
            <line x1="65%" y1="60%" x2="80%" y2="70%" stroke="#f97316" strokeWidth="1" />
            <line x1="50%" y1="75%" x2="65%" y2="60%" stroke="#f97316" strokeWidth="0.5" />
            <circle cx="15%" cy="25%" r="3" fill="#f97316" opacity="0.5" />
            <circle cx="35%" cy="40%" r="2.5" fill="#fbbf24" opacity="0.4" />
            <circle cx="30%" cy="65%" r="2" fill="#f97316" opacity="0.3" />
            <circle cx="50%" cy="75%" r="3" fill="#fbbf24" opacity="0.5" />
            <circle cx="55%" cy="20%" r="2" fill="#f97316" opacity="0.4" />
            <circle cx="70%" cy="35%" r="3.5" fill="#fbbf24" opacity="0.5" />
            <circle cx="65%" cy="60%" r="2" fill="#f97316" opacity="0.3" />
            <circle cx="80%" cy="70%" r="2.5" fill="#fbbf24" opacity="0.4" />
          </svg>
        </div>

        {/* Rotating forge rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[600px] h-[600px] md:w-[800px] md:h-[800px]">
            <div className="absolute inset-0 rounded-2xl border border-orange-400/6 rotate-12 animate-[spin_80s_linear_infinite]" />
            <div className="absolute inset-12 rounded-xl border border-orange-400/8 -rotate-6 animate-[spin_60s_linear_infinite_reverse]" />
            <div className="absolute inset-24 rounded-lg border border-orange-400/10 rotate-3 animate-[spin_45s_linear_infinite]" />
            <div className="absolute inset-36 rounded-md border border-orange-500/8 animate-[spin_70s_linear_infinite_reverse]" />
            <div className="absolute inset-48 rounded border border-orange-500/12" />
            {/* Forge heat nodes */}
            <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-orange-400/40 shadow-[0_0_12px_rgba(249,115,22,0.3)]" />
            <div className="absolute bottom-[15%] right-[15%] w-2 h-2 rounded-full bg-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.2)]" />
            <div className="absolute top-[35%] left-[8%] w-1.5 h-1.5 rounded-full bg-orange-300/25" />
            {/* Center forge glow */}
            <div className="absolute inset-[40%] rounded-full bg-orange-500/8 blur-xl" />
          </div>
        </div>

        <div
          ref={forgeRef}
          className={`relative z-10 text-center transition-all duration-1000 ${
            forgeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-orange-400/40 mb-6">
            The fire is lit
          </Eyebrow>
          <Heading level={2} size="h1" className="text-white">
            The Forge
            <br />
            <span className="text-orange-300/50">shapes everything.</span>
          </Heading>
          <Text size="sm" className="mt-6 text-white/25 max-w-sm mx-auto">
            This is where vision becomes visible. Rough ideas heated, hammered, and refined until they shine.
          </Text>
        </div>
      </section>

      {/* ════════ 5. THE DISCIPLINES — How we shape ════════ */}
      <section
        data-section="shape"
        className="relative w-full min-h-screen flex items-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0d0805] to-[#050505]" />

        <div
          ref={shapeRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            shapeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="mb-16 text-center">
            <Eyebrow className="text-orange-400/40 mb-4">
              The craft
            </Eyebrow>
            <Heading level={2} size="h1" className="text-white">
              Five ways we shape the fire.
            </Heading>
            <Text size="sm" className="mt-4 text-white/20 max-w-md mx-auto">
              Each discipline tempers your vision into something precise, beautiful, and built to last.
            </Text>
          </div>

          {/* Discipline constellation */}
          <div className="max-w-5xl mx-auto">
            <div className="relative">
              <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <line x1="20%" y1="25%" x2="50%" y2="20%" stroke="#f97316" strokeWidth="0.5" />
                <line x1="50%" y1="20%" x2="80%" y2="25%" stroke="#f97316" strokeWidth="0.5" />
                <line x1="30%" y1="75%" x2="70%" y2="75%" stroke="#f97316" strokeWidth="0.5" />
                <line x1="20%" y1="25%" x2="30%" y2="75%" stroke="#f97316" strokeWidth="0.5" />
                <line x1="80%" y1="25%" x2="70%" y2="75%" stroke="#f97316" strokeWidth="0.5" />
                <line x1="50%" y1="20%" x2="50%" y2="50%" stroke="#f97316" strokeWidth="0.5" />
              </svg>

              <div className="grid grid-cols-3 gap-y-16 gap-x-8 md:gap-x-16 py-8">
                {disciplines.slice(0, 3).map((d) => {
                  const Icon = d.icon;
                  return (
                    <div key={d.realTitle} className="flex flex-col items-center text-center group">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-orange-500/8 border border-orange-500/15 flex items-center justify-center mb-5 group-hover:bg-orange-500/15 group-hover:border-orange-500/30 transition-all duration-500">
                        <Icon className="w-8 h-8 md:w-10 md:h-10 text-orange-400/70 group-hover:text-orange-400 transition-colors" />
                      </div>
                      <Heading level={3} className="text-white/80 mb-1">
                        {d.loreTitle}
                      </Heading>
                      <Mono className="text-[10px] text-orange-400/40">
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
                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-orange-500/8 border border-orange-500/15 flex items-center justify-center mb-5 group-hover:bg-orange-500/15 group-hover:border-orange-500/30 transition-all duration-500">
                          <Icon className="w-8 h-8 md:w-10 md:h-10 text-orange-400/70 group-hover:text-orange-400 transition-colors" />
                        </div>
                        <Heading level={3} className="text-white/80 mb-1">
                          {d.loreTitle}
                        </Heading>
                        <Mono className="text-[10px] text-orange-400/40">
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

      {/* ════════ 6. THE ARTIFACTS — What you leave with ════════ */}
      <section
        data-section="artifacts"
        className="relative w-full min-h-screen flex items-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-[#050505]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />

        <div
          ref={artifactsRef}
          className={`relative z-10 w-full transition-all duration-1000 ${
            artifactsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="text-center mb-16">
            <Eyebrow className="text-orange-400/40 mb-4">
              Forged and finished
            </Eyebrow>
            <Heading level={2} size="h1" className="text-white">
              What you leave the Forge with.
            </Heading>
            <Text size="sm" className="mt-4 text-white/20 max-w-md mx-auto">
              Not concepts. Not promises. Tangible design artifacts, forged to precision.
            </Text>
          </div>

          {/* Artifact cards */}
          <div className="max-w-6xl mx-auto grid gap-6 sm:grid-cols-2 md:grid-cols-4">
            {artifacts.map((artifact) => {
              const Icon = artifact.icon;
              return (
                <div key={artifact.realTitle} className="group">
                  <div className="relative overflow-hidden rounded-2xl border border-orange-500/10 group-hover:border-orange-500/25 transition-colors duration-500">
                    <div className="aspect-[3/4] w-full bg-gradient-to-br from-orange-950/50 via-[#0d0805] to-amber-950/30 relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full bg-orange-500/8 flex items-center justify-center">
                            <Icon className="w-10 h-10 text-orange-400/30 group-hover:text-orange-400/50 transition-colors duration-500" />
                          </div>
                          <div className="absolute inset-0 rounded-full bg-orange-500/5 blur-xl scale-150" />
                        </div>
                      </div>
                      <div className="absolute inset-0 opacity-[0.03]" style={{
                        backgroundImage: 'linear-gradient(rgba(249,115,22,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.3) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                      }} />
                      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#050505] to-transparent" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <Heading level={3} size="h3" className="text-white mb-1">
                        {artifact.loreTitle}
                      </Heading>
                      <Mono as="p" className="text-[10px] text-orange-400/50 uppercase tracking-wider">
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

      {/* ════════ 7. YOUR COMPANION — Flint, the AI familiar ════════ */}
      <section
        data-section="companion"
        className="relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#0d0805] to-[#050505]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(90deg, #f97316 0px, transparent 1px, transparent 40px)`,
        }} />

        <div
          ref={companionRef}
          className={`relative z-10 flex flex-col items-center transition-all duration-1000 ${
            companionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <Eyebrow className="text-orange-400/30 mb-8">
            Your forge companion
          </Eyebrow>

          {/* Flint familiar visual */}
          <div className="relative w-[200px] h-[200px] md:w-[280px] md:h-[280px] mb-10">
            <div className="absolute inset-0 rounded-2xl border border-orange-500/15 rotate-45 animate-[spin_25s_linear_infinite]" />
            <div className="absolute inset-4 rounded-xl border border-orange-500/20 rotate-45 animate-[spin_18s_linear_infinite_reverse]" />
            <div className="absolute inset-8 rounded-lg border border-orange-500/10 rotate-45" />
            <div className="absolute inset-12 rounded-full bg-orange-500/8 flex items-center justify-center">
              <Flame className="w-16 h-16 md:w-20 md:h-20 text-orange-400/60" />
            </div>
            <div className="absolute inset-12 rounded-full bg-orange-400/10 animate-ping" />
            {/* Spark dots */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-orange-300/50 shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
            <div className="absolute bottom-[8%] right-[8%] w-1.5 h-1.5 rounded-full bg-amber-400/40" />
            <div className="absolute top-[30%] left-[5%] w-1 h-1 rounded-full bg-orange-300/30" />
            <div className="absolute -inset-8 rounded-full bg-orange-500/4 blur-2xl" />
          </div>

          <Heading level={2} className="text-white text-center mb-2">
            Meet Flint.
          </Heading>
          <Text size="sm" className="text-orange-300/30 max-w-sm text-center mb-6">
            Your AI familiar. Flint accelerates iteration — generating variations, checking accessibility, and keeping every artboard consistent while you focus on the craft.
          </Text>

          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {['Rapid Iteration', 'Accessibility Checks', 'Design Consistency', 'Asset Generation'].map((cap) => (
              <span key={cap} className="text-[10px] text-orange-300/50 border border-orange-500/15 rounded-full px-3 py-1.5 bg-orange-500/5">
                {cap}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ 8. CTA — Step into the Forge ════════ */}
      <section
        data-section="cta"
        className="relative w-full min-h-[70vh] flex items-center justify-center overflow-hidden py-32"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#1a0800] to-[#050505]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-orange-500/5 blur-[120px]" />

        <div
          ref={ctaRef}
          className={`relative z-10 w-full text-center transition-all duration-1000 ${
            ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={SIDEBAR_PAD}
        >
          <div className="relative w-16 h-16 mx-auto mb-8">
            <div className="absolute inset-0 rounded-xl border border-orange-400/30 rotate-45" />
            <div className="absolute inset-2 rounded-lg border border-orange-400/20 rotate-45" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Hammer className="w-8 h-8 text-orange-400" />
            </div>
          </div>
          <Heading level={2} size="h1" className="text-white mb-4">
            The Forge is ready.
          </Heading>
          <Text size="lg" className="text-foreground/40 max-w-lg mx-auto mb-12">
            Bring your vision. Korr will shape it into something people can&apos;t look away from.
          </Text>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-3 rounded-full bg-orange-600 hover:bg-orange-500 px-10 py-4 text-lg font-bold text-white transition-all hover:scale-105 group"
            >
              Enter the Forge
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/develop"
              className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 hover:border-orange-500/60 px-8 py-4 text-sm font-semibold text-orange-300/80 hover:text-orange-300 transition-all"
            >
              Ascend the Tower
              <Box className="w-4 h-4" />
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
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />

        <div className="relative z-10" style={SIDEBAR_PAD}>
          <Heading level={2} display={false} size="h3" className="mb-3 text-center text-foreground/40">
            The journey continues
          </Heading>
          <Text size="sm" className="text-center text-foreground/30 mb-10 max-w-md mx-auto">
            Design is where vision becomes form. But the journey doesn&apos;t end here.
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
