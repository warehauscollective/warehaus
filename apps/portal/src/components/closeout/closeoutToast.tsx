'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';
import { userFacingErrorMessage } from '@convex/_lib/userFacingError';
import { PortalToast, type PortalToastKind } from '@/components/ui/PortalToast';
import { CLOSEOUT_SAVE_ERROR } from './closeoutCopy';

/** The Undo toast stays this long, the same as a status move. */
export const CLOSEOUT_TOAST_MS = 6000;

export type CloseoutUndo = (() => Promise<unknown>) | null;

type Toast = { id: number; kind: PortalToastKind; message: string; undo: CloseoutUndo };

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One close-out toast at a time, held outside the row or dialog that raised
 * it, so it outlives a task dialog that closes on Archive. A new toast
 * replaces the last one.
 */
export function showCloseoutToast(toast: { kind: PortalToastKind; message: string; undo?: CloseoutUndo }) {
  current = { id: nextId, kind: toast.kind, message: toast.message, undo: toast.undo ?? null };
  nextId += 1;
  emit();
}

export function dismissCloseoutToast(id?: number) {
  if (!current || (id != null && current.id !== id)) return;
  current = null;
  emit();
}

/** For tests. */
export function currentCloseoutToast(): Toast | null {
  return current;
}

const hosts: string[] = [];

/**
 * Mounted by every surface that has close-out controls. Only the first one
 * mounted shows the toast, so a task dialog over a project page shows one.
 */
export function CloseoutToastHost() {
  const id = useId();
  useEffect(() => {
    hosts.push(id);
    emit();
    return () => {
      hosts.splice(hosts.indexOf(id), 1);
      emit();
    };
  }, [id]);
  const toast = useSyncExternalStore(
    subscribe,
    () => (hosts[0] === id ? current : null),
    () => null,
  );
  if (!toast) return null;
  const undo = toast.undo;
  return (
    <PortalToast
      key={toast.id}
      kind={toast.kind}
      testId="closeout-toast"
      message={toast.message}
      autoHideMs={toast.kind === 'error' ? 4000 : CLOSEOUT_TOAST_MS}
      onDismiss={() => dismissCloseoutToast(toast.id)}
      onUndo={
        undo
          ? () => {
              dismissCloseoutToast(toast.id);
              void undo().catch((err) => {
                showCloseoutToast({ kind: 'error', message: userFacingErrorMessage(err, CLOSEOUT_SAVE_ERROR) });
              });
            }
          : undefined
      }
    />
  );
}
