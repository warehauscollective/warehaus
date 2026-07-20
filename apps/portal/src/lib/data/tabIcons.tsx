import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  FolderKanban,
  LayoutDashboard,
  MessagesSquare,
  UserRound,
} from 'lucide-react';
import type { PortalTab } from '@warehaus/logic/portal';

/** Icons for the floating dock on small screens (labels remain on desktop). */
export const PORTAL_TAB_ICONS: Record<PortalTab, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  chatroom: MessagesSquare,
  activity: Activity,
  account: UserRound,
};
