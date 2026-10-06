"use node";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { partArgs } from "./lib/tppUploadContract";
const call = {
  load: makeFunctionReference<"query">("tppUpload:load"),
  apply: makeFunctionReference<"mutation">("tppUpload:apply"),
};
async function digestHex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  return createHash("sha256")
    .update(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)
    .digest("hex");
}
export const commit = action({
  args: partArgs,
  handler: async (ctx, args): Promise<{ nextPart: number; counts: string }> => {
    const { job, part } = (await ctx.runQuery(call.load, {
      id: args.id,
      sequence: args.sequence,
    })) as { job: Doc<"tppUploads">; part: Doc<"tppUploadParts"> | null };
    if (part) {
      if (part.checksum !== args.checksum)
        throw new ConvexError("Resume content differs from the saved part.");
      return { nextPart: job.nextPart, counts: job.counts };
    }
    if (args.sequence !== job.nextPart)
      throw new ConvexError(
        "Upload parts must arrive in order. Resume this import.",
      );
    const manifest = JSON.parse(job.metadata).manifest;
    if (
      args.collection !== "__provenance" &&
      args.collection !== "__packages_v1" &&
      !Object.hasOwn(manifest.counts, args.collection)
    )
      throw new ConvexError("Collection is not declared in this export.");
    if (args.byteSize > 24 * 1024 * 1024 || args.byteSize <= 0)
      throw new ConvexError("Upload part exceeds its processing limit.");
    const blob = await ctx.storage.get(args.storageId);
    if (!blob || blob.size !== args.byteSize)
      throw new ConvexError("The uploaded part is missing or incomplete.");
    const bytes = await blob.arrayBuffer();
    if ((await digestHex(bytes)) !== args.checksum)
      throw new ConvexError("Upload checksum mismatch; retry this part.");
    let rows: Record<string, any>[] = [];
    let fileIds: string[] = [];
    try {
      if (args.collection !== "__provenance") {
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!Array.isArray(parsed) || parsed.length > 100)
          throw new ConvexError(
            "Expected at most 100 source records per part.",
          );
        rows = parsed;
        for (const item of rows) {
          if (!item || typeof item !== "object" || Array.isArray(item))
            throw new ConvexError("Invalid source record.");
          // Exported binary bytes are retained in the original part and also
          // decoded into file storage so they can be used as normal attachments.
          if (
            args.collection.endsWith("Files") &&
            typeof item.data === "string"
          ) {
            const binary = Buffer.from(item.data, "base64");
            if (
              item.byteLength != null &&
              item.byteLength !== binary.byteLength
            )
              throw new ConvexError("Source document length mismatch.");
            if (item.sha256 && (await digestHex(binary)) !== item.sha256)
              throw new ConvexError("Source document checksum mismatch.");
            const storageId = await ctx.storage.store(
              new Blob([binary], {
                type: item.contentType || "application/octet-stream",
              }),
            );
            fileIds.push(storageId);
            delete item.data;
            item.storageId = storageId;
            item.byteLength = binary.byteLength;
            item.contentSha256 = await digestHex(binary);
          }
        }
      }
      return await ctx.runMutation(call.apply, { ...args, rows });
    } catch (error) {
      // No record writes survive a failed apply transaction.
      for (const id of fileIds) await ctx.storage.delete(id as Id<"_storage">);
      throw error;
    }
  },
});

const queue = {
  load: makeFunctionReference<"query">("tppUpload:queued"),
  group: makeFunctionReference<"mutation">("tppUpload:importGroup"),
  complete: makeFunctionReference<"mutation">("tppUpload:completeQueued"),
  advance: makeFunctionReference<"mutation">("tppUpload:advance"),
};
type Outcome = { id: string; kind: string; detail?: string };
async function bulkImport(
  ctx: ActionCtx,
  args: {
    job: Doc<"tppUploads">;
    id: Id<"tppUploads">;
    token: string;
    sequence: number;
    collection: string;
    offset: number;
    rows: Record<string, any>[];
  },
): Promise<Outcome[]> {
  if (!args.rows.length) return [];
  try {
    return (await ctx.runMutation(queue.group, args)) as Outcome[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      /lease changed|socket|connection|fetch failed|timed out|overloaded/i.test(
        detail,
      )
    )
      throw error;
    if (args.rows.length === 1) {
      const { tppSourceId } = await import("./lib/tppAccountNative");
      return [
        {
          id:
            tppSourceId(args.rows[0]) ||
            `part:${args.sequence}:row:${args.offset}`,
          kind: "needs_mapping",
          detail: detail.slice(0, 2000),
        },
      ];
    }
    const half = Math.floor(args.rows.length / 2);
    // Preserve dependencies and rollback boundaries inside a failing group.
    return [
      ...(await bulkImport(ctx, { ...args, rows: args.rows.slice(0, half) })),
      ...(await bulkImport(ctx, {
        ...args,
        offset: args.offset + half,
        rows: args.rows.slice(half),
      })),
    ];
  }
}
export const drain = internalAction({
  args: { id: partArgs.id, token: v.string() },
  handler: async (ctx, args) => {
    const work = (await ctx.runQuery(queue.load, args)) as {
      job: Doc<"tppUploads">;
      parts: Doc<"tppUploadParts">[];
    } | null;
    if (!work) return;
    const results = await Promise.allSettled(
      work.parts
        .filter((p) => p.status === "queued")
        .map(async (part) => {
          const blob = await ctx.storage.get(part.storageId as Id<"_storage">);
          if (!blob || blob.size !== part.byteSize)
            throw new Error(
              `Stored upload batch ${part.sequence + 1} is missing or incomplete.`,
            );
          const bytes = await blob.arrayBuffer();
          if ((await digestHex(bytes)) !== part.checksum)
            throw new Error(`Checksum mismatch in batch ${part.sequence + 1}.`);
          const rows: Record<string, any>[] =
            part.collection === "__provenance"
              ? []
              : JSON.parse(new TextDecoder().decode(bytes));
          if (
            !Array.isArray(rows) ||
            rows.length > 100 ||
            rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
          )
            throw new Error(`Invalid records in batch ${part.sequence + 1}.`);
          const decoded: { index: number; id: Id<"_storage"> }[] = [];
          try {
            for (const [index, item] of rows.entries()) {
              if (
                !part.collection.endsWith("Files") ||
                typeof item.data !== "string"
              )
                continue;
              const binary = Buffer.from(item.data, "base64");
              if (
                item.byteLength != null &&
                item.byteLength !== binary.byteLength
              )
                throw new Error(
                  `Document length mismatch in batch ${part.sequence + 1}.`,
                );
              const checksum = await digestHex(binary);
              if (item.sha256 && item.sha256 !== checksum)
                throw new Error(
                  `Document checksum mismatch in batch ${part.sequence + 1}.`,
                );
              const id = await ctx.storage.store(
                new Blob([binary], {
                  type: item.contentType || "application/octet-stream",
                }),
              );
              decoded.push({ index, id });
              delete item.data;
              item.storageId = id;
              item.byteLength = binary.byteLength;
              item.contentSha256 = checksum;
            }
            const outcomes = await bulkImport(ctx, {
              ...args,
              job: work.job,
              sequence: part.sequence,
              collection: part.collection,
              offset: 0,
              rows,
            });
            for (const file of decoded)
              if (outcomes[file.index]?.kind === "existing")
                await ctx.storage.delete(file.id);
            await ctx.runMutation(queue.complete, {
              ...args,
              sequence: part.sequence,
              outcomes,
            });
          } catch (error) {
            // A previous group may already have linked a decoded document. Never
            // delete it merely because a later group or receipt write failed.
            throw error;
          }
        }),
    );
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    await ctx.runMutation(queue.advance, {
      ...args,
      error: failed
        ? String(
            failed.reason instanceof Error
              ? failed.reason.message
              : failed.reason,
          ).slice(0, 2000)
        : undefined,
    });
  },
});
