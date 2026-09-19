// Client-side executor for assistant tool calls.
//
// Runs each call against the SAME generated mutations/queries the UI uses, in
// the signed-in user's session — identical authz, no separate AI surface
// (docs/generation/2026-07-17-command-api-surface-boundary.md). The execution
// spec ships with every tool call from convex/assistantTurn.ts, so this file
// never imports the command catalog.
import type { FunctionReference } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../lib/api";
import { saveEventFromBeo } from "./eventImportWorkflow";
import {
  parseEventImportDraft,
  type EventImportSource,
} from "../../lib/eventImportDraft";
import type {
  AssistantFile,
  AssistantToolCall,
} from "../../../convex/assistantTurn";

const mutationRefs = api.mutations as unknown as Record<
  string,
  FunctionReference<"mutation">
>;
const queryRefs = api.queries as unknown as Record<
  string,
  FunctionReference<"query">
>;

/** Bound list pages by complete records, never by cutting serialized JSON. */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** Upload limits — the turn action re-checks byte size server-side. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 200 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "tsv",
  "log",
  "yml",
  "yaml",
  "xml",
  "html",
]);

export function classifyFile(
  file: File,
):
  { ok: true; kind: "image" | "text" | "pdf" } | { ok: false; reason: string } {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/")) {
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        reason: `${file.name} is over 5 MB — screenshot it smaller or compress it.`,
      };
    }
    return { ok: true, kind: "image" };
  }
  if (file.type === "application/pdf" || extension === "pdf") {
    if (file.size > MAX_PDF_BYTES) {
      return {
        ok: false,
        reason: `${file.name} is over 20 MB — split it into smaller PDFs.`,
      };
    }
    return { ok: true, kind: "pdf" };
  }
  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    if (file.size > MAX_TEXT_BYTES) {
      return {
        ok: false,
        reason: `${file.name} is over 200 KB — trim it or split it.`,
      };
    }
    return { ok: true, kind: "text" };
  }
  return {
    ok: false,
    reason: `${file.name}: unsupported. Images (≤5 MB), PDFs (≤20 MB), and text files (≤200 KB) work.`,
  };
}

/** Upload via the governed storage seam; returns what the turn action expects. */
export async function uploadAssistantFile(
  convex: ConvexReactClient,
  file: File,
  kind: "image" | "text" | "pdf",
): Promise<AssistantFile> {
  const uploadUrl = await convex.mutation(
    // Authenticated upload URL from the authored file-storage seam.
    api.fileStorage.generateUploadUrl,
    {},
  );
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok)
    throw new Error(`Upload of ${file.name} failed (${response.status}).`);
  const { storageId } = (await response.json()) as { storageId: string };
  // Bind the blob to this uploader — the turn action only inlines files that
  // the caller registered or that the caller's tenant references.
  await convex.mutation(api.assistantConfig.registerUpload, {
    storageId,
    name: file.name,
  });
  return {
    storageId,
    name: file.name,
    mime: file.type || "application/octet-stream",
    kind,
    fileSize: file.size,
    fingerprint: Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

function serialize(result: unknown): string {
  return JSON.stringify(result ?? null);
}

function pageNumber(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (name === "limit" ? 1 : 0)
  ) {
    throw new Error(
      `${name} must be a ${name === "limit" ? "positive" : "nonnegative"} integer.`,
    );
  }
  return name === "limit" ? Math.min(value, MAX_PAGE_SIZE) : value;
}

function compactRecord(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return value;
  const summary: Record<string, unknown> = {};
  const omittedFields: string[] = [];
  for (const [key, field] of Object.entries(value)) {
    // Preserve IDs exactly, including domain `id` alongside Convex `_id`.
    if (
      key === "_id" ||
      key === "id" ||
      key === "docId" ||
      key.endsWith("Id")
    ) {
      summary[key] = field;
    } else if (field !== null && typeof field === "object") {
      omittedFields.push(key);
    } else if (typeof field === "string" && field.length > 240) {
      summary[key] = `${field.slice(0, 240)}…`;
      omittedFields.push(key);
    } else {
      summary[key] = field;
    }
  }
  return { ...summary, _summary: { omittedFields } };
}

function listPage(
  result: unknown,
  parsed: Record<string, unknown>,
  queryName: string,
): string {
  if (!Array.isArray(result))
    throw new Error(`Expected an array from ${queryName}.`);
  if (parsed.search !== undefined && typeof parsed.search !== "string") {
    throw new Error("search must be a string.");
  }
  const search =
    typeof parsed.search === "string" ? parsed.search.trim().toLowerCase() : "";
  const offset = pageNumber(parsed.offset, 0, "offset");
  const limit = pageNumber(parsed.limit, DEFAULT_PAGE_SIZE, "limit");
  const matches = search
    ? result.filter((row) => serialize(row).toLowerCase().includes(search))
    : result;
  const items = matches.slice(offset, offset + limit).map(compactRecord);
  const more = offset + items.length < matches.length;
  const entity = /^list(.+?)By/.exec(queryName)?.[1];
  return serialize({
    items,
    total: matches.length,
    returned: items.length,
    offset,
    limit,
    more,
    nextOffset: more ? offset + items.length : null,
    search,
    summary: true,
    detailTool: entity
      ? `get_${entity.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`
      : null,
    guidance:
      "Use the exact _id with the detail tool to retrieve all fields. Continue with nextOffset and the same search/filter arguments when more is true. Pages reflect live data; an empty list alone does not establish absence or permission denial.",
  });
}

function toEpochMs(value: unknown): unknown {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return value;
}

/**
 * Execute one tool call. Returns the tool message content for the model —
 * never throws: failures become error payloads the model can read and react to.
 */
export async function executeAssistantToolCall(
  convex: ConvexReactClient,
  call: AssistantToolCall,
  context?: {
    sources: EventImportSource[];
    sourceText: string;
    isActive?: () => boolean;
    previousImport?: {
      sources: EventImportSource[];
      sourceText: string;
    } | null;
    rememberImport?: (source: {
      sources: EventImportSource[];
      sourceText: string;
    }) => void;
  },
): Promise<string> {
  try {
    const parsed = JSON.parse(call.argumentsJson || "{}") as Record<
      string,
      unknown
    >;
    if (call.execution.kind === "event-import") {
      if (!context)
        throw new Error(
          "The event import requires its original source context.",
        );
      let source = context;
      let existingEventId: string | undefined;
      if (typeof parsed.resumeEventId === "string") {
        const event = await convex.query(queryRefs.getEvent, {
          id: parsed.resumeEventId,
        });
        const saved = parseEventImportDraft(event?.importDraftJson);
        if (!saved)
          throw new Error(
            "The requested saved import is unavailable in this workspace. No new event was created.",
          );
        source = {
          ...context,
          sources: saved.sources,
          sourceText: saved.sourceText ?? "",
        };
        existingEventId = parsed.resumeEventId;
      } else if (parsed.resumePreviousImport === true) {
        if (!context.previousImport)
          throw new Error(
            "No previous import source is available in this conversation. Open the saved event and choose Retry matches, or reattach the original BEO.",
          );
        source = { ...context, ...context.previousImport };
      }
      context.rememberImport?.({
        sources: source.sources,
        sourceText: source.sourceText,
      });
      return serialize(
        await saveEventFromBeo(convex, parsed, { ...source, existingEventId }),
      );
    }
    if (call.execution.kind === "query") {
      const ref = queryRefs[call.execution.queryName];
      if (!ref) throw new Error(`Unknown query ${call.execution.queryName}.`);
      const isList = call.execution.queryName.startsWith("list");
      const queryArgs = { ...parsed };
      if (isList) {
        delete queryArgs.search;
        delete queryArgs.offset;
        delete queryArgs.limit;
      }
      const result = await convex.query(ref, queryArgs);
      if (isList) return listPage(result, parsed, call.execution.queryName);
      if (result == null) {
        return serialize({
          result: null,
          status: "unavailable",
          guidance:
            "The governed query returned no accessible record. It does not distinguish a missing/deleted record from denied access. Verify the exact _id from a current list result and the signed-in organization; do not invent a replacement ID or claim a specific cause.",
        });
      }
      return serialize(result);
    }
    const spec = call.execution;
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === "docId" || spec.paramNames.includes(key)) args[key] = value;
    }
    for (const name of spec.dateLikeParamNames) {
      if (name in args) args[name] = toEpochMs(args[name]);
    }
    const ref = mutationRefs[spec.mutationName];
    if (!ref) throw new Error(`Unknown mutation ${spec.mutationName}.`);
    const result = await convex.mutation(ref, args);
    return serialize(result ?? { ok: true });
  } catch (err) {
    return serialize({
      error: err instanceof Error ? err.message : String(err),
      rawError: err instanceof Error ? err.message : String(err),
      status: "execution_error",
      guidance:
        "Use the reported error to determine the cause. For invalid IDs, retrieve the exact _id from a current list result. For an explicit access denial, check the signed-in account and organization. For backend failures, report the failure without claiming the record is missing or guessing IDs. Do not retry a write whose outcome is uncertain without checking its result or using the same idempotency key.",
    });
  }
}
