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
// One answer for "missing" and "another organization's import", so a caller
// cannot learn that an import exists elsewhere.
const NOT_FOUND =
  "Import not found in this organization. If you switched organizations, switch back to the one where this import started.";
async function own(ctx: QueryCtx | MutationCtx, id: Id<"tppUploads">) {
  const auth = await access(ctx);
  const job = await ctx.db.get(id);
  if (!job || job.deletedAt != null || job.tenantId !== auth.tenantId)
    throw new ConvexError(NOT_FOUND);
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
    const auth = await access(ctx);
    const part = await ctx.db.get(args.partId);
    if (!part || part.tenantId !== auth.tenantId)
      throw new ConvexError(NOT_FOUND);
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

// Durable parallel transfer queue. Parent collections still finish before
// children, while up to four batches within a collection import concurrently.
const drainRef = makeFunctionReference<"action">("tppUploadFiles:drain");
const recoverRef = makeFunctionReference<"mutation">("tppUpload:recover");
const LEASE_MS = 180_000;
async function kick(ctx: MutationCtx, job: Doc<"tppUploads">) {
  if (
    job.status !== "uploading" ||
    job.processingError ||
    (job.processorToken && (job.processorLeaseUntil ?? 0) > Date.now())
  )
    return;
  const ready = await ctx.db
    .query("tppUploadParts")
    .withIndex("by_upload_sequence", (q) =>
      q.eq("uploadId", job._id).eq("sequence", job.nextPart),
    )
    .first();
  if (!ready) return;
  const token = `${Date.now()}:${job.version}`;
  await ctx.db.patch(job._id, {
    processorToken: token,
    processorLeaseUntil: Date.now() + LEASE_MS,
  });
  await ctx.scheduler.runAfter(0, drainRef, { id: job._id, token });
  await ctx.scheduler.runAfter(LEASE_MS, recoverRef, { id: job._id, token });
}
async function finishQueued(ctx: MutationCtx, job: Doc<"tppUploads">) {
  if (job.totalParts == null || job.nextPart !== job.totalParts) return;
  const metadata = JSON.parse(job.metadata),
    counts = JSON.parse(job.counts);
  for (const [collection, expected] of Object.entries(
    metadata.manifest.counts,
  )) {
    if ((counts[collection]?.read ?? 0) !== expected) {
      await ctx.db.patch(job._id, {
        processingError: `Record count does not match for ${collection}.`,
        processorToken: undefined,
      });
      return;
    }
  }
  const exceptions =
    metadata.manifest.status !== "complete" ||
    Object.values(counts).some(
      (c: any) => c.needs_mapping > 0 || c.preserved > 0,
    );
  await ctx.db.patch(job._id, {
    status: exceptions ? "completed_with_exceptions" : "completed",
    processorToken: undefined,
    updatedAt: Date.now(),
    version: job.version + 1,
  });
}
export const enqueue = mutation({
  args: partArgs,
  handler: async (ctx, args) => {
    const job = await own(ctx, args.id);
    if (
      !Number.isSafeInteger(args.sequence) ||
      args.sequence < 0 ||
      args.byteSize <= 0 ||
      args.byteSize > 24 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(args.checksum)
    )
      throw new ConvexError("Invalid upload receipt.");
    const manifest = JSON.parse(job.metadata).manifest;
    if (
      !["__provenance", "__packages_v1"].includes(args.collection) &&
      !Object.hasOwn(manifest.counts, args.collection)
    )
      throw new ConvexError("Collection is not declared in this export.");
    const saved = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).eq("sequence", args.sequence),
      )
      .first();
    if (saved) {
      if (
        saved.checksum !== args.checksum ||
        saved.collection !== args.collection
      )
        throw new ConvexError("Resume content differs from the saved batch.");
      await kick(ctx, job);
      return (await ctx.db.get(job._id))!;
    }
    if (
      job.status !== "uploading" ||
      (job.totalParts != null && args.sequence >= job.totalParts)
    )
      throw new ConvexError("This import is not accepting new batches.");
    const now = Date.now();
    await ctx.db.insert("tppUploadParts", {
      tenantId: job.tenantId,
      uploadId: args.id,
      sequence: args.sequence,
      collection: args.collection,
      storageId: args.storageId,
      checksum: args.checksum,
      byteSize: args.byteSize,
      rowCount: 0,
      outcome: '{"failures":[]}',
      status: "queued",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await ctx.db.patch(job._id, {
      uploadedParts: (job.uploadedParts ?? job.nextPart) + 1,
      uploadedBytes: (job.uploadedBytes ?? job.bytesReceived) + args.byteSize,
      updatedAt: now,
      version: job.version + 1,
    });
    const updated = (await ctx.db.get(job._id))!;
    await kick(ctx, updated);
    return (await ctx.db.get(job._id))!;
  },
});
export const received = query({
  args: {
    id: v.id("tppUploads"),
    from: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await own(ctx, args.id);
    const result = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).gte("sequence", args.from),
      )
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map((p) => p.sequence) };
  },
});
export const seal = mutation({
  args: { id: v.id("tppUploads"), parts: v.number() },
  handler: async (ctx, args) => {
    const job = await own(ctx, args.id);
    if (
      !Number.isSafeInteger(args.parts) ||
      args.parts < 0 ||
      (job.uploadedParts ?? job.nextPart) !== args.parts
    )
      throw new ConvexError(
        "Some batches are still uploading. Resume the upload.",
      );
    await ctx.db.patch(job._id, {
      totalParts: args.parts,
      updatedAt: Date.now(),
      version: job.version + 1,
    });
    const updated = (await ctx.db.get(job._id))!;
    await finishQueued(ctx, updated);
    await kick(ctx, (await ctx.db.get(job._id))!);
    return (await ctx.db.get(job._id))!;
  },
});
export const resumeProcessing = mutation({
  args: { id: v.id("tppUploads") },
  handler: async (ctx, args) => {
    const job = await own(ctx, args.id);
    await ctx.db.patch(job._id, { processingError: undefined });
    await kick(ctx, (await ctx.db.get(job._id))!);
  },
});
export const recover = internalMutation({
  args: { id: v.id("tppUploads"), token: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (
      job?.processorToken === args.token &&
      (job.processorLeaseUntil ?? 0) <= Date.now()
    )
      await kick(ctx, job);
  },
});
export const queued = internalQuery({
  args: { id: v.id("tppUploads"), token: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.processorToken !== args.token || job.status !== "uploading")
      return null;
    const parts = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).gte("sequence", job.nextPart),
      )
      .take(4);
    const ready: Doc<"tppUploadParts">[] = [];
    for (const p of parts) {
      if (
        p.sequence !== job.nextPart + ready.length ||
        (ready.length && p.collection !== ready[0].collection)
      )
        break;
      ready.push(p);
    }
    return { job, parts: ready };
  },
});
export const importGroup = internalMutation({
  args: {
    job: v.any(),
    id: v.id("tppUploads"),
    token: v.string(),
    sequence: v.number(),
    collection: v.string(),
    offset: v.number(),
    rows: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    // Use the scheduler's immutable job snapshot. Reading the hot progress
    // document here would retry every bulk transaction whenever an upload
    // receipt or another batch advances progress. Row source keys handle races
    // with a recovered worker; only the current lease can finalize receipts.
    const job = args.job as Doc<"tppUploads">;
    if (job._id !== args.id)
      throw new Error("Import job does not match its batch.");
    const outcomes = [];
    for (const [i, row] of args.rows.entries()) {
      const sourceId =
        tppSourceId(row) || `part:${args.sequence}:row:${args.offset + i}`;
      // One transaction per group, not one RPC/auth lookup per record. Throwing
      // rolls back the entire group; the action bisects only failing groups.
      outcomes.push({
        id: sourceId,
        ...(await importTppRecord(ctx, job, args.collection, row, sourceId)),
      });
    }
    return outcomes;
  },
});
export const completeQueued = internalMutation({
  args: {
    id: v.id("tppUploads"),
    token: v.string(),
    sequence: v.number(),
    outcomes: v.array(
      v.object({
        id: v.string(),
        kind: v.string(),
        detail: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.processorToken !== args.token) return;
    const part = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).eq("sequence", args.sequence),
      )
      .first();
    if (!part || part.status !== "queued") return;
    const counts = JSON.parse(job.counts);
    const c = counts[part.collection] ?? {
      read: 0,
      imported: 0,
      preserved: 0,
      needs_mapping: 0,
      existing: 0,
    };
    const failures = [];
    for (const o of args.outcomes) {
      c.read++;
      c[o.kind]++;
      if (o.kind === "needs_mapping")
        failures.push({
          id: o.id,
          message: o.detail ?? "Record could not be mapped.",
        });
    }
    counts[part.collection] = c;
    await ctx.db.patch(part._id, {
      status: "done",
      rowCount: args.outcomes.length,
      outcome: JSON.stringify({ failures }),
      updatedAt: Date.now(),
    });
    let nextPart = job.nextPart;
    for (let i = 0; i < 4; i++) {
      const next = await ctx.db
        .query("tppUploadParts")
        .withIndex("by_upload_sequence", (q) =>
          q.eq("uploadId", job._id).eq("sequence", nextPart),
        )
        .first();
      if (!next || next.status === "queued") break;
      nextPart++;
    }
    await ctx.db.patch(job._id, {
      nextPart,
      counts: JSON.stringify(counts),
      bytesReceived: job.bytesReceived + part.byteSize,
      updatedAt: Date.now(),
      version: job.version + 1,
    });
    await finishQueued(ctx, (await ctx.db.get(job._id))!);
  },
});
export const advance = internalMutation({
  args: {
    id: v.id("tppUploads"),
    token: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.processorToken !== args.token) return;
    await ctx.db.patch(job._id, {
      processorToken: undefined,
      processingError: args.error,
      updatedAt: Date.now(),
      version: job.version + 1,
    });
    if (args.error) return;
    const next = await ctx.db
      .query("tppUploadParts")
      .withIndex("by_upload_sequence", (q) =>
        q.eq("uploadId", args.id).eq("sequence", job.nextPart),
      )
      .first();
    if (next) await kick(ctx, (await ctx.db.get(job._id))!);
  },
});
