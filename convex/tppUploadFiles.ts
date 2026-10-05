"use node";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "./_generated/server";
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
