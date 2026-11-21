/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_acceptPaths from "../_lib/acceptPaths.js";
import type * as _lib_activityFeed from "../_lib/activityFeed.js";
import type * as _lib_billingEvent from "../_lib/billingEvent.js";
import type * as _lib_constantTime from "../_lib/constantTime.js";
import type * as _lib_contactJoin from "../_lib/contactJoin.js";
import type * as _lib_devAccess from "../_lib/devAccess.js";
import type * as _lib_email from "../_lib/email.js";
import type * as _lib_identity from "../_lib/identity.js";
import type * as _lib_inboundWebhook from "../_lib/inboundWebhook.js";
import type * as _lib_inviteEmailTemplate from "../_lib/inviteEmailTemplate.js";
import type * as _lib_inviteFlow from "../_lib/inviteFlow.js";
import type * as _lib_milestoneDetails from "../_lib/milestoneDetails.js";
import type * as _lib_milestoneOneSeed from "../_lib/milestoneOneSeed.js";
import type * as _lib_milestoneReview from "../_lib/milestoneReview.js";
import type * as _lib_milestones from "../_lib/milestones.js";
import type * as _lib_noticeDedupe from "../_lib/noticeDedupe.js";
import type * as _lib_notificationPrefs from "../_lib/notificationPrefs.js";
import type * as _lib_notionSignature from "../_lib/notionSignature.js";
import type * as _lib_passwordRules from "../_lib/passwordRules.js";
import type * as _lib_portalSearch from "../_lib/portalSearch.js";
import type * as _lib_previewLink from "../_lib/previewLink.js";
import type * as _lib_quarantineActivity from "../_lib/quarantineActivity.js";
import type * as _lib_quarantineRow from "../_lib/quarantineRow.js";
import type * as _lib_registration from "../_lib/registration.js";
import type * as _lib_resendCooldown from "../_lib/resendCooldown.js";
import type * as _lib_revertLimit from "../_lib/revertLimit.js";
import type * as _lib_reviewPreview from "../_lib/reviewPreview.js";
import type * as _lib_safeRedirect from "../_lib/safeRedirect.js";
import type * as _lib_seedMarkers from "../_lib/seedMarkers.js";
import type * as _lib_sessionLifetime from "../_lib/sessionLifetime.js";
import type * as _lib_sessionRevoke from "../_lib/sessionRevoke.js";
import type * as _lib_syncEventRetention from "../_lib/syncEventRetention.js";
import type * as _lib_taskMilestoneLink from "../_lib/taskMilestoneLink.js";
import type * as _lib_taskPlatformRead from "../_lib/taskPlatformRead.js";
import type * as _lib_taskSourceLinks from "../_lib/taskSourceLinks.js";
import type * as _lib_tileLinks from "../_lib/tileLinks.js";
import type * as _lib_tokenCrypto from "../_lib/tokenCrypto.js";
import type * as _lib_uploadBlob from "../_lib/uploadBlob.js";
import type * as _lib_userFacingError from "../_lib/userFacingError.js";
import type * as _lib_wrappers from "../_lib/wrappers.js";
import type * as _lib_writeAuthz from "../_lib/writeAuthz.js";
import type * as agent from "../agent.js";
import type * as agentHttp from "../agentHttp.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as billing_stripe from "../billing/stripe.js";
import type * as billingUpsert from "../billingUpsert.js";
import type * as clientCreate from "../clientCreate.js";
import type * as clientDocs from "../clientDocs.js";
import type * as clientUploads from "../clientUploads.js";
import type * as clients from "../clients.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as devMailbox from "../devMailbox.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as invitesSync from "../invitesSync.js";
import type * as mail from "../mail.js";
import type * as me from "../me.js";
import type * as milestones from "../milestones.js";
import type * as notificationPrefs from "../notificationPrefs.js";
import type * as notionAuth from "../notionAuth.js";
import type * as portalApi from "../portalApi.js";
import type * as portalCatalog from "../portalCatalog.js";
import type * as portalData from "../portalData.js";
import type * as portalTokens from "../portalTokens.js";
import type * as projectCreate from "../projectCreate.js";
import type * as projects from "../projects.js";
import type * as registrationGate from "../registrationGate.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as sharedResources from "../sharedResources.js";
import type * as staffProvision from "../staffProvision.js";
import type * as sync_blob from "../sync/blob.js";
import type * as sync_blobGc from "../sync/blobGc.js";
import type * as sync_docBody from "../sync/docBody.js";
import type * as sync_granola from "../sync/granola.js";
import type * as sync_hide from "../sync/hide.js";
import type * as sync_inbound from "../sync/inbound.js";
import type * as sync_nameKeyBackfill from "../sync/nameKeyBackfill.js";
import type * as sync_notionApi from "../sync/notionApi.js";
import type * as sync_notionWrite from "../sync/notionWrite.js";
import type * as sync_outbox from "../sync/outbox.js";
import type * as sync_outboxWork from "../sync/outboxWork.js";
import type * as sync_projectCreateWrite from "../sync/projectCreateWrite.js";
import type * as sync_pull from "../sync/pull.js";
import type * as sync_queue from "../sync/queue.js";
import type * as sync_revokeSessions from "../sync/revokeSessions.js";
import type * as sync_taskWrite from "../sync/taskWrite.js";
import type * as sync_trigger from "../sync/trigger.js";
import type * as sync_upsert from "../sync/upsert.js";
import type * as taskPlatform from "../taskPlatform.js";
import type * as taskResponses from "../taskResponses.js";
import type * as tasks from "../tasks.js";
import type * as verificationResend from "../verificationResend.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/acceptPaths": typeof _lib_acceptPaths;
  "_lib/activityFeed": typeof _lib_activityFeed;
  "_lib/billingEvent": typeof _lib_billingEvent;
  "_lib/constantTime": typeof _lib_constantTime;
  "_lib/contactJoin": typeof _lib_contactJoin;
  "_lib/devAccess": typeof _lib_devAccess;
  "_lib/email": typeof _lib_email;
  "_lib/identity": typeof _lib_identity;
  "_lib/inboundWebhook": typeof _lib_inboundWebhook;
  "_lib/inviteEmailTemplate": typeof _lib_inviteEmailTemplate;
  "_lib/inviteFlow": typeof _lib_inviteFlow;
  "_lib/milestoneDetails": typeof _lib_milestoneDetails;
  "_lib/milestoneOneSeed": typeof _lib_milestoneOneSeed;
  "_lib/milestoneReview": typeof _lib_milestoneReview;
  "_lib/milestones": typeof _lib_milestones;
  "_lib/noticeDedupe": typeof _lib_noticeDedupe;
  "_lib/notificationPrefs": typeof _lib_notificationPrefs;
  "_lib/notionSignature": typeof _lib_notionSignature;
  "_lib/passwordRules": typeof _lib_passwordRules;
  "_lib/portalSearch": typeof _lib_portalSearch;
  "_lib/previewLink": typeof _lib_previewLink;
  "_lib/quarantineActivity": typeof _lib_quarantineActivity;
  "_lib/quarantineRow": typeof _lib_quarantineRow;
  "_lib/registration": typeof _lib_registration;
  "_lib/resendCooldown": typeof _lib_resendCooldown;
  "_lib/revertLimit": typeof _lib_revertLimit;
  "_lib/reviewPreview": typeof _lib_reviewPreview;
  "_lib/safeRedirect": typeof _lib_safeRedirect;
  "_lib/seedMarkers": typeof _lib_seedMarkers;
  "_lib/sessionLifetime": typeof _lib_sessionLifetime;
  "_lib/sessionRevoke": typeof _lib_sessionRevoke;
  "_lib/syncEventRetention": typeof _lib_syncEventRetention;
  "_lib/taskMilestoneLink": typeof _lib_taskMilestoneLink;
  "_lib/taskPlatformRead": typeof _lib_taskPlatformRead;
  "_lib/taskSourceLinks": typeof _lib_taskSourceLinks;
  "_lib/tileLinks": typeof _lib_tileLinks;
  "_lib/tokenCrypto": typeof _lib_tokenCrypto;
  "_lib/uploadBlob": typeof _lib_uploadBlob;
  "_lib/userFacingError": typeof _lib_userFacingError;
  "_lib/wrappers": typeof _lib_wrappers;
  "_lib/writeAuthz": typeof _lib_writeAuthz;
  agent: typeof agent;
  agentHttp: typeof agentHttp;
  auth: typeof auth;
  billing: typeof billing;
  "billing/stripe": typeof billing_stripe;
  billingUpsert: typeof billingUpsert;
  clientCreate: typeof clientCreate;
  clientDocs: typeof clientDocs;
  clientUploads: typeof clientUploads;
  clients: typeof clients;
  contacts: typeof contacts;
  crons: typeof crons;
  devMailbox: typeof devMailbox;
  http: typeof http;
  invites: typeof invites;
  invitesSync: typeof invitesSync;
  mail: typeof mail;
  me: typeof me;
  milestones: typeof milestones;
  notificationPrefs: typeof notificationPrefs;
  notionAuth: typeof notionAuth;
  portalApi: typeof portalApi;
  portalCatalog: typeof portalCatalog;
  portalData: typeof portalData;
  portalTokens: typeof portalTokens;
  projectCreate: typeof projectCreate;
  projects: typeof projects;
  registrationGate: typeof registrationGate;
  search: typeof search;
  seed: typeof seed;
  sharedResources: typeof sharedResources;
  staffProvision: typeof staffProvision;
  "sync/blob": typeof sync_blob;
  "sync/blobGc": typeof sync_blobGc;
  "sync/docBody": typeof sync_docBody;
  "sync/granola": typeof sync_granola;
  "sync/hide": typeof sync_hide;
  "sync/inbound": typeof sync_inbound;
  "sync/nameKeyBackfill": typeof sync_nameKeyBackfill;
  "sync/notionApi": typeof sync_notionApi;
  "sync/notionWrite": typeof sync_notionWrite;
  "sync/outbox": typeof sync_outbox;
  "sync/outboxWork": typeof sync_outboxWork;
  "sync/projectCreateWrite": typeof sync_projectCreateWrite;
  "sync/pull": typeof sync_pull;
  "sync/queue": typeof sync_queue;
  "sync/revokeSessions": typeof sync_revokeSessions;
  "sync/taskWrite": typeof sync_taskWrite;
  "sync/trigger": typeof sync_trigger;
  "sync/upsert": typeof sync_upsert;
  taskPlatform: typeof taskPlatform;
  taskResponses: typeof taskResponses;
  tasks: typeof tasks;
  verificationResend: typeof verificationResend;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
