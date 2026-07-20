import type { ServicePageData } from '@/lib/types/service';

export const DREAM: ServicePageData = {
  realm: 'The Navigator Realm',
  mentor: 'Vaelen',
  sigil: 'Compass',
  color: 'var(--dream-primary)',
  colorClass: 'text-dream',
  gradientClass: 'from-indigo-600 via-indigo-500 to-violet-500',
  loreBlurb:
    'Before the first line is drawn, there must be vision. Vaelen, the Navigator, charts the unseen waters of possibility. In this realm, raw ambition takes shape — ideas become strategies, chaos becomes clarity, and the path forward reveals itself through deep research and creative direction. Every great creation begins as a dream.',
  skills: [
    'Brand Strategy',
    'Market Research',
    'UX Research',
    'Content Strategy',
    'Creative Direction',
  ],
  artifacts: [
    { name: 'Brand Guides', description: 'Comprehensive identity systems that define your visual and verbal language.' },
    { name: 'Strategy Decks', description: 'Research-backed roadmaps that align vision with execution.' },
    { name: 'User Personas', description: 'Data-driven archetypes that keep your audience at the center.' },
    { name: 'Content Frameworks', description: 'Structured narratives that give every channel a unified voice.' },
  ],
  familiarName: 'Echo',
  familiarDescription:
    'An AI familiar that listens to market signals, synthesizes research, and surfaces insights that would take weeks to uncover manually.',
  ctaText: 'Begin your quest with Vaelen',
  href: '/dream',
};

export const DESIGN: ServicePageData = {
  realm: 'The Forge',
  mentor: 'Korr',
  sigil: 'Hammer',
  color: 'var(--design-primary)',
  colorClass: 'text-design',
  gradientClass: 'from-orange-600 via-orange-500 to-amber-500',
  loreBlurb:
    'In the heart of the Forge, vision becomes form. Korr, the Shaper, bends light and pixel with equal mastery — crafting interfaces that feel alive, design systems that scale without breaking, and brand identities that burn themselves into memory. Here, beauty is not decoration; it is precision made visible.',
  skills: [
    'UI/UX Design',
    'Design Systems',
    'Prototyping',
    'Motion Design',
    'Brand Identity',
  ],
  artifacts: [
    { name: 'Figma Files', description: 'Pixel-perfect design files ready for handoff and iteration.' },
    { name: 'Interactive Prototypes', description: 'Clickable experiences that test ideas before a single line of code.' },
    { name: 'Design Systems', description: 'Scalable component libraries that unify product teams.' },
    { name: 'Brand Identities', description: 'Complete visual languages — logos, type, color, motion.' },
  ],
  familiarName: 'Flint',
  familiarDescription:
    'An AI familiar that accelerates iteration — generating variations, checking accessibility, and maintaining consistency across every artboard.',
  ctaText: 'Enter the Forge with Korr',
  href: '/design',
};

export const DEVELOP: ServicePageData = {
  realm: 'The High Tower',
  mentor: 'Cirion & The Council',
  sigil: 'Tower',
  color: 'var(--develop-primary)',
  colorClass: 'text-develop',
  gradientClass: 'from-emerald-600 via-emerald-500 to-green-400',
  loreBlurb:
    'The High Tower is where the impossible becomes inevitable. Cirion and the Council of Architects transform blueprints into living systems — websites that breathe, applications that think, and integrations that flow like water through stone. Code is not just written here; it is forged with intent and tempered by performance.',
  skills: [
    'Web Development',
    'App Development',
    'E-commerce',
    'AI Automation',
    'API Integration',
  ],
  artifacts: [
    { name: 'Websites & Web Apps', description: 'Performant, accessible, and beautiful digital experiences.' },
    { name: 'Mobile Applications', description: 'Native and cross-platform apps that users love.' },
    { name: 'E-commerce Stores', description: 'Conversion-optimized storefronts that scale with growth.' },
    { name: 'AI Workflows', description: 'Intelligent automation that multiplies human capability.' },
    { name: 'API Integrations', description: 'Seamless connections between the systems that power your business.' },
  ],
  familiarName: 'Axiom',
  familiarDescription:
    'An AI familiar that writes tests, catches bugs before they ship, and optimizes performance — a tireless second pair of eyes on every build.',
  ctaText: 'Ascend the Tower with Cirion',
  href: '/develop',
};

export const ALL_SERVICES = [DREAM, DESIGN, DEVELOP] as const;
