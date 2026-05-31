/**
 * The three brand "Worlds" — Dream, Design, Develop — and their art-direction
 * vocabulary. Shared by the Brand panel overview (style guide) and the dedicated
 * /style-guide/worlds page. The `accent` / `palette` reference the site's pillar
 * color tokens so each world stays on the Dream/Design/Develop palette.
 */
export type WorldKey = 'dream' | 'design' | 'develop';

export interface WorldVocab {
  lab: string;
  items: string[];
  forbid?: boolean;
}

export interface WorldPaletteChip {
  nm: string;
  token: string;
  value: string;
}

export interface World {
  key: WorldKey;
  num: string;
  kick: string;
  name: string;
  /** Pillar accent token, e.g. var(--dream-primary). */
  accent: string;
  tag: string;
  prose: string;
  vocab: WorldVocab[];
  palette: WorldPaletteChip[];
}

export const WORLDS: World[] = [
  {
    key: 'dream',
    num: '01',
    kick: 'Strategy · the upstream',
    name: 'Dream',
    accent: 'var(--dream-primary)',
    tag: 'Wide open. Cosmically quiet. Where the question lives before the answer arrives.',
    prose:
      'Dream is the upstream — half-formed visions, celestial maps carved into stone, oracles at the edge of impossible space. Architecture is minimal because the void is the subject. The witness is always tiny, often robed, always alone or in pairs. Light is silver, low, ancient.',
    vocab: [
      { lab: 'Subjects', items: ['Salt flats & cracked plains', 'Ringed apertures, oculi', 'Celestial cartography', 'Reflective stillwater', 'Suspended geometric icons'] },
      { lab: 'Architecture', items: ['Single monumental arch', 'Carved astrolabes in cliffs', 'Ancient stonework, weathered', 'Greek-key & meander motifs', 'Negative space as mass'] },
      { lab: 'Characters', items: ['The Cartographer (robed)', 'The Pilgrim (alone, walking)', 'The Pair (silent, observing)', 'Slow, deliberate, contemplative', 'Faces unseen or in shadow'] },
      { lab: 'Atmosphere', items: ['Dawn or pre-storm dusk', 'Bleached bone & warm sand', 'One impossible color object', 'Heat shimmer, light wind', 'Vast horizontal silence'] },
      { lab: 'Forbidden', forbid: true, items: ['Crowds & markets', 'Forests & lush green', 'Cities & skylines', 'Glow effects, neon', 'Symmetrical compositions'] },
    ],
    palette: [
      { nm: 'Primary', token: '--dream-primary', value: 'var(--dream-primary)' },
      { nm: 'Secondary', token: '--dream-secondary', value: 'var(--dream-secondary)' },
      { nm: 'Dim', token: '--dream-dim', value: 'var(--dream-dim)' },
      { nm: 'Deep', token: '--dream-bg-deep', value: 'var(--dream-bg-deep)' },
      { nm: 'Mid', token: '--dream-bg-mid', value: 'var(--dream-bg-mid)' },
    ],
  },
  {
    key: 'design',
    num: '02',
    kick: 'Craft · the workshop',
    name: 'Design',
    accent: 'var(--design-primary)',
    tag: 'Hands at work. Tools on the wall. Where the form is forged, plate by plate.',
    prose:
      'Design is the workshop — guild halls and bonsai courtyards, blueprint overlays and water-tile floors. Every surface was crafted; there is ornament, mosaic, joinery, mechanism. Architecture is intricate but legible. Trees and figures live alongside the work. Light is warm interior — lanterns, hearths, lamp-lit windows.',
    vocab: [
      { lab: 'Subjects', items: ['Forges, ateliers, workshops', 'Bonsai & cultivated trees', 'Marketplaces & pavilions', 'Blueprints overlaid on scenes', 'Water gardens, lily pads'] },
      { lab: 'Architecture', items: ['Brutalist concrete megastructures', 'Mosaic-tiled arched columns', 'Tiered amphitheaters', 'Industrial + organic', 'Floating workshop platforms'] },
      { lab: 'Characters', items: ['The Maker (busy, focused)', 'The Merchant (gesturing)', 'Crowds in soft scale', 'Boatmen, gardeners, students', 'Daily life at human pace'] },
      { lab: 'Atmosphere', items: ['Mid-morning & warm dusk', 'Lantern glow, hearth light', 'Mossy greens & bronze warmth', 'Diffuse light through canopy', 'Steam, dust, smoke, life'] },
      { lab: 'Forbidden', forbid: true, items: ['Empty hero shots', 'Pure machine cleanliness', 'Astrological symbolism', 'Vast horizons (Dream)', 'Skyline cityscapes (Develop)'] },
    ],
    palette: [
      { nm: 'Primary', token: '--design-primary', value: 'var(--design-primary)' },
      { nm: 'Secondary', token: '--design-secondary', value: 'var(--design-secondary)' },
      { nm: 'Dim', token: '--design-dim', value: 'var(--design-dim)' },
      { nm: 'Deep', token: '--design-bg-deep', value: 'var(--design-bg-deep)' },
      { nm: 'Mid', token: '--design-bg-mid', value: 'var(--design-bg-mid)' },
    ],
  },
  {
    key: 'develop',
    num: '03',
    kick: 'Build · the megacity',
    name: 'Develop',
    accent: 'var(--develop-primary)',
    tag: 'Built at impossible scale. Half cathedral, half datacenter. Where it ships.',
    prose:
      'Develop is the megacity — cliff-clinging skyrises, ringed orbital stations, gothic-cyber bridges, airships at altitude. Architecture is dense, layered, mythically tall. Mass is the subject; the witness is dwarfed by infrastructure. Light is theatrical — moonglow, lantern-spangled towers, the warm bleed of inhabited windows.',
    vocab: [
      { lab: 'Subjects', items: ['Megastructure ring stations', 'Cliff-mounted gothic cities', 'Bridges, viaducts, skyrails', 'Airships, lanternpunk dirigibles', 'Canals at canyon depth'] },
      { lab: 'Architecture', items: ['Vertical density, layered ledges', 'Orbital ring + gothic spire', 'Industrial pipework + ornament', 'Domes, aqueducts, observatories', 'Brick over steel over stone'] },
      { lab: 'Characters', items: ['The Engineer (tiny, on a ledge)', 'The Citizen (balcony, mid-walk)', 'Boats, freighters, gondolas', 'Crowds as texture, not subject', 'Always dwarfed by the build'] },
      { lab: 'Atmosphere', items: ['Twilight or moonlit night', 'Inhabited window-glow, warm', 'Burnt amber + deep teal sky', 'Distance lost in fog haze', 'Rim-lit edges, no flat blacks'] },
      { lab: 'Forbidden', forbid: true, items: ['Empty desert (Dream)', 'Single workshops (Design)', 'Sci-fi chrome / clean white', 'Blade-Runner neon signage', 'Modern photoreal cityscapes'] },
    ],
    palette: [
      { nm: 'Primary', token: '--develop-primary', value: 'var(--develop-primary)' },
      { nm: 'Secondary', token: '--develop-secondary', value: 'var(--develop-secondary)' },
      { nm: 'Dim', token: '--develop-dim', value: 'var(--develop-dim)' },
      { nm: 'Deep', token: '--develop-bg-deep', value: 'var(--develop-bg-deep)' },
      { nm: 'Mid', token: '--develop-bg-mid', value: 'var(--develop-bg-mid)' },
    ],
  },
];

export function getWorld(key: string): World | undefined {
  return WORLDS.find((w) => w.key === key);
}

/** Sub-section nav for a single world's page tab. Keys are prefixed by world. */
export const WORLD_SECTION_SLUGS = [
  'overview',
  'subjects',
  'architecture',
  'characters',
  'atmosphere',
  'forbidden',
  'palette',
] as const;
