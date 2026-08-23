// AUTHOR-OWNED — not generated. Authentication-status query so the client can
// distinguish "signed in but not provisioned into a workspace" from "ready"
// without exposing token contents (booleans only).
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

export const getAuthStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const auth = await getAuthContext(ctx);
    return {
      authenticated: identity !== null,
      hasRole: identity !== null && auth.role !== "anonymous",
      hasTenant: identity !== null && auth.tenantId !== "",
      role: auth.role,
      roleSource: auth.roleSource,
      personId: auth.personId ?? null,
      disabledCapabilities: auth.disabledCapabilities,
    };
  },
});
