/**
 * Draft no-results copy from the B7 search spec.
 * One place for Peter to swap when the wording is approved.
 */
export const SEARCH_NO_RESULTS_COPY = {
  staff: {
    title: (query: string) => `No matches for ‘${query}’`,
    hint: 'Try a project, task, doc or resource name, or clear a filter.',
  },
  client: {
    title: (query: string) => `No matches for ‘${query}’ in items shared with you`,
    hint: 'Only projects, tasks and docs your Warehaus team has shared appear here.',
  },
} as const;
