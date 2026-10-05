import { v } from "convex/values";
import { query } from "./_generated/server";
import { BACKEND_RELEASE_SHA } from "./lib/backendRelease";

// Read-only marker: the backend answers, and names the release commit its
// code was deployed from (scripts/deploy-backend.sh stamps it; the release
// receipt reads it). No tenant data.
export const health = query({
  args: {},
  returns: v.object({
    status: v.literal("ok"),
    buildProbe: v.literal("backend-test-1"),
    releaseSha: v.string(),
  }),
  handler: () => ({
    status: "ok" as const,
    buildProbe: "backend-test-1" as const,
    releaseSha: BACKEND_RELEASE_SHA,
  }),
});
