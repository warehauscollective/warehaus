// Icon assets from Iconsax - https://iconsax.io
// Used under the Iconsax license, as components only. No Iconsax SVG file is
// copied into this repo. React package: iconsax-reactjs, MIT, copyright Erfan
// Khadivar. See docs/design/iconsax-package-and-license.md.
//
// The one Icon for the Portal, and the only file that imports an icon package.
// It is Figma `Atom/Icon` (281:7631): `name` is the Figma `Name`, `variant` is
// the Figma `Style`. Map: docs/design/iconsax-icon-map.md.
import type { ComponentType, SVGAttributes } from 'react';
import {
  Activity,
  Add,
  ArrowDown2,
  ArrowLeft2,
  ArrowRight2,
  ArrowUp2,
  BookSaved,
  Brush2,
  Building,
  Buildings2,
  Calendar,
  Category,
  Clock,
  CloseCircle,
  Cloud,
  Code,
  Data,
  DocumentText,
  Edit2,
  Element3,
  ExportSquare,
  Eye,
  EyeSlash,
  Figma,
  Filter,
  Global,
  Gps,
  HamburgerMenu,
  InfoCircle,
  Kanban,
  Layer,
  Link,
  Lock,
  Logout,
  Microphone,
  Monitor,
  Moon,
  More,
  Notification,
  People,
  Play,
  Profile,
  Profile2User,
  RecordCircle,
  Refresh,
  SearchNormal,
  Setting2,
  Shield,
  ShieldTick,
  Sms,
  Sun1,
  Task,
  TickCircle,
  UserAdd,
  Warning2,
  type Icon as IconsaxIcon,
} from 'iconsax-reactjs';
import { Check, X, type LucideIcon } from 'lucide-react';
import { tokens } from '@warehaus/tokens';

const ICONSAX = {
  Activity,
  Add,
  ArrowDown2,
  ArrowLeft2,
  ArrowRight2,
  ArrowUp2,
  BookSaved,
  Brush2,
  Building,
  Buildings2,
  Calendar,
  Category,
  Clock,
  CloseCircle,
  Cloud,
  Code,
  Data,
  DocumentText,
  Edit2,
  Element3,
  ExportSquare,
  Eye,
  EyeSlash,
  Figma,
  Filter,
  Global,
  Gps,
  HamburgerMenu,
  InfoCircle,
  Kanban,
  Layer,
  Link,
  Lock,
  Logout,
  Microphone,
  Monitor,
  Moon,
  More,
  Notification,
  People,
  Play,
  Profile,
  Profile2User,
  RecordCircle,
  Refresh,
  SearchNormal,
  Setting2,
  Shield,
  ShieldTick,
  Sms,
  Sun1,
  Task,
  TickCircle,
  UserAdd,
  Warning2,
} satisfies Record<string, IconsaxIcon>;

/** Iconsax has no bare tick and no bare X. These two stay Lucide (Peter, 2026-11-25). */
const LUCIDE = { Check, X } satisfies Record<string, LucideIcon>;

/** Lucide draws a 2px stroke on its 24 grid. Iconsax Linear draws 1.5. */
const LUCIDE_STROKE = 1.5;

export type IconName = keyof typeof ICONSAX | keyof typeof LUCIDE;

/** Every name in the set, in `Atom/Icon` order by name. */
export const ICON_NAMES = [...Object.keys(ICONSAX), ...Object.keys(LUCIDE)].sort() as IconName[];

/** Bold is for the active nav tab only. No other icon has a Bold variant in Figma. */
export const BOLD_ICON_NAMES = ['Activity', 'BookSaved', 'Element3', 'Kanban', 'Profile'] as const;
export type BoldIconName = (typeof BOLD_ICON_NAMES)[number];

/** Box size in px, from `tokens.icon` in `@warehaus/tokens` (`--icon-*` in CSS). */
export const ICON_SIZES = {
  '2xs': parseInt(tokens.icon['2xs'], 10),
  xs: parseInt(tokens.icon.xs, 10),
  sm: parseInt(tokens.icon.sm, 10),
  md: parseInt(tokens.icon.md, 10),
  lg: parseInt(tokens.icon.lg, 10),
  xl: parseInt(tokens.icon.xl, 10),
} as const;
export type IconSize = keyof typeof ICON_SIZES;

/**
 * Colour tokens. Each is a theme variable, so the icon follows Dark and Light.
 * `current` takes the text colour of the parent, which is what a button or a
 * link wants.
 */
export const ICON_COLORS = {
  current: 'currentColor',
  fg: 'var(--fg)',
  muted: 'var(--muted)',
  'accent-fg': 'var(--accent-fg)',
  warning: 'var(--portal-warning)',
  danger: 'var(--danger)',
  success: 'var(--success)',
} as const;
export type IconColor = keyof typeof ICON_COLORS;

type IconBaseProps = Omit<
  SVGAttributes<SVGSVGElement>,
  'name' | 'color' | 'width' | 'height' | 'children' | 'fill' | 'stroke' | 'strokeWidth' | 'viewBox'
> & {
  /** Token size. Default `md`, the 16px box `Atom/Icon` is drawn on. */
  size?: IconSize;
  /** Token colour. Default `current`. */
  color?: IconColor;
  /** Say what the icon means when it stands alone. Without it the icon is hidden from screen readers. */
  label?: string;
};

export type IconProps = IconBaseProps &
  ({ name: IconName; variant?: 'Linear' } | { name: BoldIconName; variant: 'Bold' });

type Glyph = ComponentType<
  SVGAttributes<SVGSVGElement> & { size?: number; color?: string; variant?: 'Linear' | 'Bold' }
>;

export function Icon({ name, variant = 'Linear', size = 'md', color = 'current', label, ...rest }: IconProps) {
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  const shared = { ...rest, ...a11y, size: ICON_SIZES[size], color: ICON_COLORS[color], 'data-icon': name };

  if (name in LUCIDE) {
    const Lucide = LUCIDE[name as keyof typeof LUCIDE];
    return <Lucide {...shared} strokeWidth={LUCIDE_STROKE} />;
  }
  const Iconsax = ICONSAX[name as keyof typeof ICONSAX] as Glyph;
  return <Iconsax {...shared} variant={variant} />;
}
