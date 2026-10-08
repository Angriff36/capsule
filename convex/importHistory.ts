/**
 * AUTHOR SEAM — old-system contact history import (PL-SOURCE-HISTORY,
 * AC-062, AC-111).
 *
 * Each old call, email, meeting, note or task becomes one ClientCommunication
 * under its real client (found through the contacts/companies import, then
 * followed through any client merge) and, when the row names one, its event.
 * The original date, author, due date and done state are kept as they were.
 *
 * History only: `insertImportedHistory` writes the one row and emits no
 * Manifest event, so no reaction runs — an import sends no message, opens no
 * follow-up reminder, makes no lead and schedules nothing. An open old task
 * stays an open line in the history; it never becomes a reminder that can fall
 * overdue. (ClientCommunication has one create step, `record`, the
 * person-facing one; it stamps the signed-in person as author, so old history
 * written by other people cannot go through it.)
 *
 * A row whose client and event were not brought in yet waits on the match list
 * (pending link) and is picked up when the import runs again. A row an earlier
 * import already brought in is never written twice.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { loadClientNames, writeLink } from "./importCommit";
import { matchClientByName, type ClientName } from "./importClientByName";
import { COMPANY_RECORD_TYPE } from "./lib/importCompanies";
import { skippedByPerson } from "./lib/importResolution";
import { parseTppHistory, type ParsedHistoryRow } from "./lib/tppHistoryRows";

export const HISTORY_RECORD_TYPE = "history";

export type HistoryCommitCounts = {
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
  stoppedEarly: boolean;
};

type Link = Doc<"externalRecordLinks"> | null;

/**
 * Write one old-system history row and its import link in one transaction.
 * Internal: only the import commit (which has already checked the person may
 * import) calls it. The client and event must be this company's own records.
 */
export const insertAndLink = internalMutation({
  args: {
    history: v.object({
      tenantId: v.string(),
      actorId: v.string(),
      clientId: v.optional(v.string()),
      eventId: v.optional(v.string()),
      occurredAt: v.number(),
      medium: v.union(
        v.literal("call"),
        v.literal("email"),
        v.literal("meeting"),
        v.literal("note"),
        v.literal("task"),
      ),
      summary: v.string(),
      authorName: v.string(),
      importedFrom: v.string(),
      importRunId: v.id("importRuns"),
      dueAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      taskDone: v.optional(v.boolean()),
    }),
    link: v.object({
      sourceSystem: v.string(),
      recordType: v.string(),
      externalId: v.string(),
      capsuleEntity: v.string(),
      sourceImportRunId: v.id("importRuns"),
      rawSourceData: v.string(),
    }),
  },
  handler: async (ctx, { history: args, link }) => {
    const ownClient = args.clientId
      ? ctx.db.normalizeId("clients", args.clientId)
      : null;
    const ownEvent = args.eventId
      ? ctx.db.normalizeId("events", args.eventId)
      : null;
    const client = ownClient ? await ctx.db.get(ownClient) : null;
    const event = ownEvent ? await ctx.db.get(ownEvent) : null;
    if (args.clientId && client?.tenantId !== args.tenantId) {
      throw new ConvexError("The client for this history is not found.");
    }
    if (args.eventId && event?.tenantId !== args.tenantId) {
      throw new ConvexError("The event for this history is not found.");
    }
    if (!args.clientId && !args.eventId) {
      throw new ConvexError("Old history needs its client or event.");
    }
    if (!args.summary.trim()) {
      throw new ConvexError("Old history needs some words.");
    }
    const now = Date.now();
    const id = await ctx.db.insert("clientCommunications", {
      tenantId: args.tenantId,
      // A row placed by its event alone sits under that event's client too.
      clientId: ownClient ?? event?.clientId ?? undefined,
      eventId: ownEvent ?? undefined,
      occurredAt: args.occurredAt,
      medium: args.medium,
      summary: args.summary,
      authorId: args.actorId,
      authorName: args.authorName.trim() || "Old system",
      importedFrom: args.importedFrom,
      importRunId: args.importRunId,
      dueAt: args.dueAt,
      completedAt: args.completedAt,
      taskDone: args.taskDone,
      recordedAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await writeLink(ctx, {
      ...link,
      tenantId: args.tenantId,
      capsuleId: id,
      conflictStatus: "resolved",
    });
    return id;
  },
});

async function findLink(
  ctx: ActionCtx,
  args: {
    tenantId: string;
    sourceSystem: string;
    recordType: string;
    externalId: string;
  },
): Promise<Link> {
  return (await ctx.runQuery(internal.importCommit.findLink, args)) as Link;
}

/** The Capsule client and event an old history row belongs to. */
async function resolveHome(
  ctx: ActionCtx,
  args: {
    tenantId: string;
    sourceSystem: string;
    row: ParsedHistoryRow;
    /** The company's clients by name, read once per run when needed. */
    clientNames: () => Promise<ClientName[]>;
  },
): Promise<{ clientId?: string; eventId?: string }> {
  const { tenantId, sourceSystem, row } = args;
  const lookup = async (recordType: string, externalId?: string) => {
    if (!externalId) return undefined;
    const link = await findLink(ctx, {
      tenantId,
      sourceSystem,
      recordType,
      externalId,
    });
    return link?.capsuleId ? link.capsuleId : undefined;
  };
  const madeClient =
    (await lookup("contact", row.contactId)) ??
    (await lookup(COMPANY_RECORD_TYPE, row.companyId));
  const clientId = madeClient
    ? ((await ctx.runQuery(internal.importCommit.survivingClientId, {
        tenantId,
        clientId: madeClient,
      })) as string)
    : undefined;
  const eventId = await lookup("event", row.eventId);
  if (clientId || eventId || !row.contactName) return { clientId, eventId };
  // Named only: one exact match among the company's clients, never a guess
  // between two (the event import's rule, convex/importClientByName.ts).
  const [givenName, ...rest] = row.contactName.split(/\s+/);
  const match = matchClientByName(await args.clientNames(), {
    companyName: row.contactName,
    givenName,
    familyName: rest.join(" "),
  });
  return match.status === "found" ? { clientId: match.clientId } : {};
}

export async function commitHistoryRows(
  ctx: ActionCtx,
  args: {
    importRunId: Id<"importRuns">;
    tenantId: string;
    /** Who ran the import (kept on each row; the author is the old name). */
    actorId: string;
    sourceSystem: string;
    rawRows: unknown[];
    maxRecords?: number;
    /** Stops the run when a person stopped it (throws). */
    beforeEach: () => Promise<void>;
  },
): Promise<HistoryCommitCounts> {
  const parsed = parseTppHistory(args.rawRows);
  const parseErrors = parsed.errors.length;
  let committed = 0;
  let skipped = 0;
  let pending = 0;
  const { tenantId, sourceSystem } = args;
  let names: Promise<ClientName[]> | null = null;
  const clientNames = () => (names ??= loadClientNames(ctx, tenantId));

  for (const [index, row] of parsed.records.entries()) {
    const remaining = parsed.records.length - index;
    if (
      args.maxRecords !== undefined &&
      committed + skipped + pending >= args.maxRecords &&
      remaining > 0
    ) {
      return { committed, skipped, pending, parseErrors, stoppedEarly: true };
    }
    await args.beforeEach();
    const rawSourceData = JSON.stringify({
      ...row,
      sourceRow: args.rawRows[parsed.sourceIndexes[index]!] ?? null,
    });
    const linkFields = {
      sourceSystem,
      recordType: HISTORY_RECORD_TYPE,
      externalId: row.externalId,
      capsuleEntity: "client_communication",
      sourceImportRunId: args.importRunId,
      rawSourceData,
    };
    const linkBase = { tenantId, ...linkFields };

    const existing = await findLink(ctx, {
      tenantId,
      sourceSystem,
      recordType: HISTORY_RECORD_TYPE,
      externalId: row.externalId,
    });
    if (existing && skippedByPerson(existing)) {
      if (existing.sourceImportRunId !== args.importRunId) skipped += 1;
      continue;
    }
    if (existing?.capsuleId) {
      // History is a record of the past: brought in once, never rewritten.
      if (existing.sourceImportRunId !== args.importRunId) skipped += 1;
      continue;
    }

    const home = await resolveHome(ctx, {
      tenantId,
      sourceSystem,
      row,
      clientNames,
    });
    if (!home.clientId && !home.eventId) {
      await ctx.runMutation(internal.importCommit.upsertLink, {
        ...linkBase,
        capsuleId: "",
        conflictStatus: "pending_conflict",
        resolutionNote:
          "The contact, company or event for this history is not in Capsule yet. Bring it in, then run this import again.",
      });
      pending += 1;
      continue;
    }

    try {
      // Write and link in one step, so a worker that stops between rows never
      // leaves an unlinked row that a later run would write again.
      await ctx.runMutation(internal.importHistory.insertAndLink, {
        history: {
          tenantId,
          actorId: args.actorId,
          clientId: home.clientId,
          eventId: home.eventId,
          occurredAt: row.occurredAt,
          medium: row.medium,
          summary: row.summary,
          authorName: row.authorName ?? "Old system",
          importedFrom: sourceSystem,
          importRunId: args.importRunId,
          dueAt: row.dueAt,
          completedAt: row.completedAt,
          taskDone: row.medium === "task" ? row.taskDone : undefined,
        },
        link: linkFields,
      });
      committed += 1;
    } catch (cause) {
      await ctx.runMutation(internal.importCommit.upsertLink, {
        ...linkBase,
        capsuleId: "",
        conflictStatus: "pending_conflict",
        resolutionNote:
          cause instanceof Error ? cause.message : "History could not be saved",
      });
      pending += 1;
    }
  }
  return { committed, skipped, pending, parseErrors, stoppedEarly: false };
}
