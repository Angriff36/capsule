// AUTHOR-OWNED — not generated. Assistant LLM configuration reads.
//
// The settings page writes through the GENERATED AssistantLlmConfig commands
// (Manifest policies gate them to manage/admin roles). This seam only reads:
//   forCaller     — identity-aware, for the settings page (no apiKey).
//   readForSubject — internal, for the turn action; the action has identity
//                    but Convex actions cannot run identity-aware queries, so
//                    the verified subject is passed explicitly and the tenant
//                    is derived from that subject's Person row. Never exposed
//                    as a public function.
import { v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";

async function personTenantId(
  ctx: QueryCtx,
  subject: string,
): Promise<string | null> {
  const people = await ctx.db
    .query("people")
    .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", subject))
    .collect();
  const person = people.find((p) => p.deletedAt == null);
  return person?.tenantId ?? null;
}

export const forCaller = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { configured: false as const };
    const tenantId = await personTenantId(ctx, identity.subject);
    if (tenantId == null) return { configured: false as const };
    const rows = await ctx.db
      .query("assistantLlmConfigs")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    const row = rows.find((r) => r.deletedAt == null);
    if (!row) return { configured: false as const };
    // apiKey is private — never selected here.
    return {
      configured: true as const,
      baseUrl: row.baseUrl,
      model: row.model,
      configuredAt: row.configuredAt ?? null,
    };
  },
});

export const readForSubject = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const tenantId = await personTenantId(ctx, subject);
    if (tenantId == null) return null;
    const rows = await ctx.db
      .query("assistantLlmConfigs")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect();
    const row = rows.find((r) => r.deletedAt == null);
    if (!row) return null;
    return { baseUrl: row.baseUrl, apiKey: row.apiKey, model: row.model };
  },
});
