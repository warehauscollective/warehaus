'use client';

import { useEffect, useRef, useState } from 'react';
import {
  hashStaffFinishToken,
  rememberStaffFinish,
  rememberStaffJoined,
  readStaffFinish,
  type StaffFinish,
} from './staffJoined';

export const STAFF_LINK_WAIT_MS = 60_000;

export type StaffLinkSnapshot = {
  state: string;
  isStaff?: boolean;
} | null | undefined;

/** Pure wait decision. Redirect only after the staff contact is linked. Never signs out. */
export function staffLinkPhase(input: {
  waiting: boolean;
  link: StaffLinkSnapshot;
  startedAt: number | null;
  now: number;
  timeoutMs?: number;
}): { finishing: boolean; slow: boolean; redirect: boolean; signOut: false } {
  if (!input.waiting) return { finishing: false, slow: false, redirect: false, signOut: false };
  if (input.link?.state === 'linked' && input.link.isStaff === true) {
    return { finishing: true, slow: false, redirect: true, signOut: false };
  }
  const timeout = input.timeoutMs ?? STAFF_LINK_WAIT_MS;
  const slow = input.startedAt != null && input.now - input.startedAt >= timeout;
  return { finishing: true, slow, redirect: false, signOut: false };
}

/**
 * After accept succeeds, stay on this page until getLinkStatus reports a
 * linked staff member. A reload of the same token resumes the wait.
 */
export function useStaffLinkWait(input: {
  token: string;
  link: StaffLinkSnapshot;
  replace: (path: string) => void;
  timeoutMs?: number;
}) {
  const [finish, setFinish] = useState<StaffFinish | null>(null);
  const [generation, setGeneration] = useState(0);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const replaceRef = useRef(input.replace);
  replaceRef.current = input.replace;
  const redirected = useRef(false);
  void generation;

  useEffect(() => {
    let cancelled = false;
    void hashStaffFinishToken(input.token)
      .then((hash) => {
        if (cancelled) return;
        setTokenHash(hash);
        const saved = readStaffFinish();
        if (saved && saved.tokenHash === hash) setFinish(saved);
      })
      .catch(() => {
        // begin hashes again and still shows the finishing screen.
      });
    return () => {
      cancelled = true;
    };
  }, [input.token]);

  const phase = staffLinkPhase({
    waiting: finish != null,
    link: input.link,
    startedAt: finish?.startedAt ?? null,
    now: Date.now(),
    timeoutMs: input.timeoutMs,
  });

  async function begin(value: { name: string; passwordSet: boolean; inviterName?: string }) {
    let hash = tokenHash;
    try {
      hash = tokenHash ?? (await hashStaffFinishToken(input.token));
    } catch {
      hash = tokenHash;
    }
    const inviterName = value.inviterName?.trim();
    const row: StaffFinish = {
      name: value.name,
      passwordSet: value.passwordSet,
      startedAt: Date.now(),
      tokenHash: hash && /^[0-9a-f]{64}$/.test(hash) ? hash : '0'.repeat(64),
      ...(inviterName ? { inviterName } : {}),
    };
    if (hash && /^[0-9a-f]{64}$/.test(hash)) {
      try {
        rememberStaffFinish(row);
      } catch {
        // The in-memory wait still holds the finishing screen.
      }
    }
    setFinish(row);
  }

  function retry() {
    setFinish((current) => {
      if (!current) return current;
      const row = { ...current, startedAt: Date.now() };
      rememberStaffFinish(row);
      return row;
    });
  }

  useEffect(() => {
    if (!phase.redirect || !finish || redirected.current) return;
    redirected.current = true;
    rememberStaffJoined({
      name: finish.name,
      passwordSet: finish.passwordSet,
      ...(finish.inviterName ? { inviterName: finish.inviterName } : {}),
    });
    replaceRef.current('/');
  }, [phase.redirect, finish]);

  useEffect(() => {
    if (!finish || phase.redirect || phase.slow) return;
    const timeout = input.timeoutMs ?? STAFF_LINK_WAIT_MS;
    const delay = Math.max(0, finish.startedAt + timeout - Date.now());
    const id = setTimeout(() => setGeneration((value) => value + 1), delay);
    return () => clearTimeout(id);
  }, [finish, phase.redirect, phase.slow, input.timeoutMs]);

  return { waiting: phase.finishing, slow: phase.slow, begin, retry };
}
