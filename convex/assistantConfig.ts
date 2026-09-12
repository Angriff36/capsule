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
import type { Id } from "./_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { storageReferencedByTenant } from "./fileStorage";
import { blobReferenced } from "./lib/blobs";

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

async function authContext(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in first.");
  const tenantId = await personTenantId(ctx, identity.subject);
  if (!tenantId) throw new Error("No staff profile is linked to your account.");
  return { subject: identity.subject, tenantId };
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

/** Bind a freshly uploaded blob to its uploader (see AssistantUpload). */
export const registerUpload = mutation({
  args: { storageId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const { subject, tenantId } = await authContext(ctx);
    if (args.storageId.length === 0) throw new Error("Nothing was uploaded.");
    // Registration is only valid for ORPHAN blobs — bytes the caller just
    // uploaded and no record references anywhere. A blob any live row (any
    // tenant) references is refused: own-tenant blobs already resolve through
    // the tenant-reference check, and foreign blobs must never be claimable.
    if (await blobReferenced(ctx, args.storageId)) {
      throw new Error(
        "This file already belongs to a record; it is available to the assistant without registering.",
      );
    }
    const existing = await ctx.db
      .query("assistantUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .collect();
    for (const row of existing) {
      if (
        row.uploadedByAuthSubjectId === subject &&
        row.tenantId === tenantId
      ) {
        return; // already registered by this caller
      }
    }
    await ctx.db.insert("assistantUploads", {
      tenantId,
      storageId: args.storageId,
      uploadedByAuthSubjectId: subject,
      name: args.name,
    });
  },
});

export interface ResolvedAssistantFile {
  storageId: string;
  url: string | null;
}

/**
 * Resolve assistant file references to URLs, scoped exactly like the rest of
 * the file seam: a blob is readable when a live row in the caller's tenant
 * references it, or when the caller registered the upload themselves.
 * Anything else resolves to null — knowing a storage id grants nothing.
 */
export const resolveFiles = internalQuery({
  args: {
    subject: v.string(),
    files: v.array(
      v.object({
        storageId: v.string(),
        kind: v.union(v.literal("image"), v.literal("text")),
      }),
    ),
  },
  handler: async (
    ctx,
    { subject, files },
  ): Promise<ResolvedAssistantFile[]> => {
    const tenantId = await personTenantId(ctx, subject);
    if (tenantId == null)
      return files.map((f) => ({ storageId: f.storageId, url: null }));
    return Promise.all(
      files.map(async (file) => {
        const referenced = await storageReferencedByTenant(
          ctx,
          tenantId,
          file.storageId,
        );
        if (!referenced) {
          const registrations = await ctx.db
            .query("assistantUploads")
            .withIndex("by_storageId", (q) => q.eq("storageId", file.storageId))
            .collect();
          const own = registrations.some(
            (r) =>
              r.tenantId === tenantId && r.uploadedByAuthSubjectId === subject,
          );
          if (!own) return { storageId: file.storageId, url: null };
        }
        return {
          storageId: file.storageId,
          url: await ctx.storage.getUrl(file.storageId as Id<"_storage">),
        };
      }),
    );
  },
});
