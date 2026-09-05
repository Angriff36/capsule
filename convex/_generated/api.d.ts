/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as authLink from "../authLink.js";
import type * as authProvision from "../authProvision.js";
import type * as authStatus from "../authStatus.js";
import type * as candidateToTeam from "../candidateToTeam.js";
import type * as chatNotifyPreference from "../chatNotifyPreference.js";
import type * as clientPortal from "../clientPortal.js";
import type * as computed from "../computed.js";
import type * as crons from "../crons.js";
import type * as cutover from "../cutover.js";
import type * as driverAssignment from "../driverAssignment.js";
import type * as emailNotifications from "../emailNotifications.js";
import type * as equipmentCheckout from "../equipmentCheckout.js";
import type * as eventDayBriefing from "../eventDayBriefing.js";
import type * as fileStorage from "../fileStorage.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as hiringPipeline from "../hiringPipeline.js";
import type * as http from "../http.js";
import type * as importCommit from "../importCommit.js";
import type * as importCoordinator from "../importCoordinator.js";
import type * as importPipeline from "../importPipeline.js";
import type * as ingredientLookup from "../ingredientLookup.js";
import type * as inventoryAudit from "../inventoryAudit.js";
import type * as invoicePayments from "../invoicePayments.js";
import type * as invoiceReminders from "../invoiceReminders.js";
import type * as kmParser from "../kmParser.js";
import type * as laborSummary from "../laborSummary.js";
import type * as lib_authContext from "../lib/authContext.js";
import type * as lib_blobs from "../lib/blobs.js";
import type * as lib_catalogUnitGrams from "../lib/catalogUnitGrams.js";
import type * as lib_clerkSignInTicket from "../lib/clerkSignInTicket.js";
import type * as lib_clerkStaffAccount from "../lib/clerkStaffAccount.js";
import type * as lib_clientPortalToken from "../lib/clientPortalToken.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_equipmentReservationAvailability from "../lib/equipmentReservationAvailability.js";
import type * as lib_fdcNutrientMapper from "../lib/fdcNutrientMapper.js";
import type * as lib_foodDatabaseClient from "../lib/foodDatabaseClient.js";
import type * as lib_foodDatabaseImage from "../lib/foodDatabaseImage.js";
import type * as lib_foodDensityFromLookup from "../lib/foodDensityFromLookup.js";
import type * as lib_googleCalendar from "../lib/googleCalendar.js";
import type * as lib_householdVolumeParse from "../lib/householdVolumeParse.js";
import type * as lib_ingredientAllergenParser from "../lib/ingredientAllergenParser.js";
import type * as lib_ingredientCatalogImageImport from "../lib/ingredientCatalogImageImport.js";
import type * as lib_ingredientLookupApplyCost from "../lib/ingredientLookupApplyCost.js";
import type * as lib_ingredientLookupApplyNutrition from "../lib/ingredientLookupApplyNutrition.js";
import type * as lib_ingredientLookupAutofill from "../lib/ingredientLookupAutofill.js";
import type * as lib_invoiceReminderPdf from "../lib/invoiceReminderPdf.js";
import type * as lib_kitchenAccessGate from "../lib/kitchenAccessGate.js";
import type * as lib_lookupCostBarcodeDiscovery from "../lib/lookupCostBarcodeDiscovery.js";
import type * as lib_lookupCostFromOpenPrices from "../lib/lookupCostFromOpenPrices.js";
import type * as lib_lookupCostTenantFallback from "../lib/lookupCostTenantFallback.js";
import type * as lib_nutritionUnitScaler from "../lib/nutritionUnitScaler.js";
import type * as lib_openFoodFactsMapper from "../lib/openFoodFactsMapper.js";
import type * as lib_orgCapabilityGate from "../lib/orgCapabilityGate.js";
import type * as lib_parseSearchQuery from "../lib/parseSearchQuery.js";
import type * as lib_personAuthPick from "../lib/personAuthPick.js";
import type * as lib_proposalDraft from "../lib/proposalDraft.js";
import type * as lib_proposalEventCreation from "../lib/proposalEventCreation.js";
import type * as lib_proposalPricing from "../lib/proposalPricing.js";
import type * as lib_proposalRevision from "../lib/proposalRevision.js";
import type * as lib_qboSync from "../lib/qboSync.js";
import type * as lib_servingWeightGrams from "../lib/servingWeightGrams.js";
import type * as lib_staffSignInMailer from "../lib/staffSignInMailer.js";
import type * as lib_staffSignInPassword from "../lib/staffSignInPassword.js";
import type * as lib_teamChatRead from "../lib/teamChatRead.js";
import type * as lib_teamChatScan from "../lib/teamChatScan.js";
import type * as lib_twilio from "../lib/twilio.js";
import type * as lib_typicalKitchenDensity from "../lib/typicalKitchenDensity.js";
import type * as lib_vehicleDeliveryAvailability from "../lib/vehicleDeliveryAvailability.js";
import type * as lib_volumeUnitMl from "../lib/volumeUnitMl.js";
import type * as messageInbox from "../messageInbox.js";
import type * as mutations from "../mutations.js";
import type * as notifications from "../notifications.js";
import type * as personEmployeeNumber from "../personEmployeeNumber.js";
import type * as personalDataExport from "../personalDataExport.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as qboSync from "../qboSync.js";
import type * as queries from "../queries.js";
import type * as quickImport from "../quickImport.js";
import type * as quoteBuilder from "../quoteBuilder.js";
import type * as recurringEvents from "../recurringEvents.js";
import type * as sagas from "../sagas.js";
import type * as search from "../search.js";
import type * as shareLinks from "../shareLinks.js";
import type * as signatureAcceptance from "../signatureAcceptance.js";
import type * as smsAlerts from "../smsAlerts.js";
import type * as sourceProvenance from "../sourceProvenance.js";
import type * as staffSelfReviews from "../staffSelfReviews.js";
import type * as stripeConnect from "../stripeConnect.js";
import type * as teamChat from "../teamChat.js";
import type * as teamChatCursor from "../teamChatCursor.js";
import type * as teamChatPush from "../teamChatPush.js";
import type * as teamChatPushSend from "../teamChatPushSend.js";
import type * as teamChatSend from "../teamChatSend.js";
import type * as tppParser from "../tppParser.js";
import type * as tppReportFavorites from "../tppReportFavorites.js";
import type * as tppReports_contacts from "../tppReports/contacts.js";
import type * as tppReports_events from "../tppReports/events.js";
import type * as tppReports_financial from "../tppReports/financial.js";
import type * as tppReports_general from "../tppReports/general.js";
import type * as tppReports_options from "../tppReports/options.js";
import type * as tppReports_shared from "../tppReports/shared.js";
import type * as vehicleAssignment from "../vehicleAssignment.js";
import type * as webhookIntegrations from "../webhookIntegrations.js";
import type * as workforceScheduling from "../workforceScheduling.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  authLink: typeof authLink;
  authProvision: typeof authProvision;
  authStatus: typeof authStatus;
  candidateToTeam: typeof candidateToTeam;
  chatNotifyPreference: typeof chatNotifyPreference;
  clientPortal: typeof clientPortal;
  computed: typeof computed;
  crons: typeof crons;
  cutover: typeof cutover;
  driverAssignment: typeof driverAssignment;
  emailNotifications: typeof emailNotifications;
  equipmentCheckout: typeof equipmentCheckout;
  eventDayBriefing: typeof eventDayBriefing;
  fileStorage: typeof fileStorage;
  googleCalendar: typeof googleCalendar;
  hiringPipeline: typeof hiringPipeline;
  http: typeof http;
  importCommit: typeof importCommit;
  importCoordinator: typeof importCoordinator;
  importPipeline: typeof importPipeline;
  ingredientLookup: typeof ingredientLookup;
  inventoryAudit: typeof inventoryAudit;
  invoicePayments: typeof invoicePayments;
  invoiceReminders: typeof invoiceReminders;
  kmParser: typeof kmParser;
  laborSummary: typeof laborSummary;
  "lib/authContext": typeof lib_authContext;
  "lib/blobs": typeof lib_blobs;
  "lib/catalogUnitGrams": typeof lib_catalogUnitGrams;
  "lib/clerkSignInTicket": typeof lib_clerkSignInTicket;
  "lib/clerkStaffAccount": typeof lib_clerkStaffAccount;
  "lib/clientPortalToken": typeof lib_clientPortalToken;
  "lib/encryption": typeof lib_encryption;
  "lib/equipmentReservationAvailability": typeof lib_equipmentReservationAvailability;
  "lib/fdcNutrientMapper": typeof lib_fdcNutrientMapper;
  "lib/foodDatabaseClient": typeof lib_foodDatabaseClient;
  "lib/foodDatabaseImage": typeof lib_foodDatabaseImage;
  "lib/foodDensityFromLookup": typeof lib_foodDensityFromLookup;
  "lib/googleCalendar": typeof lib_googleCalendar;
  "lib/householdVolumeParse": typeof lib_householdVolumeParse;
  "lib/ingredientAllergenParser": typeof lib_ingredientAllergenParser;
  "lib/ingredientCatalogImageImport": typeof lib_ingredientCatalogImageImport;
  "lib/ingredientLookupApplyCost": typeof lib_ingredientLookupApplyCost;
  "lib/ingredientLookupApplyNutrition": typeof lib_ingredientLookupApplyNutrition;
  "lib/ingredientLookupAutofill": typeof lib_ingredientLookupAutofill;
  "lib/invoiceReminderPdf": typeof lib_invoiceReminderPdf;
  "lib/kitchenAccessGate": typeof lib_kitchenAccessGate;
  "lib/lookupCostBarcodeDiscovery": typeof lib_lookupCostBarcodeDiscovery;
  "lib/lookupCostFromOpenPrices": typeof lib_lookupCostFromOpenPrices;
  "lib/lookupCostTenantFallback": typeof lib_lookupCostTenantFallback;
  "lib/nutritionUnitScaler": typeof lib_nutritionUnitScaler;
  "lib/openFoodFactsMapper": typeof lib_openFoodFactsMapper;
  "lib/orgCapabilityGate": typeof lib_orgCapabilityGate;
  "lib/parseSearchQuery": typeof lib_parseSearchQuery;
  "lib/personAuthPick": typeof lib_personAuthPick;
  "lib/proposalDraft": typeof lib_proposalDraft;
  "lib/proposalEventCreation": typeof lib_proposalEventCreation;
  "lib/proposalPricing": typeof lib_proposalPricing;
  "lib/proposalRevision": typeof lib_proposalRevision;
  "lib/qboSync": typeof lib_qboSync;
  "lib/servingWeightGrams": typeof lib_servingWeightGrams;
  "lib/staffSignInMailer": typeof lib_staffSignInMailer;
  "lib/staffSignInPassword": typeof lib_staffSignInPassword;
  "lib/teamChatRead": typeof lib_teamChatRead;
  "lib/teamChatScan": typeof lib_teamChatScan;
  "lib/twilio": typeof lib_twilio;
  "lib/typicalKitchenDensity": typeof lib_typicalKitchenDensity;
  "lib/vehicleDeliveryAvailability": typeof lib_vehicleDeliveryAvailability;
  "lib/volumeUnitMl": typeof lib_volumeUnitMl;
  messageInbox: typeof messageInbox;
  mutations: typeof mutations;
  notifications: typeof notifications;
  personEmployeeNumber: typeof personEmployeeNumber;
  personalDataExport: typeof personalDataExport;
  pushSubscriptions: typeof pushSubscriptions;
  qboSync: typeof qboSync;
  queries: typeof queries;
  quickImport: typeof quickImport;
  quoteBuilder: typeof quoteBuilder;
  recurringEvents: typeof recurringEvents;
  sagas: typeof sagas;
  search: typeof search;
  shareLinks: typeof shareLinks;
  signatureAcceptance: typeof signatureAcceptance;
  smsAlerts: typeof smsAlerts;
  sourceProvenance: typeof sourceProvenance;
  staffSelfReviews: typeof staffSelfReviews;
  stripeConnect: typeof stripeConnect;
  teamChat: typeof teamChat;
  teamChatCursor: typeof teamChatCursor;
  teamChatPush: typeof teamChatPush;
  teamChatPushSend: typeof teamChatPushSend;
  teamChatSend: typeof teamChatSend;
  tppParser: typeof tppParser;
  tppReportFavorites: typeof tppReportFavorites;
  "tppReports/contacts": typeof tppReports_contacts;
  "tppReports/events": typeof tppReports_events;
  "tppReports/financial": typeof tppReports_financial;
  "tppReports/general": typeof tppReports_general;
  "tppReports/options": typeof tppReports_options;
  "tppReports/shared": typeof tppReports_shared;
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
