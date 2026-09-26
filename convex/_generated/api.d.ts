/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as blogs from "../blogs.js";
import type * as bookings from "../bookings.js";
import type * as bootstrap from "../bootstrap.js";
import type * as customers from "../customers.js";
import type * as dashboard from "../dashboard.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_sendTransactionalEmail from "../lib/sendTransactionalEmail.js";
import type * as quoteRequests from "../quoteRequests.js";
import type * as services from "../services.js";
import type * as stripeData from "../stripeData.js";
import type * as stripePayments from "../stripePayments.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  blogs: typeof blogs;
  bookings: typeof bookings;
  bootstrap: typeof bootstrap;
  customers: typeof customers;
  dashboard: typeof dashboard;
  emailDelivery: typeof emailDelivery;
  emailTemplates: typeof emailTemplates;
  emails: typeof emails;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/sendTransactionalEmail": typeof lib_sendTransactionalEmail;
  quoteRequests: typeof quoteRequests;
  services: typeof services;
  stripeData: typeof stripeData;
  stripePayments: typeof stripePayments;
  users: typeof users;
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
