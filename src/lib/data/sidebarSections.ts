import { codexEntries } from '@/lib/data/codex';

export interface SectionEntry {
  key: string;
  heading: string;
  description: string;
  tag: string;
  code: string;
  quote?: string;
  quoteAuthor?: string;
  details?: { label: string; value: string }[];
}

export const HERO_TAB_SECTIONS: SectionEntry[] = [
  {
    key: 'hero-dream',
    heading: 'Chart the unseen.',
    description:
      'Before the first line is drawn, there must be vision. Vaelen charts the waters of possibility \u2014 turning raw ambition into strategy, chaos into clarity.',
    tag: '\u5922',
    code: '0001',
    quote: '\u201CThe path exists. You just need sharper eyes to see it.\u201D',
    quoteAuthor: 'Vaelen',
    details: [
      { label: 'Realm', value: 'The Navigator Realm' },
      { label: 'Guide', value: 'Vaelen \u2014 Dark Elf Pathfinder' },
      { label: 'Familiar', value: 'Echo \u2014 AI Research Companion' },
      { label: 'Craft', value: 'Strategy, Research, Creative Direction' },
    ],
  },
  {
    key: 'hero-design',
    heading: 'Shape the invisible.',
    description:
      'In the heart of the Forge, vision becomes form. Korr bends light and pixel with equal mastery \u2014 crafting interfaces that feel alive and brands that burn into memory.',
    tag: '\u8A2D\u8A08',
    code: '0002',
    quote: '\u201CBeauty is not decoration. It is precision made visible.\u201D',
    quoteAuthor: 'Korr',
    details: [
      { label: 'Realm', value: 'The Forge' },
      { label: 'Guide', value: 'Korr \u2014 The Shaper' },
      { label: 'Familiar', value: 'Flint \u2014 AI Design Companion' },
      { label: 'Craft', value: 'UI/UX, Systems, Brand Identity' },
    ],
  },
  {
    key: 'hero-develop',
    heading: 'Build the impossible.',
    description:
      'The High Tower is where blueprints become living systems. Cirion and the Council transform designs into performant, scalable applications.',
    tag: '\u958B\u767A',
    code: '0003',
    quote: '\u201CCode is not written. It is architected.\u201D',
    quoteAuthor: 'Cirion',
    details: [
      { label: 'Realm', value: 'The High Tower' },
      { label: 'Guide', value: 'Cirion & The Council' },
      { label: 'Familiar', value: 'Axiom \u2014 AI Build Guardian' },
      { label: 'Craft', value: 'Web, Apps, AI, E-commerce' },
    ],
  },
];

const HOME_SECTIONS: SectionEntry[] = [
  {
    key: 'hero',
    heading: 'What is dreamed, we forge.',
    description:
      'Welcome to Warehaus. We chart vision into strategy, shape ideas into form, and build the impossible.',
    tag: '\u5922\u3092\u7BC9\u304F',
    code: '0394',
  },
  {
    key: 'pillars',
    heading: 'Every creation follows the same path.',
    description:
      'Three realms, three mentors, three AI familiars. Each one specializes in a stage of the journey from vision to reality.',
    tag: '\u4E09\u3064\u306E\u67F1',
    code: '0512',
    quote: '\u201CThe house was built on three pillars. Remove one and the whole thing falls.\u201D',
    quoteAuthor: 'Warehaus',
    details: [
      { label: 'Dream', value: 'Strategy & vision \u2014 Vaelen, the Navigator' },
      { label: 'Design', value: 'Craft & form \u2014 Korr, the Shaper' },
      { label: 'Develop', value: 'Engineering & scale \u2014 Cirion & the Council' },
    ],
  },
  {
    key: 'codex',
    heading: 'The work speaks for itself.',
    description:
      'Our living archive. Artifacts shipped and living. Quests in progress. Fragments pushing the edges of what\u2019s possible.',
    tag: '\u3082\u306E\u3065\u304F\u308A',
    code: '0618',
    details: [
      { label: 'Artifact', value: 'A completed work \u2014 shipped and living' },
      { label: 'Quest', value: 'An active journey \u2014 in progress' },
      { label: 'Fragment', value: 'An experiment \u2014 exploring the edges' },
      { label: 'Archive', value: '6 projects documented and growing' },
    ],
  },
  {
    key: 'familiars',
    heading: 'AI that multiplies the craft.',
    description:
      'Each mentor is bound to an AI familiar. They don\u2019t replace human expertise \u2014 they give it superpowers.',
    tag: '\u4F7F\u3044\u9B54',
    code: '0721',
    quote: '\u201CFamiliars can crunch numbers all night. But they won\u2019t tell you if your idea sucks. That\u2019s my job.\u201D',
    quoteAuthor: 'Vaelen',
    details: [
      { label: 'Echo', value: 'Research synthesis & trend detection' },
      { label: 'Flint', value: 'Rapid iteration & accessibility checks' },
      { label: 'Axiom', value: 'Auto testing & performance monitoring' },
    ],
  },
  {
    key: 'cta',
    heading: 'Step inside the house.',
    description:
      'Every great creation starts with a conversation. Tell us what you\u2019re building \u2014 we\u2019ll match you with the right mentor.',
    tag: '\u59CB\u3081\u307E\u3057\u3087\u3046',
    code: '0899',
    details: [
      { label: 'Email', value: 'hello@warehaus.studio' },
      { label: 'Status', value: 'Open for new projects' },
      { label: 'Timeline', value: 'Accepting work for Q2 2026' },
    ],
  },
];

const DREAM_SECTIONS: SectionEntry[] = [
  {
    key: 'spark',
    heading: 'It starts with a spark.',
    description:
      'You have something \u2014 an idea, a feeling, an ambition you can\u2019t quite articulate yet. That\u2019s not a problem. That\u2019s the beginning of everything worth building.',
    tag: '\u59CB\u307E\u308A',
    code: '0001',
    quote: '\u201CThe path exists. You just need sharper eyes to see it.\u201D',
    quoteAuthor: 'Vaelen',
    details: [
      { label: 'Realm', value: 'Dream \u2014 Strategy & Vision' },
      { label: 'Guide', value: 'Vaelen, Dark Elf Pathfinder' },
      { label: 'Familiar', value: 'Echo \u2014 AI Research Companion' },
    ],
  },
  {
    key: 'fog',
    heading: 'The fog is normal.',
    description:
      'Too many directions. Competitors you can\u2019t quite see. An audience you haven\u2019t mapped. This is where most people get stuck \u2014 paralyzed by possibility. But fog is just unexplored territory.',
    tag: '\u970D',
    code: '0002',
    quote: '\u201CEvery empire begins as a whisper on the wind. The trick is knowing which whisper to follow.\u201D',
    quoteAuthor: 'Vaelen',
  },
  {
    key: 'guide',
    heading: 'You don\u2019t walk alone.',
    description:
      'Vaelen has charted a thousand futures and remembers the mistakes in all of them. He speaks in metaphors pulled from navigation and starlight, but never wastes a word. His Pathfinder\u2019s Atlas rewrites itself with every decision. His Shadow Compass points toward futures aligned with your vision.',
    tag: '\u5C0E\u304D',
    code: '0003',
    details: [
      { label: 'Archetype', value: 'Mystical. Curious. Adventurous.' },
      { label: 'Atlas', value: 'Holographic maps that rewrite with every decision' },
      { label: 'Compass', value: 'Points toward futures aligned with vision' },
    ],
  },
  {
    key: 'landscape',
    heading: 'Now we see the terrain.',
    description:
      'The observatory reveals everything. Your market mapped like constellations. Your competition charted like rival kingdoms. Opportunities glowing like undiscovered stars. For the first time, you see the full landscape \u2014 and where you fit in it.',
    tag: '\u5730\u56F3',
    code: '0004',
    quote: '\u201CThe stars don\u2019t lie. But they don\u2019t explain themselves either. That\u2019s what I\u2019m for.\u201D',
    quoteAuthor: 'Vaelen',
    details: [
      { label: 'Markets', value: 'Competitive landscapes mapped in real-time' },
      { label: 'Audiences', value: 'Who they are, what they need, where they gather' },
      { label: 'Gaps', value: 'Uncharted territory where you can win' },
    ],
  },
  {
    key: 'shape',
    heading: 'From fog to focus.',
    description:
      'Five disciplines sharpen your dream into something actionable. We decode signals, map terrain, summon your north star, craft your language, and align every element into a unified creative force.',
    tag: '\u7CBE\u7DF4',
    code: '0005',
    details: [
      { label: 'Rune Reading', value: 'Brand strategy \u2014 decoding market signals' },
      { label: 'Cartography', value: 'Market research \u2014 mapping the terrain' },
      { label: 'North Star', value: 'Product visioning \u2014 crystallizing direction' },
      { label: 'Inscription', value: 'Content strategy \u2014 words that carry power' },
      { label: 'Starlight', value: 'Creative direction \u2014 unified force' },
    ],
  },
  {
    key: 'forge',
    heading: 'A plan you can hold.',
    description:
      'You don\u2019t leave with vague ideas. You leave with tangible artifacts \u2014 brand guides, roadmaps, and messaging systems that become the foundation everything else is built on.',
    tag: '\u5DE5\u82B8\u54C1',
    code: '0006',
    details: [
      { label: 'Grimoire', value: 'Brand style guides \u2014 identity systems that evolve with you' },
      { label: 'Star Maps', value: 'Product roadmaps \u2014 decisions connected to destinations' },
      { label: 'Keys', value: 'Naming & messaging \u2014 the words people repeat about you' },
    ],
  },
  {
    key: 'companion',
    heading: 'AI that amplifies you.',
    description:
      'Echo, Vaelen\u2019s spectral familiar, sifts data faster than any mortal cartographer. It charts market constellations and whispers probabilities \u2014 but it never replaces the strategist. It gives them superpowers.',
    tag: '\u4F7F\u3044\u9B54',
    code: '0007',
    quote: '\u201CFamiliars can crunch numbers all night. But they won\u2019t tell you if your idea sucks. That\u2019s my job.\u201D',
    quoteAuthor: 'Vaelen',
    details: [
      { label: 'Research', value: 'Synthesis across thousands of data points' },
      { label: 'Insight', value: 'Sentiment, competition, and trend detection' },
      { label: 'Strategy', value: 'Simulated workshops testing assumptions' },
    ],
  },
  {
    key: 'cta',
    heading: 'Your compass is set.',
    description:
      'Every great thing starts as a conversation. You bring the dream. We bring the map, the compass, and a thousand charted futures. Let\u2019s find your path.',
    tag: '\u51FA\u767A',
    code: '0008',
  },
];

const DESIGN_SECTIONS: SectionEntry[] = [
  {
    key: 'spark',
    heading: 'Vision needs form.',
    description:
      'The strategy is set. The dream is clear. But it\u2019s still invisible \u2014 trapped in decks and documents. Now it needs to become something people can see, touch, and feel. That\u2019s where the Forge begins.',
    tag: '\u59CB\u307E\u308A',
    code: '0001',
    quote: '\u201CBeauty is not decoration. It is precision made visible.\u201D',
    quoteAuthor: 'Korr',
    details: [
      { label: 'Realm', value: 'The Forge \u2014 Design & Craft' },
      { label: 'Guide', value: 'Korr, the Shaper' },
      { label: 'Familiar', value: 'Flint \u2014 AI Design Companion' },
    ],
  },
  {
    key: 'raw',
    heading: 'Raw material.',
    description:
      'Wireframes without soul. Mood boards that don\u2019t click. A brand that looks like everyone else\u2019s. The raw material is there \u2014 scattered across whiteboards and sticky notes \u2014 but it hasn\u2019t been shaped yet.',
    tag: '\u7D20\u6750',
    code: '0002',
    quote: '\u201CEvery masterwork starts as a rough block. The trick is knowing what to remove.\u201D',
    quoteAuthor: 'Korr',
  },
  {
    key: 'guide',
    heading: 'The master craftsman.',
    description:
      'Korr bends light and pixel with equal mastery. He doesn\u2019t follow trends \u2014 he forges them. Every interface he shapes feels alive. Every identity he brands burns itself into memory. His craft is equal parts intuition and engineering.',
    tag: '\u5320',
    code: '0003',
    details: [
      { label: 'Archetype', value: 'Precise. Bold. Relentless.' },
      { label: 'Tools', value: 'The Shaper\u2019s Hammer \u2014 strikes that refine, never destroy' },
      { label: 'Philosophy', value: 'Beauty that serves function. Form that amplifies meaning.' },
    ],
  },
  {
    key: 'forge',
    heading: 'The fire is lit.',
    description:
      'The Forge is where vision becomes visible. Concepts heated until they glow, hammered against the anvil of craft, and cooled into something that holds its shape. This is not decoration \u2014 it\u2019s engineering at the pixel level.',
    tag: '\u7089',
    code: '0004',
    quote: '\u201CI don\u2019t make things pretty. I make things that work so well they happen to be beautiful.\u201D',
    quoteAuthor: 'Korr',
    details: [
      { label: 'Process', value: 'Concept \u2192 wireframe \u2192 high-fidelity \u2192 prototype \u2192 system' },
      { label: 'Iterations', value: 'Every idea tested, refined, and stress-tested before delivery' },
      { label: 'Output', value: 'Production-ready design that developers can build from' },
    ],
  },
  {
    key: 'shape',
    heading: 'Five ways to shape fire.',
    description:
      'Each discipline is a tool in Korr\u2019s arsenal. Together, they transform raw vision into refined craft \u2014 interfaces that feel intuitive, systems that scale, and brands that last.',
    tag: '\u6280',
    code: '0005',
    details: [
      { label: 'Interface', value: 'UI/UX design \u2014 shaping how people experience your product' },
      { label: 'System', value: 'Design systems \u2014 scalable components that unify teams' },
      { label: 'Motion', value: 'Prototyping & motion \u2014 breathing life into static screens' },
      { label: 'Brand', value: 'Brand identity \u2014 logos, type, color, motion' },
      { label: 'Precision', value: 'Visual design \u2014 every pixel placed with intent' },
    ],
  },
  {
    key: 'artifacts',
    heading: 'Forged and finished.',
    description:
      'You don\u2019t leave the Forge with vague mockups. You leave with production-ready artifacts \u2014 files developers can build from, systems teams can scale with, and brands that hold up everywhere.',
    tag: '\u5DE5\u82B8\u54C1',
    code: '0006',
    details: [
      { label: 'Blueprints', value: 'Pixel-perfect Figma files ready for handoff' },
      { label: 'Prototypes', value: 'Interactive experiences that test ideas before code' },
      { label: 'Systems', value: 'Scalable component libraries that unify product teams' },
      { label: 'Identities', value: 'Complete visual languages \u2014 logos, type, color, motion' },
    ],
  },
  {
    key: 'companion',
    heading: 'AI that accelerates craft.',
    description:
      'Flint, Korr\u2019s forge familiar, accelerates iteration. It generates variations in seconds, checks accessibility across every state, and maintains consistency across hundreds of artboards. The craft stays human. The speed becomes superhuman.',
    tag: '\u4F7F\u3044\u9B54',
    code: '0007',
    quote: '\u201CFlint handles the tedium. I handle the taste.\u201D',
    quoteAuthor: 'Korr',
    details: [
      { label: 'Iteration', value: 'Rapid generation of design variations' },
      { label: 'QA', value: 'Accessibility and consistency checks' },
      { label: 'Assets', value: 'Automated generation and optimization' },
    ],
  },
  {
    key: 'cta',
    heading: 'The Forge is ready.',
    description:
      'Bring your vision. Korr will shape it into something people can\u2019t look away from. Every great product starts with design that earns attention.',
    tag: '\u51FA\u767A',
    code: '0008',
  },
];

const CODEX_SECTIONS: SectionEntry[] = [
  {
    key: 'codex-intro',
    heading: 'The Codex of Creations.',
    description:
      'Every project tells a story. This is our living archive \u2014 artifacts forged in the Forge, quests charted through the Navigator Realm, and fragments tested in the High Tower.',
    tag: '\u66F8\u7269',
    code: '0900',
    quote: '\u201CThe works speak for themselves. But every work has a story worth hearing.\u201D',
    quoteAuthor: 'The Archivists',
    details: [
      { label: 'Archive', value: 'The collected works of Warehaus' },
      { label: 'Entries', value: `${6} projects documented` },
      { label: 'Status', value: 'Artifacts, Quests, Fragments' },
    ],
  },
  {
    key: 'codex-archive',
    heading: 'Browse the archive.',
    description:
      'Hover over any project to reveal its story. Each creation was guided by a mentor, powered by a familiar, and forged through a unique journey.',
    tag: '\u63A2\u7D22',
    code: '0901',
    details: [
      { label: 'Artifact', value: 'A completed work \u2014 shipped and living' },
      { label: 'Quest', value: 'An active journey \u2014 in progress' },
      { label: 'Fragment', value: 'An experiment \u2014 exploring the edges' },
    ],
  },
  {
    key: 'codex-nexus-brand-identity',
    heading: 'Nexus Brand Identity',
    description:
      'Complete visual identity for a tech startup disrupting the logistics space. We crafted everything from the logo system to digital touchpoints.',
    tag: '\u30D6\u30E9\u30F3\u30C9',
    code: '0910',
    details: [
      { label: 'Client', value: 'Nexus Corp' },
      { label: 'Year', value: '2024' },
      { label: 'Mentor', value: 'Korr \u2014 The Shaper' },
      { label: 'Status', value: 'Artifact \u2014 Complete' },
      { label: 'Services', value: 'Brand Strategy, Visual Identity, Guidelines' },
    ],
  },
  {
    key: 'codex-orbital-dashboard',
    heading: 'Orbital Dashboard',
    description:
      'Real-time analytics platform for satellite operations and space telemetry. Built with performance-first architecture.',
    tag: '\u30C0\u30C3\u30B7\u30E5',
    code: '0920',
    details: [
      { label: 'Client', value: 'SpaceOps Inc' },
      { label: 'Year', value: '2024' },
      { label: 'Mentor', value: 'Cirion \u2014 The Architect' },
      { label: 'Status', value: 'Artifact \u2014 Complete' },
      { label: 'Services', value: 'UX Design, UI Design, Front-end Development' },
    ],
  },
  {
    key: 'codex-synthwave-campaign',
    heading: 'Synthwave Campaign',
    description:
      'Multi-channel marketing campaign blending retro-futurism with modern tech aesthetics.',
    tag: '\u30AD\u30E3\u30F3\u30DA',
    code: '0930',
    details: [
      { label: 'Client', value: 'RetroWave Media' },
      { label: 'Year', value: '2023' },
      { label: 'Mentor', value: 'Vaelen \u2014 The Pathfinder' },
      { label: 'Status', value: 'Artifact \u2014 Complete' },
      { label: 'Services', value: 'Campaign Strategy, Motion Design, Social Content' },
    ],
  },
  {
    key: 'codex-aurora-mobile',
    heading: 'Aurora Mobile App',
    description:
      'Weather prediction app featuring cinematic data visualizations and real-time atmospheric rendering.',
    tag: '\u30A2\u30D7\u30EA',
    code: '0940',
    quote: '\u201CThis one is still being forged. The journey continues.\u201D',
    quoteAuthor: 'Korr',
    details: [
      { label: 'Client', value: 'Weather.ai' },
      { label: 'Year', value: '2024' },
      { label: 'Mentor', value: 'Korr \u2014 The Shaper' },
      { label: 'Status', value: 'Quest \u2014 In Progress' },
      { label: 'Services', value: 'Product Design, Prototyping, User Research' },
    ],
  },
  {
    key: 'codex-helix-motion',
    heading: 'Helix Motion System',
    description:
      'Comprehensive motion design language for a biotech company, applied across digital and physical touchpoints.',
    tag: '\u30E2\u30FC\u30B7\u30E7\u30F3',
    code: '0950',
    details: [
      { label: 'Client', value: 'BioGenex' },
      { label: 'Year', value: '2023' },
      { label: 'Mentor', value: 'Korr \u2014 The Shaper' },
      { label: 'Status', value: 'Artifact \u2014 Complete' },
      { label: 'Services', value: 'Motion Design, Brand Guidelines, Animation' },
    ],
  },
  {
    key: 'codex-chrono-web',
    heading: 'Chrono Web Platform',
    description:
      'Full-stack web platform for time-tracking and project management with a focus on developer experience.',
    tag: '\u5B9F\u9A13',
    code: '0960',
    quote: '\u201CExperimental builds push the boundaries. Not all survive \u2014 but all teach.\u201D',
    quoteAuthor: 'Cirion',
    details: [
      { label: 'Client', value: 'TimeTech' },
      { label: 'Year', value: '2024' },
      { label: 'Mentor', value: 'Cirion \u2014 The Architect' },
      { label: 'Status', value: 'Fragment \u2014 Experimental' },
      { label: 'Services', value: 'Full-stack Development, API Design, DevOps' },
    ],
  },
  {
    key: 'codex-cta',
    heading: 'Add to the Codex.',
    description:
      'Every great project starts as a conversation. Ready to create something worth documenting?',
    tag: '\u51FA\u767A',
    code: '0999',
  },
];

const DEVELOP_SECTIONS: SectionEntry[] = [
  {
    key: 'spark',
    heading: 'Now we build.',
    description:
      'The strategy is charted. The designs are forged. But they\u2019re still pictures on a screen. Now comes the part where vision becomes a living, breathing system that handles real users, real data, and real scale.',
    tag: '\u5EFA\u8A2D',
    code: '0001',
    quote: '\u201CCode is not written. It is architected.\u201D',
    quoteAuthor: 'Cirion',
    details: [
      { label: 'Realm', value: 'The High Tower \u2014 Engineering' },
      { label: 'Guide', value: 'Cirion & The Council of Architects' },
      { label: 'Familiar', value: 'Axiom \u2014 AI Build Guardian' },
    ],
  },
  {
    key: 'blueprint',
    heading: 'The gap.',
    description:
      'Beautiful designs that can\u2019t handle a click. Prototypes that fake every interaction. The chasm between what it looks like and what it does \u2014 that\u2019s what the Tower bridges. Every pixel must become a function. Every animation must perform.',
    tag: '\u8A2D\u8A08\u56F3',
    code: '0002',
    quote: '\u201CA beautiful facade that crumbles under load is not architecture. It is theater.\u201D',
    quoteAuthor: 'Cirion',
  },
  {
    key: 'guide',
    heading: 'The Council assembles.',
    description:
      'Cirion leads the Council of Architects \u2014 master builders who transform blueprints into living systems. They don\u2019t just write code. They engineer experiences that scale, perform, and evolve. Every decision is deliberate. Every component is load-tested.',
    tag: '\u8B70\u4F1A',
    code: '0003',
    details: [
      { label: 'Archetype', value: 'Methodical. Relentless. Precise.' },
      { label: 'Philosophy', value: 'Code forged with intent, tempered by performance' },
      { label: 'Standard', value: 'Nothing ships until it\u2019s been stress-tested' },
    ],
  },
  {
    key: 'tower',
    heading: 'The Tower rises.',
    description:
      'The High Tower is where the impossible becomes inevitable. Layer by layer, floor by floor \u2014 foundations, frameworks, integrations, optimizations. Each level built on the one below. Each system connected to the ones beside it. Architecture that stands.',
    tag: '\u5854',
    code: '0004',
    quote: '\u201CEvery great system is built the same way: one tested brick at a time.\u201D',
    quoteAuthor: 'Cirion',
    details: [
      { label: 'Foundation', value: 'Infrastructure, hosting, and CI/CD pipelines' },
      { label: 'Structure', value: 'Frameworks, APIs, and data architecture' },
      { label: 'Finish', value: 'Performance tuning, QA, and launch readiness' },
    ],
  },
  {
    key: 'shape',
    heading: 'Five pillars.',
    description:
      'Each discipline is a pillar of the Tower. Web and app development raise the walls. E-commerce opens the gates to revenue. AI automation binds intelligent constructs. API integration channels data like water through stone.',
    tag: '\u67F1',
    code: '0005',
    details: [
      { label: 'Web', value: 'Web development \u2014 performant, accessible experiences' },
      { label: 'Mobile', value: 'App development \u2014 native and cross-platform' },
      { label: 'Commerce', value: 'E-commerce \u2014 conversion-optimized storefronts' },
      { label: 'AI', value: 'AI automation \u2014 intelligent workflows that scale' },
      { label: 'APIs', value: 'Integration \u2014 connecting the systems that power you' },
    ],
  },
  {
    key: 'artifacts',
    heading: 'Built and launched.',
    description:
      'You don\u2019t leave with demos. You launch with production systems \u2014 websites that handle traffic spikes, apps that users love, stores that convert, and automations that multiply your team\u2019s output.',
    tag: '\u5DE5\u82B8\u54C1',
    code: '0006',
    details: [
      { label: 'Web Apps', value: 'Performant, accessible digital experiences' },
      { label: 'Mobile', value: 'Native and cross-platform applications' },
      { label: 'Stores', value: 'Conversion-optimized e-commerce' },
      { label: 'AI', value: 'Intelligent automation workflows' },
      { label: 'APIs', value: 'Seamless system integrations' },
    ],
  },
  {
    key: 'companion',
    heading: 'AI that guards the build.',
    description:
      'Axiom, the Tower\u2019s familiar, writes tests before bugs can form. It catches regressions, optimizes performance bottlenecks, and watches every deploy. The Council builds with confidence because Axiom never sleeps.',
    tag: '\u4F7F\u3044\u9B54',
    code: '0007',
    quote: '\u201CAxiom doesn\u2019t replace the architect. It gives them X-ray vision.\u201D',
    quoteAuthor: 'Cirion',
    details: [
      { label: 'Testing', value: 'Automated test suites that catch issues early' },
      { label: 'Perf', value: 'Performance monitoring and optimization' },
      { label: 'Deploy', value: 'CI/CD pipeline management and deploy guardrails' },
    ],
  },
  {
    key: 'cta',
    heading: 'The Tower awaits.',
    description:
      'Bring your designs. The Council will transform them into systems that perform as good as they look. Every great product deserves engineering that matches its ambition.',
    tag: '\u51FA\u767A',
    code: '0008',
  },
];

const CONTACT_SECTIONS: SectionEntry[] = [
  {
    key: 'contact-hero',
    heading: 'Step inside the house.',
    description:
      'Every great creation begins as a conversation. Tell us what you\u2019re building \u2014 we\u2019ll match you with the right mentor and familiar to bring it to life.',
    tag: '\u59CB\u307E\u308A',
    code: '0800',
    quote: '\u201CThe door is always open. The only wrong time to start is never.\u201D',
    quoteAuthor: 'Warehaus',
    details: [
      { label: 'Email', value: 'hello@warehaus.studio' },
      { label: 'Status', value: 'Open for new projects' },
      { label: 'Timeline', value: 'Accepting work for Q2 2026' },
    ],
  },
  {
    key: 'contact-paths',
    heading: 'Three realms, one house.',
    description:
      'Not sure where to start? Each realm specializes in a different stage of the journey. Dream charts the vision, Design gives it form, Develop brings it to life.',
    tag: '\u9053',
    code: '0801',
    details: [
      { label: 'Dream', value: 'Strategy, research, creative direction' },
      { label: 'Design', value: 'UI/UX, brand identity, design systems' },
      { label: 'Develop', value: 'Web, apps, e-commerce, AI automation' },
    ],
  },
  {
    key: 'contact-form',
    heading: 'Tell us everything.',
    description:
      'The more context you share, the better we can match you. Include your timeline, budget range, and what success looks like \u2014 we\u2019ll take it from there.',
    tag: '\u4F1D\u3048\u308B',
    code: '0802',
    details: [
      { label: 'Response', value: 'Within 24 hours on business days' },
      { label: 'First call', value: '30-minute discovery session, no cost' },
      { label: 'Proposal', value: 'Detailed scope within 1 week' },
    ],
  },
];

const mentorRealmMap: Record<string, string> = {
  Korr: 'The Forge \u2014 Design & Craft',
  Vaelen: 'Navigator Realm \u2014 Strategy & Vision',
  Cirion: 'The High Tower \u2014 Engineering',
};

export function buildCodexEntrySections(slug: string): SectionEntry[] {
  const entry = codexEntries.find((e) => e.slug === slug);
  if (!entry) return HOME_SECTIONS;

  const sections: SectionEntry[] = [
    {
      key: 'entry-hero',
      heading: entry.title,
      description: entry.description,
      tag: '\u66F8\u7269',
      code: '0900',
      details: [
        { label: 'Client', value: entry.client },
        { label: 'Year', value: String(entry.year) },
        { label: 'Mentor', value: entry.mentor },
        { label: 'Realm', value: mentorRealmMap[entry.mentor] || 'Unknown' },
        { label: 'Status', value: `${entry.type} \u2014 ${entry.status}` },
      ],
    },
    {
      key: 'entry-overview',
      heading: 'Project overview.',
      description: `A ${entry.category.toLowerCase()} project for ${entry.client}, guided by ${entry.mentor}.`,
      tag: '\u6982\u8981',
      code: '0901',
      details: entry.services.map((s) => ({ label: 'Service', value: s })),
    },
  ];

  if (entry.challenge) {
    sections.push({
      key: 'entry-challenge',
      heading: 'The challenge.',
      description: entry.challenge,
      tag: '\u8AB2\u984C',
      code: '0902',
      ...(entry.approach ? { quote: entry.approach } : {}),
    });
  }

  if (entry.serviceDetails && entry.serviceDetails.length > 0) {
    sections.push({
      key: 'entry-services',
      heading: 'Services applied.',
      description: 'The disciplines and expertise we brought to this project.',
      tag: '\u6280\u8853',
      code: '0903',
      details: entry.serviceDetails.map((sd) => ({ label: sd.name.split(' ')[0], value: sd.description.split('.')[0] + '.' })),
    });
  }

  sections.push({
    key: 'entry-showcase',
    heading: 'The work.',
    description: 'Visual examples and key deliverables from this project.',
    tag: '\u5C55\u793A',
    code: '0904',
  });

  if (entry.results && entry.results.length > 0) {
    sections.push({
      key: 'entry-results',
      heading: 'Results & impact.',
      description: 'Measurable outcomes from this engagement.',
      tag: '\u7D50\u679C',
      code: '0905',
      details: entry.results.map((r) => ({ label: 'Result', value: r })),
    });
  }

  sections.push({
    key: 'entry-nav',
    heading: 'Continue exploring.',
    description: 'Navigate to the next project or return to the full Codex.',
    tag: '\u63A2\u7D22',
    code: '0999',
  });

  return sections;
}

export const STYLEGUIDE_SECTIONS: SectionEntry[] = [
  {
    key: 'brand-hero',
    heading: 'Brand.',
    description: 'The visual and verbal foundations of Warehaus — color, type, and voice.',
    tag: 'ブランド',
    code: '1001',
  },
  {
    key: 'website-hero',
    heading: 'Website.',
    description: 'Layout foundations, components, and motion for the marketing surface.',
    tag: 'ウェブ',
    code: '1002',
  },
  {
    key: 'portal-hero',
    heading: 'Portal.',
    description: 'The product UI kit — forms, states, and navigation for the logged-in experience.',
    tag: 'ポータル',
    code: '1003',
  },
];

export function getSectionsForPath(pathname: string): SectionEntry[] {
  if (pathname === '/style-guide') return STYLEGUIDE_SECTIONS;
  if (pathname === '/dream') return DREAM_SECTIONS;
  if (pathname === '/design') return DESIGN_SECTIONS;
  if (pathname === '/develop') return DEVELOP_SECTIONS;
  if (pathname === '/codex') return CODEX_SECTIONS;
  if (pathname === '/contact') return CONTACT_SECTIONS;
  if (pathname.startsWith('/codex/')) {
    const slug = pathname.replace('/codex/', '');
    return buildCodexEntrySections(slug);
  }
  return HOME_SECTIONS;
}
