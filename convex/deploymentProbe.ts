import { v } from "convex/values";
import { query } from "./_generated/server";

// Temporary, read-only marker for measuring backend deployment latency.
export const health = query({
  args: {},
  returns: v.object({
    status: v.literal("ok"),
    buildProbe: v.literal("backend-test-1"),
  }),
  handler: () => ({
    status: "ok" as const,
    buildProbe: "backend-test-1" as const,
  }),
});
