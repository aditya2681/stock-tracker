/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as app from "../app.js";
import type * as bills from "../bills.js";
import type * as deliveryVerification from "../deliveryVerification.js";
import type * as distributors from "../distributors.js";
import type * as gatePasses from "../gatePasses.js";
import type * as priceHistory from "../priceHistory.js";
import type * as products from "../products.js";
import type * as purchases from "../purchases.js";
import type * as register from "../register.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  app: typeof app;
  bills: typeof bills;
  deliveryVerification: typeof deliveryVerification;
  distributors: typeof distributors;
  gatePasses: typeof gatePasses;
  priceHistory: typeof priceHistory;
  products: typeof products;
  purchases: typeof purchases;
  register: typeof register;
  sessions: typeof sessions;
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
