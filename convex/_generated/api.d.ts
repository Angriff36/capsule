/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authStatus from "../authStatus.js";
import type * as clientPortal from "../clientPortal.js";
import type * as computed from "../computed.js";
import type * as crons from "../crons.js";
import type * as emailNotifications from "../emailNotifications.js";
import type * as equipmentCheckout from "../equipmentCheckout.js";
import type * as fileStorage from "../fileStorage.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as http from "../http.js";
import type * as inventoryAudit from "../inventoryAudit.js";
import type * as invoicePayments from "../invoicePayments.js";
import type * as invoiceReminders from "../invoiceReminders.js";
import type * as lib_authContext from "../lib/authContext.js";
import type * as lib_clientPortalToken from "../lib/clientPortalToken.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_equipmentReservationAvailability from "../lib/equipmentReservationAvailability.js";
import type * as lib_googleCalendar from "../lib/googleCalendar.js";
import type * as lib_invoiceReminderPdf from "../lib/invoiceReminderPdf.js";
import type * as lib_orgCapabilityGate from "../lib/orgCapabilityGate.js";
import type * as lib_qboSync from "../lib/qboSync.js";
import type * as lib_twilio from "../lib/twilio.js";
import type * as lib_vehicleDeliveryAvailability from "../lib/vehicleDeliveryAvailability.js";
import type * as mutations from "../mutations.js";
import type * as personalDataExport from "../personalDataExport.js";
import type * as qboSync from "../qboSync.js";
import type * as queries from "../queries.js";
import type * as recurringEvents from "../recurringEvents.js";
import type * as sagas from "../sagas.js";
import type * as search from "../search.js";
import type * as smsAlerts from "../smsAlerts.js";
import type * as vehicleAssignment from "../vehicleAssignment.js";
import type * as webhookIntegrations from "../webhookIntegrations.js";
import type * as workforceScheduling from "../workforceScheduling.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authStatus: typeof authStatus;
  clientPortal: typeof clientPortal;
  computed: typeof computed;
  crons: typeof crons;
  emailNotifications: typeof emailNotifications;
  equipmentCheckout: typeof equipmentCheckout;
  fileStorage: typeof fileStorage;
  googleCalendar: typeof googleCalendar;
  http: typeof http;
  inventoryAudit: typeof inventoryAudit;
  invoicePayments: typeof invoicePayments;
  invoiceReminders: typeof invoiceReminders;
  "lib/authContext": typeof lib_authContext;
  "lib/clientPortalToken": typeof lib_clientPortalToken;
  "lib/encryption": typeof lib_encryption;
  "lib/equipmentReservationAvailability": typeof lib_equipmentReservationAvailability;
  "lib/googleCalendar": typeof lib_googleCalendar;
  "lib/invoiceReminderPdf": typeof lib_invoiceReminderPdf;
  "lib/orgCapabilityGate": typeof lib_orgCapabilityGate;
  "lib/qboSync": typeof lib_qboSync;
  "lib/twilio": typeof lib_twilio;
  "lib/vehicleDeliveryAvailability": typeof lib_vehicleDeliveryAvailability;
  mutations: typeof mutations;
  personalDataExport: typeof personalDataExport;
  qboSync: typeof qboSync;
  queries: typeof queries;
  recurringEvents: typeof recurringEvents;
  sagas: typeof sagas;
  search: typeof search;
  smsAlerts: typeof smsAlerts;
  vehicleAssignment: typeof vehicleAssignment;
  webhookIntegrations: typeof webhookIntegrations;
  workforceScheduling: typeof workforceScheduling;
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
