/** No-op bevel inspector for the portal — full Leva tooling stays on the website. */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

export function useBevelInspector() {
  return {
    enabled: false as boolean,
    selectedId: null as string | null,
    overrides: {} as Record<string, any>,
    register: (_id: string, _meta: any) => undefined,
    unregister: (_id: string) => undefined,
    select: (_id: string) => undefined,
  };
}
