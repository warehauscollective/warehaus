'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Compass,
  Hammer,
  TowerControl,
  Mail,
  MapPin,
  ArrowRight,
  ChevronDown,
  Send,
  MessageCircle,
} from 'lucide-react';
import { useLayout } from '@/components/providers/LayoutProvider';
import { StatusIndicator } from '@/components/react/ui/StatusIndicator';
import { Heading, Text, Eyebrow } from '@/components/react/ui/typography';
import { useFadeIn } from '@/hooks/useFadeIn';

/* ───────── Data ───────── */
const inquiryTypes = [
  {
    icon: Compass,
    label: 'Dream',
    subtitle: 'Strategy & Vision',
    description: 'Brand strategy, market research, creative direction, product visioning, content strategy.',
    color: 'var(--dream-primary)',
    href: '/dream',
  },
  {
    icon: Hammer,
    label: 'Design',
    subtitle: 'Craft & Form',
    description: 'UI/UX design, brand identity, design systems, prototyping, visual design.',
    color: 'var(--design-primary)',
    href: '/design',
  },
  {
    icon: TowerControl,
    label: 'Develop',
    subtitle: 'Engineering & Build',
    description: 'Web development, mobile apps, e-commerce, AI automation, API integrations.',
    color: 'var(--develop-primary)',
    href: '/develop',
  },
];

const SIDEBAR_PAD = {
  paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 1rem)',
  paddingRight: 'calc(var(--right-sidebar-w, 0px) + 1rem)',
};

/* ───────── Component ───────── */
export function ContactContent() {
  const { setActiveSection } = useLayout();
  const [pathsRef, pathsVisible] = useFadeIn();
  const [formRef, formVisible] = useFadeIn();
  const [infoRef, infoVisible] = useFadeIn();

  useEffect(() => {
    setActiveSection('contact-hero');
    return () => setActiveSection('hero');
  }, [setActiveSection]);

  return (
    <div className="min-h-screen">

      {/* ════════ 1. HERO ════════ */}
      <section
        data-section="contact-hero"
        className="relative w-full h-[60vh] min-h-[500px] flex items-center justify-center overflow-hidden"
      >
        {/* Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0f1a2e_0%,_#050505_60%)]" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center px-6" style={SIDEBAR_PAD}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-6">
              <MessageCircle className="w-4 h-4 text-cyan-400/60" />
              <Eyebrow as="span" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                Begin Your Journey
              </Eyebrow>
            </div>
            <Heading level={1} size="display" className="text-white mb-6 leading-[1.1]">
              Step Inside<br />
              <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                the House
              </span>
            </Heading>
            <Text lead className="text-gray-400 max-w-lg mx-auto">
              The door is open. Tell us what you&apos;re building, and we&apos;ll match you
              with the right mentor and familiar to bring it to life.
            </Text>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <Eyebrow as="span" className="text-[9px]" style={{ color: 'rgb(34 211 238 / 0.4)' }}>
            Choose Your Path
          </Eyebrow>
          <ChevronDown className="w-4 h-4 text-cyan-400/40 animate-bounce" />
        </div>
      </section>

      {/* ════════ 2. PATHS — Choose your realm ════════ */}
      <section
        ref={pathsRef}
        data-section="contact-paths"
        className="relative w-full py-24"
      >
        <div style={SIDEBAR_PAD} className="w-full">
          <div className="max-w-5xl mx-auto">
            <div
              className={`mb-12 transition-all duration-1000 ${
                pathsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-px bg-cyan-500/40" />
                <Eyebrow as="span" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                  Three Realms
                </Eyebrow>
              </div>
              <Heading level={2} className="text-white mb-3">
                Choose your path.
              </Heading>
              <Text size="sm" className="text-gray-400 max-w-lg">
                Each realm has its own mentor, familiar, and expertise.
                Not sure where to start? Send us a message below and we&apos;ll guide you.
              </Text>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {inquiryTypes.map((type, i) => {
                const Icon = type.icon;
                return (
                  <Link
                    key={type.label}
                    href={type.href}
                    className={`group relative block rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 overflow-hidden transition-all duration-500 hover:border-white/10 hover:-translate-y-0.5 ${
                      pathsVisible
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-8'
                    }`}
                    style={{
                      transitionDelay: pathsVisible ? `${200 + i * 100}ms` : '0ms',
                    }}
                  >
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{
                        background: `radial-gradient(circle at 50% 0%, ${type.color}10, transparent 70%)`,
                      }}
                    />

                    <div className="relative z-10">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 border"
                        style={{
                          borderColor: `${type.color}30`,
                          backgroundColor: `${type.color}10`,
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: type.color }} />
                      </div>
                      <Heading level={3} display={false} className="text-white mb-1">
                        {type.label}
                      </Heading>
                      <Eyebrow className="mb-3" style={{ color: type.color }}>
                        {type.subtitle}
                      </Eyebrow>
                      <Text size="sm" className="text-gray-500 mb-4">
                        {type.description}
                      </Text>
                      <div
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ color: type.color }}
                      >
                        Explore Realm <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ════════ 3. FORM + INFO ════════ */}
      <section
        ref={formRef}
        data-section="contact-form"
        className="relative w-full py-24"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0a1020_0%,_transparent_50%)]" />
        <div style={SIDEBAR_PAD} className="relative z-10 w-full">
          <div className="max-w-5xl mx-auto">
            <div
              className={`mb-12 transition-all duration-1000 ${
                formVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-px bg-cyan-500/40" />
                <Eyebrow as="span" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                  Get In Touch
                </Eyebrow>
              </div>
              <Heading level={2} className="text-white">
                Send a message.
              </Heading>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form — 2 cols */}
              <div
                className={`lg:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8 transition-all duration-1000 delay-200 ${
                  formVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
              >
                <form className="space-y-5" action="#" method="POST">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="name" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-cyan-500/30 focus:bg-white/[0.05]"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-cyan-500/30 focus:bg-white/[0.05]"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="subject" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                      Subject
                    </label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-cyan-500/30 focus:bg-white/[0.05]"
                      placeholder="Project inquiry"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={6}
                      required
                      className="w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-cyan-500/30 focus:bg-white/[0.05]"
                      placeholder="Tell us about your project, your timeline, and what success looks like..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-6 py-2.5 text-sm font-bold text-cyan-300 transition-all hover:bg-cyan-500/30"
                  >
                    Send Message <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

              {/* Info — 1 col */}
              <div
                ref={infoRef}
                className={`space-y-4 transition-all duration-1000 delay-400 ${
                  infoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
              >
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-4 h-4 text-cyan-400/60" />
                    <Eyebrow as="h3" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                      Email
                    </Eyebrow>
                  </div>
                  <a
                    href="mailto:hello@warehaus.studio"
                    className="text-sm text-white hover:text-cyan-300 transition-colors"
                  >
                    hello@warehaus.studio
                  </a>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-cyan-400/60" />
                    <Eyebrow as="h3" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                      Location
                    </Eyebrow>
                  </div>
                  <Text size="sm" className="text-white">Remote-first</Text>
                  <Text size="sm" className="text-gray-500 mt-1">Globally distributed team</Text>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <StatusIndicator status="online" size="sm" />
                    </div>
                    <Eyebrow as="h3" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                      Availability
                    </Eyebrow>
                  </div>
                  <Text size="sm" className="text-white">Open for new projects</Text>
                  <Text size="sm" className="text-gray-500 mt-1">Currently accepting work for Q2 2026</Text>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <Eyebrow as="h3" className="mb-3" style={{ color: 'rgb(34 211 238 / 0.6)' }}>
                    Social
                  </Eyebrow>
                  <div className="flex flex-wrap gap-2">
                    {['Twitter', 'Dribbble', 'GitHub', 'LinkedIn'].map((s) => (
                      <a
                        key={s}
                        href="#"
                        className="text-xs px-3 py-1 rounded-full border border-white/[0.06] text-gray-500 hover:text-white hover:border-white/10 transition-all"
                      >
                        {s}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
