/** Markers written by `convex/seed.ts`. Read-only checks use this list; nothing is deleted. */

export const SEED_EMAILS = [
  'demo@northbay.test',
  'team@warehaus.co',
  'peter@warehaus.co',
  'ops@northbay.test',
] as const;

export const SEED_EXTERNAL_IDS = [
  'wh_cli_north_bay',
  'wh_cli_warehaus-internal',
  'wh_con_northbay_demo',
  'wh_con_warehaus_team',
  'wh_con_peter_warehaus',
  'wh_prj_northbay_portal',
] as const;

const SEED_EMAIL_SET = new Set<string>(SEED_EMAILS);
const SEED_EXTERNAL_SET = new Set<string>(SEED_EXTERNAL_IDS);

export function seedMatchReasons(input: {
  email?: string | null;
  primaryEmail?: string | null;
  notionPageId?: string | null;
  externalId?: string | null;
  stripeId?: string | null;
}): string[] {
  const reasons: string[] = [];
  const email = input.email?.trim().toLowerCase();
  const primaryEmail = input.primaryEmail?.trim().toLowerCase();
  if (email && SEED_EMAIL_SET.has(email)) reasons.push(`email:${email}`);
  if (primaryEmail && SEED_EMAIL_SET.has(primaryEmail)) reasons.push(`primaryEmail:${primaryEmail}`);
  const notionPageId = input.notionPageId?.trim() ?? '';
  if (notionPageId.startsWith('seed-')) reasons.push(`notionPageId:${notionPageId}`);
  const externalId = input.externalId?.trim() ?? '';
  if (externalId && SEED_EXTERNAL_SET.has(externalId)) reasons.push(`externalId:${externalId}`);
  const stripeId = input.stripeId?.trim() ?? '';
  if (
    stripeId.startsWith('cus_seed_') ||
    stripeId.startsWith('sub_seed_') ||
    stripeId.startsWith('in_seed_')
  ) {
    reasons.push(`stripeId:${stripeId}`);
  }
  return reasons;
}
