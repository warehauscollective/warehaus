/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _lib_contactJoin from "../_lib/contactJoin.js";
import type * as _lib_identity from "../_lib/identity.js";
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
import type * as me from "../me.js";
import type * as notionAuth from "../notionAuth.js";
import type * as portalData from "../portalData.js";
import type * as projects from "../projects.js";
import type * as seed from "../seed.js";
import type * as sharedResources from "../sharedResources.js";
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

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_lib/contactJoin": typeof _lib_contactJoin;
  "_lib/identity": typeof _lib_identity;
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
  me: typeof me;
  notionAuth: typeof notionAuth;
  portalData: typeof portalData;
  projects: typeof projects;
  seed: typeof seed;
  sharedResources: typeof sharedResources;
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
