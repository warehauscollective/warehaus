'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

const JOINED_KEY = 'warehaus-staff-joined';
const FINISH_KEY = 'warehaus-staff-finish';

export type StaffJoined = { name: string; passwordSet: boolean; inviterName?: string };

export type StaffFinish = {
  name: string;
  passwordSet: boolean;
  startedAt: number;
  /** SHA-256 hex of the invite token. The raw token is never stored. */
  tokenHash: string;
  inviterName?: string;
};

/** Same SHA-256 hex as the server token hash. Used only so a reload can resume. */
export async function hashStaffFinishToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
    const inviterName = typeof parsed.inviterName === 'string' ? parsed.inviterName.trim() : '';
    return {
      name: parsed.name.trim(),
      passwordSet: parsed.passwordSet === true,
      ...(inviterName ? { inviterName } : {}),
    };
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
    const parsed = JSON.parse(raw) as Partial<StaffFinish> & { token?: string };
    if (typeof parsed.token === 'string' && parsed.token) {
      clearStaffFinish();
      return null;
    }
    if (!parsed.name?.trim() || typeof parsed.startedAt !== 'number') return null;
    const tokenHash = typeof parsed.tokenHash === 'string' ? parsed.tokenHash : '';
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;
    const inviterName = typeof parsed.inviterName === 'string' ? parsed.inviterName.trim() : '';
    return {
      name: parsed.name.trim(),
      passwordSet: parsed.passwordSet === true,
      startedAt: parsed.startedAt,
      tokenHash,
      ...(inviterName ? { inviterName } : {}),
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
 * False on the server and on the hydration render, so the HTML matches.
 * The layout effect reads sessionStorage before paint, which is what AuthGate
 * needs after a full load. A passive effect would flash "Checking access…".
 */
export function useStaffJustJoined(): boolean {
  const [joined, setJoined] = useState(false);
  useLayoutEffect(() => {
    setJoined(readStaffJoined() !== null);
  }, []);
  return joined;
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
