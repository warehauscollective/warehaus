'use client';

import { useLayoutEffect, useState } from 'react';

/** Reads one design-review URL param, such as `?dash=blank`, when it is one of `allowed`. */
export function parseFixtureParam<T extends string>(search: string, key: string, allowed: readonly T[]): T | null {
  const value = new URLSearchParams(search).get(key);
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Design-review screen picked by a URL param. Read only in fixture mode, after
 * mount, so a live page never reacts to it. Page-data modules call this; pages do not.
 */
export function useFixtureParam<T extends string>(fixtures: boolean, key: string, allowed: readonly T[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useLayoutEffect(() => {
    if (!fixtures) return;
    setValue(parseFixtureParam(window.location.search, key, allowed));
    // `allowed` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures, key]);
  return value;
}
