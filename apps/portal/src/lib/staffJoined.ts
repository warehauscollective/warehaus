const KEY = 'warehaus-staff-joined';

export type StaffJoined = { name: string };

/** Set only after accept succeeds in this browser session. */
export function rememberStaffJoined(value: StaffJoined): void {
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function readStaffJoined(): StaffJoined | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffJoined>;
    if (!parsed.name?.trim()) return null;
    return { name: parsed.name.trim() };
  } catch {
    return null;
  }
}
