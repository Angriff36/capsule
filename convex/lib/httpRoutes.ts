/**
 * Authored HTTP routes beside the generated router (issues #52, #439).
 * Convex allows one router file and convex/http.ts is generated, so
 * scripts/apply-authored-http-routes.ts makes the generated router call this
 * after its own routes. Add provider callbacks here (for example a Twilio
 * status callback that checks X-Twilio-Signature); each route must verify
 * its sender itself.
 */
import type { HttpRouter } from "convex/server";
import { EMAIL_ROUTE_PATH, receiveEmail } from "../emailInbox";
import { receiveStatus, STATUS_ROUTE_PATH } from "../smsAlertDelivery";
import { receiveText, TEXT_ROUTE_PATH } from "../textInbox";

export function registerAuthoredRoutes(http: HttpRouter): void {
  // Client texts to a company's texting number (PL-INBOX).
  http.route({ path: TEXT_ROUTE_PATH, method: "POST", handler: receiveText });
  // Client emails to a company's Capsule inbox address (PL-INBOX).
  http.route({ path: EMAIL_ROUTE_PATH, method: "POST", handler: receiveEmail });
  // Delivered / not delivered reports for staff alert texts (AC-353, #439).
  http.route({ path: STATUS_ROUTE_PATH, method: "POST", handler: receiveStatus });
}
