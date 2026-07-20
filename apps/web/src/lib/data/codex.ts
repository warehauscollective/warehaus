import type { CodexEntry } from '@/lib/types/service';

export const codexEntries: CodexEntry[] = [
  {
    slug: 'nexus-brand-identity',
    title: 'Nexus Brand Identity',
    type: 'artifact',
    status: 'complete',
    category: 'Branding',
    description:
      'Complete visual identity for a tech startup disrupting the logistics space. We crafted everything from the logo system to digital touchpoints.',
    mentor: 'Korr',
    year: 2024,
    services: ['Brand Strategy', 'Visual Identity', 'Guidelines'],
    client: 'Nexus Corp',
    coverImage: '/images/hero/bg-1.png',
    challenge:
      'Nexus needed to stand out in an overcrowded logistics tech market. Their existing brand felt generic and failed to communicate the innovative, AI-driven approach that set them apart.',
    approach:
      'We started with deep market research and competitor analysis, then developed a visual language rooted in connectivity and precision. The logo system uses interlocking nodes that represent their network-first approach.',
    results: [
      '340% increase in brand recognition within 6 months',
      'Consistent identity across 12+ digital touchpoints',
      'Brand guidelines adopted by 4 partner companies',
    ],
    serviceDetails: [
      { name: 'Brand Strategy', description: 'Market positioning, competitive analysis, brand architecture, and messaging framework that defined how Nexus communicates its unique value.' },
      { name: 'Visual Identity', description: 'Logo system, color palette, typography, iconography, and illustration style that creates a cohesive and recognizable visual language.' },
      { name: 'Guidelines', description: 'Comprehensive brand book covering usage rules, spacing, color applications, tone of voice, and digital/print specifications.' },
    ],
  },
  {
    slug: 'orbital-dashboard',
    title: 'Orbital Dashboard',
    type: 'artifact',
    status: 'complete',
    category: 'Product Design',
    description:
      'Real-time analytics platform for satellite operations and space telemetry. Built with performance-first architecture.',
    mentor: 'Cirion',
    year: 2024,
    services: ['UX Design', 'UI Design', 'Front-end Development'],
    client: 'SpaceOps Inc',
    coverImage: '/images/hero/bg-2.png',
    challenge:
      'SpaceOps operators were drowning in raw telemetry data across disparate systems. They needed a unified command center that could surface critical insights in real-time without information overload.',
    approach:
      'We designed a layered information architecture that surfaces urgency first, then context, then detail. The interface uses adaptive density — expanding and collapsing panels based on operator focus and alert status.',
    results: [
      'Reduced incident response time by 62%',
      'Unified 8 separate monitoring tools into one platform',
      '99.97% uptime since launch',
    ],
    serviceDetails: [
      { name: 'UX Design', description: 'User research with satellite operators, information architecture, workflow mapping, and usability testing across high-stress scenarios.' },
      { name: 'UI Design', description: 'Dark-mode-first interface with adaptive density panels, real-time data visualizations, alert hierarchies, and accessibility compliance.' },
      { name: 'Front-end Development', description: 'React-based SPA with WebSocket real-time data streaming, D3 visualizations, and optimized rendering for 60fps on data-heavy views.' },
    ],
  },
  {
    slug: 'synthwave-campaign',
    title: 'Synthwave Campaign',
    type: 'artifact',
    status: 'complete',
    category: 'Digital',
    description:
      'Multi-channel marketing campaign blending retro-futurism with modern tech aesthetics.',
    mentor: 'Vaelen',
    year: 2023,
    services: ['Campaign Strategy', 'Motion Design', 'Social Content'],
    client: 'RetroWave Media',
    challenge:
      'RetroWave needed to launch a new streaming platform in a market dominated by established players. The campaign had to feel nostalgic yet cutting-edge — familiar but impossible to ignore.',
    approach:
      'We built the campaign around the tension between past and future. Every asset was designed to feel like a memory of something that hasn\'t happened yet — neon-soaked cityscapes rendered with modern motion tools.',
    results: [
      '2.4M impressions across social platforms',
      '18% conversion rate on landing page (3x industry average)',
      'Featured in 3 major design publications',
    ],
    serviceDetails: [
      { name: 'Campaign Strategy', description: 'Audience segmentation, channel strategy, content calendar, and performance KPI framework targeting nostalgia-driven early adopters.' },
      { name: 'Motion Design', description: 'Animated hero videos, social media motion graphics, loading animations, and micro-interactions that bring the retro-future aesthetic to life.' },
      { name: 'Social Content', description: 'Platform-optimized content suite for Instagram, TikTok, and YouTube including stories, reels, and long-form behind-the-scenes content.' },
    ],
  },
  {
    slug: 'aurora-mobile',
    title: 'Aurora Mobile App',
    type: 'quest',
    status: 'in-progress',
    category: 'Product Design',
    description:
      'Weather prediction app featuring cinematic data visualizations and real-time atmospheric rendering.',
    mentor: 'Korr',
    year: 2024,
    services: ['Product Design', 'Prototyping', 'User Research'],
    client: 'Weather.ai',
    challenge:
      'Weather apps are either beautiful but inaccurate, or accurate but ugly. Weather.ai had the best prediction model in the industry but no way to make users feel the forecast instead of just reading it.',
    approach:
      'We\'re designing an experience where the UI itself becomes the weather. Atmospheric shaders respond to real data — fog rolls in, storms crackle, and golden hour glows. The data is always there, but it\'s felt first.',
    results: [
      'Beta testing with 500+ users',
      'Currently in active development',
      'Targeting Q3 2024 launch',
    ],
    serviceDetails: [
      { name: 'Product Design', description: 'End-to-end product design from concept to high-fidelity, including the atmospheric UI system that renders weather conditions as visual environments.' },
      { name: 'Prototyping', description: 'Interactive prototypes using shader-based atmospheric rendering, testing cinematic data visualization concepts with real weather data.' },
      { name: 'User Research', description: 'Behavioral research on how people consume weather data, usability testing of atmospheric interfaces, and accessibility validation.' },
    ],
  },
  {
    slug: 'helix-motion',
    title: 'Helix Motion System',
    type: 'artifact',
    status: 'complete',
    category: 'Motion',
    description:
      'Comprehensive motion design language for a biotech company, applied across digital and physical touchpoints.',
    mentor: 'Korr',
    year: 2023,
    services: ['Motion Design', 'Brand Guidelines', 'Animation'],
    client: 'BioGenex',
    challenge:
      'BioGenex\'s groundbreaking gene therapy work needed a visual language that communicated both scientific precision and human warmth. Static design couldn\'t capture the dynamic nature of their work.',
    approach:
      'We developed a motion language inspired by molecular structures and DNA helices. Every animation follows biological principles — growth, division, connection, transformation. Motion becomes the brand.',
    results: [
      'Motion system adopted across 20+ touchpoints',
      'Conference presentations saw 45% higher engagement',
      'System licensed by 2 partner organizations',
    ],
    serviceDetails: [
      { name: 'Motion Design', description: 'A complete motion language with easing curves, timing principles, and choreography rules inspired by molecular biology and organic growth patterns.' },
      { name: 'Brand Guidelines', description: 'Extended brand book covering motion principles, animation do\'s and don\'ts, timing charts, and platform-specific implementation guides.' },
      { name: 'Animation', description: 'Library of reusable animations including logo reveals, transition sets, data visualization animations, and presentation templates.' },
    ],
  },
  {
    slug: 'chrono-web',
    title: 'Chrono Web Platform',
    type: 'fragment',
    status: 'experimental',
    category: 'Development',
    description:
      'Full-stack web platform for time-tracking and project management with a focus on developer experience.',
    mentor: 'Cirion',
    year: 2024,
    services: ['Full-stack Development', 'API Design', 'DevOps'],
    client: 'TimeTech',
    challenge:
      'Developers hate time-tracking tools because they interrupt flow state. TimeTech wanted to build a tool that tracks time without the developer ever having to think about it.',
    approach:
      'We\'re experimenting with ambient time tracking — git commits, IDE activity, and communication patterns automatically generate time entries. The developer only reviews, never inputs.',
    results: [
      'Experimental build — testing core hypothesis',
      'Git-based time inference achieving 87% accuracy',
      'Internal dogfooding with 3 development teams',
    ],
    serviceDetails: [
      { name: 'Full-stack Development', description: 'Next.js front-end with real-time dashboards, Node.js backend with event-driven architecture, and PostgreSQL for time-series data.' },
      { name: 'API Design', description: 'RESTful + GraphQL hybrid API supporting git webhook integrations, IDE plugins, and third-party calendar sync.' },
      { name: 'DevOps', description: 'Docker-based development environment, GitHub Actions CI/CD, automated testing pipeline, and blue-green deployment strategy.' },
    ],
  },
];
