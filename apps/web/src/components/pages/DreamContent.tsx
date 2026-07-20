'use client';

import type { CSSProperties, ReactNode } from 'react';
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
import { ALL_SERVICES } from '@/lib/data/services';
import { useFadeIn } from '@/hooks/useFadeIn';
import { Heading, Text, Eyebrow, Mono } from '@/components/react/ui/typography';
import { DAY_VARS } from '@/components/pages/dream/scene';

/* ───────── Data ───────── */
const disciplines = [
  { icon: Eye, loreTitle: 'Rune Reading', realTitle: 'Brand Strategy' },
  { icon: Map, loreTitle: 'Cartography of Kingdoms', realTitle: 'Market Research' },
  { icon: Telescope, loreTitle: 'Summoning the North Star', realTitle: 'Product Visioning' },
  { icon: ScrollText, loreTitle: 'Whisper Inscription', realTitle: 'Content Strategy' },
  { icon: Star, loreTitle: 'Starlight Projection', realTitle: 'Creative Direction' },
];

const artifacts = [
  { icon: BookOpen, loreTitle: 'Grimoire of House Symbols', realTitle: 'Brand Style Guides', stat: '12 plates' },
  { icon: Orbit, loreTitle: 'Star Maps of Becoming', realTitle: 'Product Roadmaps', stat: '4 horizons' },
  { icon: Sparkles, loreTitle: 'Whisper Keys', realTitle: 'Naming & Messaging', stat: '∞ variants' },
];

const traits = [
  { k: 'Pathfinder’s Atlas', v: 'Holographic maps that rewrite with every decision.' },
  { k: 'Shadow Compass', v: 'Points toward futures aligned with your vision.' },
  { k: 'Echo', v: 'Her spectral AI familiar — signal from the noise.' },
];

const VAELEN = '/Characters/Dream%20-%20Character@2x.png';
const PAD = { paddingLeft: 'clamp(1.25rem, 5vw, 4rem)', paddingRight: 'clamp(1.25rem, 5vw, 4rem)' };

/* ───────── Glyphs ───────── */
function Saturn({ size = 13, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} aria-hidden>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="11" ry="4" stroke="currentColor" strokeWidth="1.1" transform="rotate(-22 12 12)" />
    </svg>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2"
      style={{ padding: '0.42rem 0.8rem', borderRadius: 999, border: '1px solid var(--line)', background: 'color-mix(in oklab, var(--panel) 70%, transparent)', backdropFilter: 'blur(6px)' }}
    >
      <Saturn style={{ color: 'var(--indigo-ink)' }} />
      <Mono style={{ fontSize: '0.66rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>{children}</Mono>
    </span>
  );
}

/* ───────── Component ───────── */
export function DreamContent() {
  const vars = DAY_VARS;

  const [fogRef, fogVisible] = useFadeIn();
  const [guideRef, guideVisible] = useFadeIn();
  const [mapRef, mapVisible] = useFadeIn();
  const [shapeRef, shapeVisible] = useFadeIn();
  const [forgeRef, forgeVisible] = useFadeIn();
  const [companionRef, companionVisible] = useFadeIn();
  const [ctaRef, ctaVisible] = useFadeIn();

  const siblings = ALL_SERVICES.filter((s) => s.href !== '/dream');

  return (
    <div
      style={{ ...vars, background: 'var(--paper)', color: 'var(--ink)', transition: 'background-color 900ms ease, color 900ms ease' }}
      className="relative min-h-screen"
    >
      {/* ════════ 1. THE SPARK — hero ════════ */}
      <section data-section="spark" className="relative w-full min-h-[100svh] overflow-hidden">
        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between gap-3" style={{ ...PAD, paddingTop: 'clamp(5rem, 11vh, 7rem)' }}>
          <Pill>The Navigator Realm</Pill>
        </div>

        {/* Headline over the sky */}
        <div className="relative z-10 mx-auto max-w-3xl text-center" style={{ ...PAD, marginTop: 'clamp(1.5rem, 5vh, 3.5rem)' }}>
          <span className="font-display" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 'clamp(1rem,2.4vw,1.4rem)', letterSpacing: '0.02em', color: 'var(--ink-2)' }}>
            Build your
          </span>
          <Heading level={1} size="display" className="mt-1" style={{ color: 'var(--ink)' }}>
            Dream
          </Heading>
          <Text size="lg" className="mx-auto mt-6 max-w-md" style={{ color: 'var(--ink-2)' }}>
            It starts here. A spark — an ambition you can&apos;t quite name yet.
          </Text>
          <Mono className="mt-7 block" style={{ fontSize: '0.6rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Dream · 01 — the upstream
          </Mono>
        </div>

        {/* Scroll cue (over the dark meadow → always light) */}
        <button
          onClick={() => document.querySelector('[data-section="fog"]')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-9 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--ink-3)' }}
        >
          <Mono style={{ fontSize: '0.6rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Step into the unknown</Mono>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </button>
      </section>

      {/* ════════ 2. THE FOG — the unknown ════════ */}
      <section data-section="fog" className="relative w-full min-h-[92vh] overflow-hidden flex items-center">
        <div
          ref={fogRef}
          className={`relative z-10 mx-auto w-full max-w-2xl transition-all duration-[1200ms] ${fogVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
          style={{ ...PAD }}
        >
          <Mono className="mb-6 block" style={{ fontSize: '0.66rem', letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--indigo-ink)' }}>
            {'<002>'} &nbsp;The Unknown
          </Mono>
          <Heading level={2} size="h1" style={{ color: 'var(--ink)' }}>
            You know something
            <br />
            <span style={{ color: 'var(--ink-3)' }}>needs to exist.</span>
          </Heading>
          <Text size="lg" className="mt-7 max-w-md" style={{ color: 'var(--ink-2)' }}>
            But the vision is still forming. Too many directions. Too much noise. The path forward isn&apos;t clear yet.
          </Text>
        </div>
      </section>

      {/* ════════ 3. THE GUIDE — Meet Vaelen ════════ */}
      <section data-section="guide" className="relative w-full min-h-screen overflow-hidden flex items-center">
        <div
          ref={guideRef}
          className={`relative z-10 mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-[minmax(0,0.82fr)_1fr] md:gap-16 transition-all duration-1000 ${guideVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
          style={{ ...PAD, paddingTop: 'clamp(6rem,14vh,9rem)', paddingBottom: 'clamp(6rem,14vh,9rem)' }}
        >
          {/* Portrait — HUD brackets, emerging from mist */}
          <div className="relative mx-auto w-full max-w-[330px]">
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span key={c} aria-hidden className="absolute z-20 h-5 w-5"
                style={{
                  top: c[0] === 't' ? -8 : undefined, bottom: c[0] === 'b' ? -8 : undefined,
                  left: c[1] === 'l' ? -8 : undefined, right: c[1] === 'r' ? -8 : undefined,
                  borderTop: c[0] === 't' ? '1.5px solid var(--indigo-ink)' : undefined,
                  borderBottom: c[0] === 'b' ? '1.5px solid var(--indigo-ink)' : undefined,
                  borderLeft: c[1] === 'l' ? '1.5px solid var(--indigo-ink)' : undefined,
                  borderRight: c[1] === 'r' ? '1.5px solid var(--indigo-ink)' : undefined,
                }} />
            ))}
            <div className="relative overflow-hidden" style={{ aspectRatio: '0.82', borderTopLeftRadius: '44%', borderTopRightRadius: '44%', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, boxShadow: '0 30px 80px -34px rgba(0,0,0,0.55)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={VAELEN} alt="Vaelen, the Dark Elf Pathfinder" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, color-mix(in oklab, var(--indigo) 26%, transparent), transparent 55%)', mixBlendMode: 'soft-light' }} aria-hidden />
            </div>
            <Mono className="absolute -bottom-7 left-0" style={{ fontSize: '0.6rem', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              {'<003>'} subject · vaelen
            </Mono>
          </div>

          {/* Detail */}
          <div>
            <Eyebrow style={{ color: 'var(--indigo-ink)' }}>Your guide has arrived</Eyebrow>
            <Heading level={2} size="display" className="mt-3" style={{ color: 'var(--ink)' }}>Meet Vaelen</Heading>
            <Mono className="mt-3 block" style={{ fontSize: '0.7rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
              The Dark Elf Pathfinder · Mystical · Curious
            </Mono>
            <Text size="base" className="mt-6 max-w-md" style={{ color: 'var(--ink-2)' }}>
              She&apos;s charted a thousand futures and remembers the mistakes in all of them. She speaks in metaphors pulled from navigation and starlight, but never wastes a word.
            </Text>
            <div className="mt-8 flex flex-col">
              {traits.map((t) => (
                <div key={t.k} className="grid items-start gap-4 py-4" style={{ gridTemplateColumns: 'auto 1fr', borderTop: '1px solid var(--line)' }}>
                  <span className="mt-1.5 inline-flex items-center gap-2">
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--indigo-ink)' }} />
                    <Mono style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{t.k}</Mono>
                  </span>
                  <Text size="sm" style={{ color: 'var(--ink-2)' }}>{t.v}</Text>
                </div>
              ))}
            </div>
            <p className="mt-8 font-display" style={{ fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(1.05rem,2vw,1.35rem)', lineHeight: 1.3, color: 'var(--indigo-ink)' }}>
              “The path exists. You just need sharper eyes to see it.”
            </p>
          </div>
        </div>
      </section>

      {/* ════════ 4. MAPPING THE LANDSCAPE — crisp vista + survey overlay ════════ */}
      <section data-section="landscape" className="relative w-full min-h-screen overflow-hidden flex items-center justify-center text-center">
        {/* Survey / cartography overlay */}
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{ opacity: 0.4 }}>
          {[['10', '34', '32', '46'], ['32', '46', '26', '64'], ['26', '64', '50', '72'], ['58', '30', '74', '44'], ['74', '44', '70', '62'], ['50', '72', '70', '62'], ['32', '46', '58', '30']].map((l, i) => (
            <line key={i} x1={`${l[0]}%`} y1={`${l[1]}%`} x2={`${l[2]}%`} y2={`${l[3]}%`} stroke="var(--indigo-ink)" strokeWidth="0.18" strokeDasharray="0.6 0.6" />
          ))}
          {[['10', '34'], ['32', '46'], ['26', '64'], ['50', '72'], ['58', '30'], ['74', '44'], ['70', '62']].map((p, i) => (
            <g key={i}>
              <circle cx={`${p[0]}%`} cy={`${p[1]}%`} r="0.5" fill="var(--indigo-ink)" />
              <circle cx={`${p[0]}%`} cy={`${p[1]}%`} r="1.3" fill="none" stroke="var(--indigo-ink)" strokeWidth="0.12" />
            </g>
          ))}
        </svg>

        <div ref={mapRef} className={`relative z-10 mx-auto max-w-2xl transition-all duration-1000 ${mapVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`} style={{ ...PAD }}>
          <Mono className="mb-6 block" style={{ fontSize: '0.66rem', letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--indigo-ink)' }}>
            {'<004>'} &nbsp;The fog clears
          </Mono>
          <Heading level={2} size="display" style={{ color: 'var(--ink)' }}>
            Now we see
            <br />
            <span style={{ color: 'var(--indigo-ink)' }}>everything.</span>
          </Heading>
          <Text size="base" className="mx-auto mt-7 max-w-md" style={{ color: 'var(--ink-2)' }}>
            Together, we map the terrain. Your market. Your audience. Your competition. Every path laid bare.
          </Text>
          <Mono className="mt-8 inline-block" style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--ink-3)' }}>34.05°N · 118.24°W — TERRAIN LOCKED</Mono>
        </div>
      </section>

      {/* ════════ 5. SHAPING THE VISION — disciplines as a constellation ════════ */}
      <section data-section="shape" className="relative w-full overflow-hidden" style={{ ...PAD, paddingTop: 'clamp(5rem,12vh,8rem)', paddingBottom: 'clamp(5rem,12vh,8rem)' }}>
        {/* faint constellation backdrop */}
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" preserveAspectRatio="none" aria-hidden style={{ opacity: 0.4 }}>
          {[['18%', '20%', '40%', '34%'], ['40%', '34%', '30%', '60%'], ['30%', '60%', '62%', '70%'], ['62%', '70%', '80%', '48%'], ['80%', '48%', '40%', '34%']].map((l, i) => (
            <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="var(--indigo)" strokeWidth="1" strokeOpacity="0.5" />
          ))}
        </svg>

        <div ref={shapeRef} className={`relative z-10 mx-auto w-full max-w-4xl transition-all duration-1000 ${shapeVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <div className="mb-14 max-w-xl">
            <Eyebrow style={{ color: 'var(--indigo-ink)' }}>Refining the vision</Eyebrow>
            <Heading level={2} size="h1" className="mt-3" style={{ color: 'var(--ink)' }}>From fog to compass bearing.</Heading>
            <Text size="base" className="mt-5 max-w-md" style={{ color: 'var(--ink-2)' }}>Five disciplines. Each one sharpens your dream into something you can act on.</Text>
          </div>
          <div>
            {disciplines.map((d, i) => {
              const Icon = d.icon;
              return (
                <div key={d.realTitle} className="group grid items-center gap-4 py-6 md:py-7" style={{ gridTemplateColumns: 'auto auto 1fr auto', borderTop: '1px solid var(--line)' }}>
                  <Mono style={{ fontSize: '0.8rem', color: 'var(--indigo-ink)' }}>{String(i + 1).padStart(2, '0')}</Mono>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--indigo-soft)' }}>
                    <Icon className="h-4 w-4" style={{ color: 'var(--indigo-ink)' }} />
                  </span>
                  <Heading level={3} display={false} size="h3" style={{ color: 'var(--ink)' }}>{d.loreTitle}</Heading>
                  <Mono className="text-right" style={{ fontSize: '0.7rem', letterSpacing: '0.08em', color: 'var(--ink-2)' }}>{'// '}{d.realTitle}</Mono>
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid var(--line)' }} />
          </div>
        </div>
      </section>

      {/* ════════ 6. FORGING THE PLAN — artifacts laid on the overlook ════════ */}
      <section data-section="forge" className="relative w-full overflow-hidden" style={{ ...PAD, paddingTop: 'clamp(5rem,12vh,8rem)', paddingBottom: 'clamp(6rem,14vh,9rem)' }}>
        <div ref={forgeRef} className={`relative z-10 mx-auto w-full max-w-5xl transition-all duration-1000 ${forgeVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <div className="mb-14 max-w-xl">
            <Eyebrow style={{ color: 'var(--indigo-ink)' }}>The dream takes form</Eyebrow>
            <Heading level={2} size="h1" className="mt-3" style={{ color: 'var(--ink)' }}>You leave with a plan.</Heading>
            <Text size="base" className="mt-5 max-w-md" style={{ color: 'var(--ink-2)' }}>Not just ideas. Tangible artifacts you can hold, share, and build from.</Text>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {artifacts.map((a, i) => {
              const Icon = a.icon;
              return (
                <div key={a.realTitle} className="group relative overflow-hidden rounded-2xl p-6 transition-transform duration-500 hover:-translate-y-1"
                  style={{ border: '1px solid var(--line)', background: 'var(--panel)', backdropFilter: 'blur(8px)', boxShadow: '0 24px 60px -40px rgba(0,0,0,0.6)', transform: i === 1 ? 'translateY(1.5rem)' : undefined }}>
                  <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden style={{ backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
                  <div className="relative">
                    <div className="mb-8 flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--indigo-soft)' }}>
                        <Icon className="h-5 w-5" style={{ color: 'var(--indigo-ink)' }} />
                      </span>
                      <Mono style={{ fontSize: '0.62rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Artifact 0{i + 1}</Mono>
                    </div>
                    <Heading level={3} display={false} size="h3" style={{ color: 'var(--ink)' }}>{a.loreTitle}</Heading>
                    <Mono className="mt-2 block" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--indigo-ink)' }}>{a.realTitle}</Mono>
                    <div className="mt-6 flex items-center justify-between" style={{ borderTop: '1px solid var(--line)', paddingTop: '0.85rem' }}>
                      <Mono style={{ fontSize: '0.64rem', color: 'var(--ink-2)' }}>{a.stat}</Mono>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--indigo-ink)' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════ 7. YOUR COMPANION — Meet Echo ════════ */}
      <section data-section="companion" className="relative w-full min-h-screen overflow-hidden flex items-center justify-center text-center">
        <div ref={companionRef} className={`relative z-10 flex flex-col items-center transition-all duration-1000 ${companionVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`} style={{ ...PAD }}>
          <Eyebrow style={{ color: 'var(--indigo-ink)' }}>You&apos;re never alone</Eyebrow>
          <div className="relative my-9 h-[200px] w-[200px] md:h-[260px] md:w-[260px]">
            <div className="absolute inset-0 rounded-full border animate-[spin_22s_linear_infinite]" style={{ borderColor: 'color-mix(in oklab, var(--indigo) 38%, transparent)' }} />
            <div className="absolute inset-5 rounded-full border animate-[spin_16s_linear_infinite_reverse]" style={{ borderColor: 'color-mix(in oklab, var(--indigo) 30%, transparent)' }} />
            <div className="absolute inset-10 rounded-full" style={{ border: '1px solid color-mix(in oklab, var(--indigo) 22%, transparent)' }} />
            <div className="absolute inset-[34%] flex items-center justify-center rounded-full" style={{ background: 'var(--indigo-soft)', boxShadow: '0 0 50px 6px color-mix(in oklab, var(--indigo) 40%, transparent)' }}>
              <Sparkles className="h-10 w-10 md:h-12 md:w-12" style={{ color: 'var(--indigo-ink)' }} />
            </div>
            <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full" style={{ background: 'var(--indigo-ink)' }} />
            <div className="absolute bottom-[10%] right-[10%] h-2 w-2 rounded-full" style={{ background: 'var(--indigo)' }} />
          </div>
          <Heading level={2} size="display" style={{ color: 'var(--ink)' }}>Meet Echo.</Heading>
          <Text size="base" className="mt-4 max-w-sm" style={{ color: 'var(--ink-2)' }}>
            Your AI familiar. While Vaelen guides the strategy, Echo crunches the data — surfacing insights that would take weeks to find alone.
          </Text>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {['Research Synthesis', 'Insight Clustering', 'Trend Detection', 'Strategy Simulation'].map((cap) => (
              <Mono key={cap} style={{ fontSize: '0.66rem', letterSpacing: '0.06em', color: 'var(--indigo-ink)', border: '1px solid var(--line)', borderRadius: 999, padding: '0.42rem 0.9rem', background: 'var(--indigo-soft)' }}>{cap}</Mono>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ 8. THE COMPASS POINTS FORWARD — the path to the horizon ════════ */}
      <section data-section="cta" className="relative w-full min-h-[90vh] overflow-hidden flex items-center justify-center text-center">
        {/* a trail toward the horizon spark */}
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="dream-trail" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--indigo-ink)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--indigo-ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M43,100 L49,52 L51,52 L57,100 Z" fill="url(#dream-trail)" />
          <circle cx="50" cy="52" r="0.9" fill="var(--indigo-ink)" />
        </svg>

        <div ref={ctaRef} className={`relative z-10 mx-auto w-full max-w-2xl transition-all duration-1000 ${ctaVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`} style={{ ...PAD }}>
          <div className="relative mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full" style={{ border: '1px solid color-mix(in oklab, var(--indigo) 45%, transparent)', background: 'color-mix(in oklab, var(--panel) 60%, transparent)', backdropFilter: 'blur(6px)' }}>
            <Compass className="h-8 w-8" style={{ color: 'var(--indigo-ink)' }} />
          </div>
          <Heading level={2} size="display" style={{ color: 'var(--ink)' }}>Your compass is set.</Heading>
          <Text size="lg" className="mx-auto mt-5 max-w-lg" style={{ color: 'var(--ink-2)' }}>
            Every great thing starts as a conversation. Tell us what you&apos;re dreaming, and we&apos;ll help you find the path.
          </Text>
          <div className="mt-11 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/contact" className="group inline-flex items-center gap-3 rounded-full px-10 py-4 text-lg font-bold transition-transform hover:scale-105" style={{ background: 'var(--indigo-ink)', color: 'var(--paper)' }}>
              Start the journey
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/design" className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-semibold transition-colors" style={{ border: '1px solid color-mix(in oklab, var(--indigo) 50%, transparent)', color: 'var(--indigo-ink)' }}>
              Continue to the Forge
              <Swords className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════ 9. OTHER REALMS ════════ */}
      <section data-section="realms" className="relative w-full overflow-hidden" style={{ ...PAD, paddingTop: 'clamp(4rem,10vh,6rem)', paddingBottom: 'clamp(7rem,16vh,10rem)' }}>
        <div className="relative z-10 mx-auto max-w-3xl" style={{ borderTop: '1px solid var(--line)', paddingTop: 'clamp(3rem,8vh,5rem)' }}>
          <Heading level={2} display={false} size="h3" className="text-center" style={{ color: 'var(--ink-2)' }}>The journey continues</Heading>
          <Text size="sm" className="mx-auto mt-3 mb-10 max-w-md text-center" style={{ color: 'var(--ink-3)' }}>
            Dream is where it starts. Design and Develop are where it becomes real.
          </Text>
          <div className="grid gap-4 sm:grid-cols-2">
            {siblings.map((s) => (
              <Link key={s.href} href={s.href} className="group block">
                <div className="rounded-2xl p-5 transition-all duration-200 group-hover:-translate-y-0.5" style={{ border: '1px solid var(--line)', background: 'var(--panel)', backdropFilter: 'blur(8px)' }}>
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}1f` }}>
                      <Compass className="h-4 w-4" style={{ color: s.color }} />
                    </span>
                    <Heading level={3} display={false} size="sm" style={{ color: s.color }}>{s.realm}</Heading>
                  </div>
                  <Text size="sm" style={{ color: 'var(--ink-2)' }}>Guided by {s.mentor}</Text>
                  <Text size="sm" className="mt-1 line-clamp-2" style={{ color: 'var(--ink-3)' }}>{s.loreBlurb.slice(0, 100)}...</Text>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
