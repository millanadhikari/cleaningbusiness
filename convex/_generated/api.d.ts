/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminInvitations from "../adminInvitations.js";
import type * as agencies from "../agencies.js";
import type * as agencyPortal from "../agencyPortal.js";
import type * as aiBookingTools from "../aiBookingTools.js";
import type * as aiTools from "../aiTools.js";
import type * as aiWriteTools from "../aiWriteTools.js";
import type * as analytics from "../analytics.js";
import type * as availability from "../availability.js";
import type * as blogs from "../blogs.js";
import type * as bookingChangeRequests from "../bookingChangeRequests.js";
import type * as bookings from "../bookings.js";
import type * as bootstrap from "../bootstrap.js";
import type * as calendar from "../calendar.js";
import type * as chat from "../chat.js";
import type * as chatData from "../chatData.js";
import type * as cleanerPortal from "../cleanerPortal.js";
import type * as cleaners from "../cleaners.js";
import type * as crmAi from "../crmAi.js";
import type * as crmAiData from "../crmAiData.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as emails from "../emails.js";
import type * as gmail from "../gmail.js";
import type * as gmailActions from "../gmailActions.js";
import type * as http from "../http.js";
import type * as invoiceData from "../invoiceData.js";
import type * as invoices from "../invoices.js";
import type * as lib_ai_cloudflare from "../lib/ai/cloudflare.js";
import type * as lib_ai_prompts from "../lib/ai/prompts.js";
import type * as lib_ai_provider from "../lib/ai/provider.js";
import type * as lib_ai_tools from "../lib/ai/tools.js";
import type * as lib_ai_types from "../lib/ai/types.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_invoicePdf from "../lib/invoicePdf.js";
import type * as lib_quotePdf from "../lib/quotePdf.js";
import type * as lib_sendTransactionalEmail from "../lib/sendTransactionalEmail.js";
import type * as lib_sydneyServiceArea from "../lib/sydneyServiceArea.js";
import type * as lib_websiteAnalytics from "../lib/websiteAnalytics.js";
import type * as lib_workReferences from "../lib/workReferences.js";
import type * as platformUsage from "../platformUsage.js";
import type * as quoteData from "../quoteData.js";
import type * as quoteDocuments from "../quoteDocuments.js";
import type * as quoteRequests from "../quoteRequests.js";
import type * as references from "../references.js";
import type * as serviceAreas from "../serviceAreas.js";
import type * as services from "../services.js";
import type * as stripeData from "../stripeData.js";
import type * as stripePayments from "../stripePayments.js";
import type * as users from "../users.js";
import type * as websiteAnalytics from "../websiteAnalytics.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminInvitations: typeof adminInvitations;
  agencies: typeof agencies;
  agencyPortal: typeof agencyPortal;
  aiBookingTools: typeof aiBookingTools;
  aiTools: typeof aiTools;
  aiWriteTools: typeof aiWriteTools;
  analytics: typeof analytics;
  availability: typeof availability;
  blogs: typeof blogs;
  bookingChangeRequests: typeof bookingChangeRequests;
  bookings: typeof bookings;
  bootstrap: typeof bootstrap;
  calendar: typeof calendar;
  chat: typeof chat;
  chatData: typeof chatData;
  cleanerPortal: typeof cleanerPortal;
  cleaners: typeof cleaners;
  crmAi: typeof crmAi;
  crmAiData: typeof crmAiData;
  crons: typeof crons;
  customers: typeof customers;
  dashboard: typeof dashboard;
  emailDelivery: typeof emailDelivery;
  emailTemplates: typeof emailTemplates;
  emails: typeof emails;
  gmail: typeof gmail;
  gmailActions: typeof gmailActions;
  http: typeof http;
  invoiceData: typeof invoiceData;
  invoices: typeof invoices;
  "lib/ai/cloudflare": typeof lib_ai_cloudflare;
  "lib/ai/prompts": typeof lib_ai_prompts;
  "lib/ai/provider": typeof lib_ai_provider;
  "lib/ai/tools": typeof lib_ai_tools;
  "lib/ai/types": typeof lib_ai_types;
  "lib/auth": typeof lib_auth;
  "lib/invoicePdf": typeof lib_invoicePdf;
  "lib/quotePdf": typeof lib_quotePdf;
  "lib/sendTransactionalEmail": typeof lib_sendTransactionalEmail;
  "lib/sydneyServiceArea": typeof lib_sydneyServiceArea;
  "lib/websiteAnalytics": typeof lib_websiteAnalytics;
  "lib/workReferences": typeof lib_workReferences;
  platformUsage: typeof platformUsage;
  quoteData: typeof quoteData;
  quoteDocuments: typeof quoteDocuments;
  quoteRequests: typeof quoteRequests;
  references: typeof references;
  serviceAreas: typeof serviceAreas;
  services: typeof services;
  stripeData: typeof stripeData;
  stripePayments: typeof stripePayments;
  users: typeof users;
  websiteAnalytics: typeof websiteAnalytics;
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

export declare const components: {};
