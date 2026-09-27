/**
 * Notion → portal decision for one Contacts page.
 * Placement does not wait for a revert to succeed.
 * Revert and notice actions are returned for a later writer. This function
 * does not call Notion.
 */

import type { InviteStatus } from './mappers';

export type ContactSyncCase = 3 | 4 | 5 | 6 | 7 | 8;

export type ContactSyncAction =
  | {
      type: 'revert';
      field: 'Invite Status' | 'Client Company' | 'Portal Access';
      value: string | null;
      caseId: 4 | 6 | 8;
    }
  | { type: 'killToken'; caseId: 3 | 7 }
  | { type: 'notice'; caseId: ContactSyncCase; message: string };

export type ContactPlacement = 'UPSERT_CONTACT' | 'UPSERT_PENDING_INVITE' | 'SKIP_AND_DROP_PENDING';

export type ContactSyncDecision = {
  placement: ContactPlacement;
  actions: ContactSyncAction[];
  effective: {
    portalAccess: 'Enabled' | 'Disabled';
    inviteStatus?: InviteStatus;
    clientNotionId?: string;
  };
};

const ENDED: readonly InviteStatus[] = ['Revoked', 'Declined', 'Expired'];
const BLOCKED_ENABLED: readonly InviteStatus[] = ['Pending', 'Declined', 'Expired', 'Revoked'];

const NOTICE: Record<ContactSyncCase, string> = {
  3: 'A pending invite was ended in Notion. The token was killed and the pending record was removed.',
  4: 'Invite Status was Pending without a live token. The status was reverted and nothing was granted.',
  5: 'Invite Status was set to Accepted in Notion. Nothing was granted. The token stays live.',
  6: 'Portal Access was enabled on an invite that is not an accepted login. It was reverted to Disabled.',
  7: 'Invite Status was cleared on a pending invite. The token was killed and the pending record was removed.',
  8: 'Client Company changed on a live invite. It was reverted to the inviting client.',
};

export function decideContactSync(input: {
  portalAccess: 'Enabled' | 'Disabled';
  inviteStatus?: InviteStatus;
  source?: string;
  clientNotionId?: string;
  /** True when that Notion client id is synced and Portal access is Enabled. */
  clientEnabled: (notionPageId: string | undefined) => boolean;
  prevInviteStatus?: InviteStatus | null;
  liveToken: { clientNotionPageId: string } | null;
  verifiedAcceptance: boolean;
  /** Values match the last portal write, so do not react with revert or notice. */
  selfWrite?: boolean;
}): ContactSyncDecision {
  const actions: ContactSyncAction[] = [];
  const originalInvite = input.inviteStatus;
  let inviteStatus = input.inviteStatus;
  let portalAccess = input.portalAccess;
  let clientNotionId = input.clientNotionId;
  const token = input.liveToken;

  if (!input.selfWrite) {
    if (inviteStatus === 'Pending' && !token) {
      actions.push({
        type: 'revert',
        field: 'Invite Status',
        value: input.prevInviteStatus ?? null,
        caseId: 4,
      });
      actions.push({ type: 'notice', caseId: 4, message: NOTICE[4] });
      inviteStatus = input.prevInviteStatus ?? undefined;
    }

    if (token && clientNotionId && clientNotionId !== token.clientNotionPageId) {
      actions.push({
        type: 'revert',
        field: 'Client Company',
        value: token.clientNotionPageId,
        caseId: 8,
      });
      actions.push({ type: 'notice', caseId: 8, message: NOTICE[8] });
      clientNotionId = token.clientNotionPageId;
    }

    if (portalAccess === 'Enabled' && originalInvite && BLOCKED_ENABLED.includes(originalInvite)) {
      actions.push({
        type: 'revert',
        field: 'Portal Access',
        value: 'Disabled',
        caseId: 6,
      });
      actions.push({ type: 'notice', caseId: 6, message: NOTICE[6] });
      portalAccess = 'Disabled';
    }

    if (input.prevInviteStatus === 'Pending' && inviteStatus && ENDED.includes(inviteStatus)) {
      actions.push({ type: 'killToken', caseId: 3 });
      actions.push({ type: 'notice', caseId: 3, message: NOTICE[3] });
    }

    if (input.prevInviteStatus === 'Pending' && inviteStatus == null) {
      actions.push({ type: 'killToken', caseId: 7 });
      actions.push({ type: 'notice', caseId: 7, message: NOTICE[7] });
    }

    if (
      input.prevInviteStatus === 'Pending' &&
      inviteStatus === 'Accepted' &&
      !input.verifiedAcceptance
    ) {
      actions.push({ type: 'notice', caseId: 5, message: NOTICE[5] });
    }
  }

  const case5 =
    !input.selfWrite &&
    input.prevInviteStatus === 'Pending' &&
    input.inviteStatus === 'Accepted' &&
    !input.verifiedAcceptance;

  const clientOk = input.clientEnabled(clientNotionId);
  let placement: ContactPlacement = 'SKIP_AND_DROP_PENDING';
  if (!case5 && portalAccess === 'Enabled' && (inviteStatus == null || inviteStatus === 'Accepted') && clientOk) {
    placement = 'UPSERT_CONTACT';
  } else if (
    portalAccess === 'Disabled' &&
    inviteStatus === 'Pending' &&
    input.source === 'portal' &&
    clientOk &&
    token
  ) {
    placement = 'UPSERT_PENDING_INVITE';
  }

  return {
    placement,
    actions,
    effective: { portalAccess, inviteStatus, clientNotionId },
  };
}
