/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_constantTime from "../_lib/constantTime.js";
import type * as _lib_contactJoin from "../_lib/contactJoin.js";
import type * as _lib_email from "../_lib/email.js";
import type * as _lib_identity from "../_lib/identity.js";
import type * as _lib_localPreviewCatalog from "../_lib/localPreviewCatalog.js";
import type * as _lib_notionSignature from "../_lib/notionSignature.js";
import type * as _lib_passwordRules from "../_lib/passwordRules.js";
import type * as _lib_registration from "../_lib/registration.js";
import type * as _lib_resendCooldown from "../_lib/resendCooldown.js";
import type * as _lib_safeRedirect from "../_lib/safeRedirect.js";
import type * as _lib_seedMarkers from "../_lib/seedMarkers.js";
import type * as _lib_wrappers from "../_lib/wrappers.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as billing_stripe from "../billing/stripe.js";
import type * as billingUpsert from "../billingUpsert.js";
import type * as clientDocs from "../clientDocs.js";
import type * as clientUploads from "../clientUploads.js";
import type * as clients from "../clients.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as localPreview from "../localPreview.js";
import type * as mail from "../mail.js";
import type * as me from "../me.js";
import type * as notionAuth from "../notionAuth.js";
import type * as portalData from "../portalData.js";
import type * as projects from "../projects.js";
import type * as registrationGate from "../registrationGate.js";
import type * as seed from "../seed.js";
import type * as sharedResources from "../sharedResources.js";
import type * as staffProvision from "../staffProvision.js";
import type * as sync_blob from "../sync/blob.js";
import type * as sync_blobGc from "../sync/blobGc.js";
import type * as sync_docBody from "../sync/docBody.js";
import type * as sync_notionApi from "../sync/notionApi.js";
import type * as sync_pull from "../sync/pull.js";
import type * as sync_queue from "../sync/queue.js";
import type * as sync_trigger from "../sync/trigger.js";
import type * as sync_upsert from "../sync/upsert.js";
import type * as taskResponses from "../taskResponses.js";
import type * as tasks from "../tasks.js";
import type * as verificationResend from "../verificationResend.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/constantTime": typeof _lib_constantTime;
  "_lib/contactJoin": typeof _lib_contactJoin;
  "_lib/email": typeof _lib_email;
  "_lib/identity": typeof _lib_identity;
  "_lib/localPreviewCatalog": typeof _lib_localPreviewCatalog;
  "_lib/notionSignature": typeof _lib_notionSignature;
  "_lib/passwordRules": typeof _lib_passwordRules;
  "_lib/registration": typeof _lib_registration;
  "_lib/resendCooldown": typeof _lib_resendCooldown;
  "_lib/safeRedirect": typeof _lib_safeRedirect;
  "_lib/seedMarkers": typeof _lib_seedMarkers;
  "_lib/wrappers": typeof _lib_wrappers;
  auth: typeof auth;
  billing: typeof billing;
  "billing/stripe": typeof billing_stripe;
  billingUpsert: typeof billingUpsert;
  clientDocs: typeof clientDocs;
  clientUploads: typeof clientUploads;
  clients: typeof clients;
  contacts: typeof contacts;
  crons: typeof crons;
  http: typeof http;
  localPreview: typeof localPreview;
  mail: typeof mail;
  me: typeof me;
  notionAuth: typeof notionAuth;
  portalData: typeof portalData;
  projects: typeof projects;
  registrationGate: typeof registrationGate;
  seed: typeof seed;
  sharedResources: typeof sharedResources;
  staffProvision: typeof staffProvision;
  "sync/blob": typeof sync_blob;
  "sync/blobGc": typeof sync_blobGc;
  "sync/docBody": typeof sync_docBody;
  "sync/notionApi": typeof sync_notionApi;
  "sync/pull": typeof sync_pull;
  "sync/queue": typeof sync_queue;
  "sync/trigger": typeof sync_trigger;
  "sync/upsert": typeof sync_upsert;
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
