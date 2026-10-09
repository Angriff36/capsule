/**
 * Authored HTTP routes beside the generated router (issues #52, #439).
 * Convex allows one router file and convex/http.ts is generated, so
 * scripts/apply-authored-http-routes.ts makes the generated router call this
 * after its own routes. Add provider callbacks here (for example a Twilio
 * status callback that checks X-Twilio-Signature); each route must verify
 * its sender itself.
 */
import type { HttpRouter } from "convex/server";

export function registerAuthoredRoutes(_http: HttpRouter): void {
  // No authored routes yet.
}
