import { ConvexError, v } from "convex/values";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthContext } from "./lib/authContext";
import { importTppRecord, tppSourceId } from "./lib/tppAccountNative";
import { partArgs } from "./lib/tppUploadContract";

const call = {
  load: makeFunctionReference<"query">("tppUpload:load"),
  apply: makeFunctionReference<"mutation">("tppUpload:apply"),
  row: makeFunctionReference<"mutation">("tppUpload:row"),
};
async function access(ctx: Pick<QueryCtx, "auth" | "db">, tenantId?: string) {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || (tenantId && tenantId !== auth.tenantId))
    throw new ConvexError(
      "The organization changed. Switch back to the organization where this import started.",
    );
  if (
    !["manager", "admin", "owner", "system"].includes(auth.role) &&
    !auth.role.endsWith("_manager")
  )
    throw new ConvexError("Only organization managers can import TPP data.");
  return auth;
}
async function own(ctx: QueryCtx | MutationCtx, id: Id<"tppUploads">) {
  const job = await ctx.db.get(id);
  if (!job || job.deletedAt != null) throw new ConvexError("Import not found.");
  await access(ctx, job.tenantId);
  return job;
}
export const start = mutation({
  args: {
    tenantId: v.string(),
    fingerprint: v.string(),
    fileName: v.string(),
    fileSize: v.number(),
    metadata: v.string(),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await access(ctx, args.tenantId);
    if (
      !/^[a-f0-9]{64}$/.test(args.fingerprint) ||
      args.fileSize <= 0 ||
      !Number.isSafeInteger(args.fileSize) ||
      args.metadata.length > 256 * 1024
    )
      throw new ConvexError("Invalid export metadata.");
    new Intl.DateTimeFormat("en", { timeZone: args.timeZone });
    const meta = JSON.parse(args.metadata);
    if (
      meta.format !== "tpp-account-export" ||
      meta.schemaVersion !== "2.0.0" ||
      meta.account?.id == null
    )
      throw new ConvexError("Expected a TPP Brief version 2 export.");
    if (
      !meta.manifest?.counts ||
      typeof meta.manifest.counts !== "object" ||
      Array.isArray(meta.manifest.counts) ||
      Object.entries(meta.manifest.counts).some(
        ([name, count]) =>
          !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) ||
          !Number.isSafeInteger(count) ||
          Number(count) < 0,
      )
    )
      throw new ConvexError(
        "The export manifest has invalid collection counts.",
      );
    const found = await ctx.db
      .query("tppUploads")
      .withIndex("by_tenant_fingerprint", (q) =>
        q.eq("tenantId", auth.tenantId).eq("fingerprint", args.fingerprint),
      )
      .first();
    if (found) return found;
    const now = Date.now();
    const id = await ctx.db.insert("tppUploads", {
      ...args,
      sourceAccount: String(meta.account.id),
      actorId: auth.id,
      status: "uploading",
      nextPart: 0,
      bytesReceived: 0,
      counts: "{}",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    return (await ctx.db.get(id))!;
  },
});
export const get = query({
  args: { id: v.id("tppUploads") },
  handler: (ctx, args) => own(ctx, args.id),
});
export const recent = query({
  args: {},
  handler: async (ctx) => {
    const auth = await access(ctx);
    return await ctx.db
      .query("tppUploads")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .order("desc")
      .take(20);
  },
});
export const uploadUrl = mutation({
  args: { id: v.id("tppUploads") },
  handler: async (ctx, args) => {
    await own(ctx, args.id);
    return ctx.storage.generateUploadUrl();
  },
});
export const parts = query({
  args: { id: v.id("tppUploads"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await own(ctx, args.id);
    return ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) => q.eq("uploadId", args.id))
      .paginate(args.paginationOpts);
  },
});
export const sourceUrl = query({
  args: { partId: v.id("tppUploadParts") },
  handler: async (ctx, args) => {
    const part = await ctx.db.get(args.partId);
    if (!part) throw new ConvexError("Source part not found.");
    await own(ctx, part.uploadId as Id<"tppUploads">);
    return ctx.storage.getUrl(part.storageId as Id<"_storage">);
  },
});
export const load = internalQuery({
  args: { id: v.id("tppUploads"), sequence: v.number() },
  handler: async (ctx, args) => {
    const job = await own(ctx, args.id);
    const part = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).eq("sequence", args.sequence),
      )
      .first();
    return { job, part };
  },
});
export const row = internalMutation({
  args: {
    id: v.id("tppUploads"),
    collection: v.string(),
    sourceId: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    const job = await own(ctx, args.id);
    return importTppRecord(
      ctx,
      job,
      args.collection,
      args.value,
      args.sourceId,
    );
  },
});

export const apply = internalMutation({
  args: { ...partArgs, rows: v.array(v.any()) },
  handler: async (ctx, args): Promise<{ nextPart: number; counts: string }> => {
    const job = await own(ctx, args.id);
    const saved = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).eq("sequence", args.sequence),
      )
      .first();
    if (saved) {
      if (saved.checksum !== args.checksum)
        throw new ConvexError("Part checksum changed.");
      return { nextPart: job.nextPart, counts: job.counts };
    }
    if (job.nextPart !== args.sequence || job.status !== "uploading")
      throw new ConvexError("Import is not ready for this part.");
    const counts = JSON.parse(job.counts) as Record<
      string,
      {
        read: number;
        imported: number;
        preserved: number;
        needs_mapping: number;
        existing: number;
      }
    >;
    const c = counts[args.collection] ?? {
      read: 0,
      imported: 0,
      preserved: 0,
      needs_mapping: 0,
      existing: 0,
    };
    const failures: { id: string; message: string }[] = [];
    for (const [index, value] of args.rows.entries()) {
      const sourceId =
        tppSourceId(value) || `part:${args.sequence}:row:${index}`;
      let outcome;
      try {
        outcome = await ctx.runMutation(call.row, {
          id: args.id,
          collection: args.collection,
          sourceId,
          value,
        });
      } catch (error) {
        outcome = {
          kind: "needs_mapping",
          detail:
            error instanceof Error
              ? error.message
              : "Record could not be mapped.",
        };
      }
      c.read++;
      c[
        outcome.kind as "imported" | "preserved" | "needs_mapping" | "existing"
      ]++;
      if (outcome.detail && outcome.kind === "needs_mapping")
        failures.push({ id: sourceId, message: outcome.detail.slice(0, 600) });
    }
    counts[args.collection] = c;
    const now = Date.now();
    await ctx.db.insert("tppUploadParts", {
      tenantId: job.tenantId,
      uploadId: args.id,
      sequence: args.sequence,
      collection: args.collection,
      storageId: args.storageId,
      checksum: args.checksum,
      byteSize: args.byteSize,
      rowCount: args.rows.length,
      outcome: JSON.stringify({ failures }),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    const nextPart = job.nextPart + 1,
      serialized = JSON.stringify(counts);
    await ctx.db.patch(job._id, {
      nextPart,
      counts: serialized,
      bytesReceived: job.bytesReceived + args.byteSize,
      updatedAt: now,
      version: job.version + 1,
    });
    return { nextPart, counts: serialized };
  },
});
export const finish = mutation({
  args: { id: v.id("tppUploads"), parts: v.number() },
  handler: async (ctx, args) => {
    const job = await own(ctx, args.id);
    if (job.nextPart !== args.parts)
      throw new ConvexError("Some upload parts are missing.");
    const metadata = JSON.parse(job.metadata),
      counts = JSON.parse(job.counts);
    for (const [collection, expected] of Object.entries(
      metadata.manifest.counts,
    ))
      if ((counts[collection]?.read ?? 0) !== expected)
        throw new ConvexError(
          `Record count does not match for ${collection}. Resume the upload.`,
        );
    const mapping = Object.values(counts).some(
      (c: any) => c.needs_mapping > 0 || c.preserved > 0,
    );
    const status =
      mapping || metadata.manifest.status !== "complete"
        ? "completed_with_exceptions"
        : "completed";
    await ctx.db.patch(job._id, {
      status,
      updatedAt: Date.now(),
      version: job.version + 1,
    });
    return status;
  },
});
