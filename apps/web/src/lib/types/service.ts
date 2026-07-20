export interface ServicePageData {
  realm: string;
  mentor: string;
  sigil: string;
  color: string;
  colorClass: string;
  gradientClass: string;
  loreBlurb: string;
  skills: string[];
  artifacts: { name: string; description: string }[];
  familiarName: string;
  familiarDescription: string;
  ctaText: string;
  href: string;
}

export interface CodexEntry {
  slug: string;
  title: string;
  type: 'artifact' | 'quest' | 'fragment';
  status: 'complete' | 'in-progress' | 'experimental';
  category: string;
  description: string;
  mentor: string;
  year: number;
  services: string[];
  client: string;
  coverImage?: string;
  links?: { label: string; url: string }[];
  challenge?: string;
  approach?: string;
  results?: string[];
  gallery?: string[];
  serviceDetails?: { name: string; description: string }[];
}
