const KEY = 'warehaus-staff-joined';

export type StaffJoined = { name: string; passwordSet: boolean };

/** Holds one read across React strict mode's second effect. The saved flag is already gone. */
let handed: StaffJoined | null = null;

/** Set only after accept succeeds in this browser session. */
export function rememberStaffJoined(value: StaffJoined): void {
  handed = null;
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

/** Reads the flag once and clears it. A later read in this session is empty. */
export function readStaffJoined(): StaffJoined | null {
  if (handed) {
    const value = handed;
    handed = null;
    return value;
  }
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffJoined>;
    if (!parsed.name?.trim()) return null;
    const value = { name: parsed.name.trim(), passwordSet: parsed.passwordSet === true };
    handed = value;
    queueMicrotask(() => {
      if (handed === value) handed = null;
    });
    return value;
  } catch {
    return null;
  }
}
