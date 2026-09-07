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
    const personId = auth.personId
      ? ctx.db.normalizeId("people", auth.personId)
      : null;
    const person = personId ? await ctx.db.get(personId) : null;
    return {
      authenticated: identity !== null,
      accountId: identity?.subject ?? null,
      hasRole: identity !== null && auth.role !== "anonymous",
      hasTenant: identity !== null && auth.tenantId !== "",
      role: auth.role,
      roleSource: auth.roleSource,
      personId: auth.personId ?? null,
      profile: person
        ? {
            _id: person._id,
            tenantId: person.tenantId,
            authSubjectId: person.authSubjectId,
            givenName: person.givenName,
            familyName: person.familyName,
            status: person.status,
            deletedAt: person.deletedAt ?? null,
          }
        : null,
      /** Resolved tenant id (organization/workspace id; not a secret). */
      tenantId: auth.tenantId || null,
      disabledCapabilities: auth.disabledCapabilities,
    };
  },
});
