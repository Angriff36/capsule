import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../../convex/_generated/dataModel";
export const tppUploadApi = {
  get: makeFunctionReference<
    "query",
    { id: Id<"tppUploads"> },
    Doc<"tppUploads">
  >("tppUpload:get"),
  parts: makeFunctionReference<
    "query",
    {
      id: Id<"tppUploads">;
      paginationOpts: { numItems: number; cursor: string | null };
    },
    { page: Doc<"tppUploadParts">[]; isDone: boolean; continueCursor: string }
  >("tppUpload:parts"),
  sourceUrl: makeFunctionReference<
    "query",
    { partId: Id<"tppUploadParts"> },
    string | null
  >("tppUpload:sourceUrl"),
  start: makeFunctionReference<
    "mutation",
    {
      tenantId: string;
      fingerprint: string;
      fileName: string;
      fileSize: number;
      metadata: string;
      timeZone: string;
    },
    Doc<"tppUploads">
  >("tppUpload:start"),
  uploadUrl: makeFunctionReference<
    "mutation",
    { id: Id<"tppUploads"> },
    string
  >("tppUpload:uploadUrl"),
  commit: makeFunctionReference<
    "action",
    {
      id: Id<"tppUploads">;
      sequence: number;
      collection: string;
      storageId: Id<"_storage">;
      checksum: string;
      byteSize: number;
    },
    { nextPart: number; counts: string }
  >("tppUploadFiles:commit"),
  finish: makeFunctionReference<
    "mutation",
    { id: Id<"tppUploads">; parts: number },
    string
  >("tppUpload:finish"),
  recent: makeFunctionReference<
    "query",
    Record<string, never>,
    Doc<"tppUploads">[]
  >("tppUpload:recent"),
};
