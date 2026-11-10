'use client';

import { useEffect, useState } from 'react';

const JOINED_KEY = 'warehaus-staff-joined';
const FINISH_KEY = 'warehaus-staff-finish';

export type StaffJoined = { name: string; passwordSet: boolean };

export type StaffFinish = {
  name: string;
  passwordSet: boolean;
  startedAt: number;
  token: string;
};

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Set only after accept succeeds in this browser tab. Read does not clear it. */
export function rememberStaffJoined(value: StaffJoined): void {
  storage()?.setItem(JOINED_KEY, JSON.stringify(value));
}

/** Non-destructive. Strict mode can read this twice before the welcome commits. */
export function readStaffJoined(): StaffJoined | null {
  try {
    const raw = storage()?.getItem(JOINED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffJoined>;
    if (!parsed.name?.trim()) return null;
    return { name: parsed.name.trim(), passwordSet: parsed.passwordSet === true };
  } catch {
    return null;
  }
}

export function consumeStaffJoined(): void {
  try {
    storage()?.removeItem(JOINED_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberStaffFinish(value: StaffFinish): void {
  storage()?.setItem(FINISH_KEY, JSON.stringify(value));
}

export function readStaffFinish(): StaffFinish | null {
  try {
    const raw = storage()?.getItem(FINISH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffFinish>;
    if (!parsed.name?.trim() || typeof parsed.startedAt !== 'number') return null;
    return {
      name: parsed.name.trim(),
      passwordSet: parsed.passwordSet === true,
      startedAt: parsed.startedAt,
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return null;
  }
}

export function clearStaffFinish(): void {
  try {
    storage()?.removeItem(FINISH_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Shows the welcome once. The saved flag stays through React strict mode's
 * replay, then a macrotask clears it. A refresh after that sees nothing.
 */
export function useStaffJoinedWelcome(): StaffJoined | null {
  const [joined, setJoined] = useState<StaffJoined | null>(null);
  useEffect(() => {
    const saved = readStaffJoined();
    if (saved) setJoined(saved);
    const id = setTimeout(() => {
      consumeStaffJoined();
      clearStaffFinish();
    }, 0);
    return () => clearTimeout(id);
  }, []);
  return joined;
}
