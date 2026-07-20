'use client';

import Link from 'next/link';
import type { ServicePageData } from '@/lib/types/service';
import { GlassCard } from '@/components/react/ui/GlassCard';
import { Heading, Text } from '@/components/react/ui/typography';
import { ALL_SERVICES } from '@/lib/data/services';

interface ServicePageLayoutProps {
  service: ServicePageData;
}

export function ServicePageLayout({ service }: ServicePageLayoutProps) {
  const siblings = ALL_SERVICES.filter((s) => s.href !== service.href);

  return (
    <div
      className="min-h-screen transition-all duration-300 ease-in-out"
      style={{
        paddingLeft: 'calc(var(--left-sidebar-w, 0px) + 0rem)',
        paddingRight: 'calc(var(--right-sidebar-w, 0px) + 0rem)',
      }}
    >
      {/* Intro Hero */}
      <section
        data-section="hero"
        className={`relative w-full min-h-[70vh] flex items-center overflow-hidden`}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${service.gradientClass} opacity-20`} />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 py-20 md:px-10">
          <div
            className="inline-block mb-4 px-3 py-1 rounded-full border text-xs font-bold tracking-widest uppercase"
            style={{ borderColor: service.color, color: service.color }}
          >
            {service.sigil} Sigil
          </div>
          <Heading level={1} size="display" className="text-white mb-4">
            {service.realm}
          </Heading>
          <Text size="lg" className="max-w-xl" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
            Guided by <span style={{ color: service.color }} className="font-bold">{service.mentor}</span>
          </Text>
        </div>
      </section>

      {/* Mentor Lore */}
      <section data-section="lore" className="max-w-4xl mx-auto px-6 py-16 md:px-10">
        <Text size="lg" style={{ color: 'var(--foreground)', opacity: 0.8 }}>
          {service.loreBlurb}
        </Text>
      </section>

      {/* Skills / Abilities */}
      <section data-section="skills" className="max-w-4xl mx-auto px-6 pb-16 md:px-10">
        <Heading level={2} className="mb-6">Abilities</Heading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {service.skills.map((skill) => (
            <GlassCard key={skill}>
              <Heading level={6} display={false} style={{ color: service.color }}>
                {skill}
              </Heading>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Artifacts / Deliverables */}
      <section data-section="artifacts" className="max-w-4xl mx-auto px-6 pb-16 md:px-10">
        <Heading level={2} className="mb-6">Artifacts & Deliverables</Heading>
        <div className="grid gap-4 sm:grid-cols-2">
          {service.artifacts.map((artifact) => (
            <GlassCard key={artifact.name}>
              <Heading level={6} display={false} className="mb-2" style={{ color: service.color }}>
                {artifact.name}
              </Heading>
              <Text size="sm" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
                {artifact.description}
              </Text>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Familiars */}
      <section data-section="familiars" className="max-w-4xl mx-auto px-6 pb-16 md:px-10">
        <Heading level={2} className="mb-6">Familiar: {service.familiarName}</Heading>
        <GlassCard>
          <Text size="sm" style={{ color: 'var(--foreground)', opacity: 0.8 }}>
            {service.familiarDescription}
          </Text>
        </GlassCard>
      </section>

      {/* CTA */}
      <section data-section="cta" className="max-w-4xl mx-auto px-6 pb-16 md:px-10 text-center">
        <Link
          href="/contact"
          className="inline-block rounded-full px-8 py-4 text-lg font-bold text-white transition-all hover:scale-105"
          style={{ backgroundColor: service.color }}
        >
          {service.ctaText}
        </Link>
      </section>

      {/* Cross-links */}
      <section className="max-w-4xl mx-auto px-6 pb-20 md:px-10">
        <Heading level={3} className="mb-6 text-center">Explore Other Realms</Heading>
        <div className="grid gap-4 sm:grid-cols-2">
          {siblings.map((s) => (
            <Link key={s.href} href={s.href} className="group block">
              <GlassCard className="transition-transform duration-200 group-hover:-translate-y-0.5">
                <Heading level={6} display={false} style={{ color: s.color }}>
                  {s.realm}
                </Heading>
                <Text size="sm" className="mt-1" style={{ color: 'var(--foreground)', opacity: 0.6 }}>Guided by {s.mentor}</Text>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
