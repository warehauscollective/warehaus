/** Missing Order sorts last. An Order of 1000 stays before a blank one. */
export function compareDocsByOrder(
  a: { order?: number | null; title: string },
  b: { order?: number | null; title: string },
): number {
  const left = a.order ?? Number.POSITIVE_INFINITY;
  const right = b.order ?? Number.POSITIVE_INFINITY;
  if (left !== right) return left - right;
  return a.title.localeCompare(b.title);
}
