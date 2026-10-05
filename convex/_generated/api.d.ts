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
import type * as analytics from "../analytics.js";
import type * as availability from "../availability.js";
import type * as blogs from "../blogs.js";
import type * as bookings from "../bookings.js";
import type * as bootstrap from "../bootstrap.js";
import type * as calendar from "../calendar.js";
import type * as cleanerPortal from "../cleanerPortal.js";
import type * as cleaners from "../cleaners.js";
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
import type * as lib_auth from "../lib/auth.js";
import type * as lib_invoicePdf from "../lib/invoicePdf.js";
import type * as lib_sendTransactionalEmail from "../lib/sendTransactionalEmail.js";
import type * as lib_sydneyServiceArea from "../lib/sydneyServiceArea.js";
import type * as lib_websiteAnalytics from "../lib/websiteAnalytics.js";
import type * as lib_workReferences from "../lib/workReferences.js";
import type * as platformUsage from "../platformUsage.js";
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
  analytics: typeof analytics;
  availability: typeof availability;
  blogs: typeof blogs;
  bookings: typeof bookings;
  bootstrap: typeof bootstrap;
  calendar: typeof calendar;
  cleanerPortal: typeof cleanerPortal;
  cleaners: typeof cleaners;
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
  "lib/auth": typeof lib_auth;
  "lib/invoicePdf": typeof lib_invoicePdf;
  "lib/sendTransactionalEmail": typeof lib_sendTransactionalEmail;
  "lib/sydneyServiceArea": typeof lib_sydneyServiceArea;
  "lib/websiteAnalytics": typeof lib_websiteAnalytics;
  "lib/workReferences": typeof lib_workReferences;
  platformUsage: typeof platformUsage;
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
