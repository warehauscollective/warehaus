/**
 * Project context: the brief, glossary, and decisions for one project.
 * Each is a Client Docs row linked to the project, so it syncs with Notion
 * through the existing Client Docs path. The values are the Notion
 * "Doc Type" select options.
 */
export const PROJECT_CONTEXT_DOC_TYPES = {
  brief: 'Project Brief',
  glossary: 'Glossary',
  decisions: 'Decisions Log',
} as const;

export type ProjectContextKind = keyof typeof PROJECT_CONTEXT_DOC_TYPES;
export type ProjectContextDocType = (typeof PROJECT_CONTEXT_DOC_TYPES)[ProjectContextKind];

export const PROJECT_CONTEXT_KINDS = Object.keys(PROJECT_CONTEXT_DOC_TYPES) as ProjectContextKind[];

/** Which part of a project's context a doc type holds, or null for any other doc. */
export function projectContextKind(docType: string | null | undefined): ProjectContextKind | null {
  if (!docType) return null;
  for (const kind of PROJECT_CONTEXT_KINDS) {
    if (PROJECT_CONTEXT_DOC_TYPES[kind] === docType) return kind;
  }
  return null;
}
