import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../../convex/_generated/dataModel";
export const tppUploadApi = {
  enqueue: makeFunctionReference<
    "mutation",
    {
      id: Id<"tppUploads">;
      sequence: number;
      collection: string;
      storageId: Id<"_storage">;
      checksum: string;
      byteSize: number;
    },
    Doc<"tppUploads">
  >("tppUpload:enqueue"),
  received: makeFunctionReference<
    "query",
    {
      id: Id<"tppUploads">;
      from: number;
      paginationOpts: { numItems: number; cursor: string | null };
    },
    { page: number[]; isDone: boolean; continueCursor: string }
  >("tppUpload:received"),
  seal: makeFunctionReference<
    "mutation",
    { id: Id<"tppUploads">; parts: number },
    Doc<"tppUploads">
  >("tppUpload:seal"),
  resumeProcessing: makeFunctionReference<
    "mutation",
    { id: Id<"tppUploads"> },
    null
  >("tppUpload:resumeProcessing"),
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
