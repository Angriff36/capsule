// PL-SOURCE-RESOLUTION (AC-059, AC-065, PR02-03, PR02-09): settle an import
// item on the match list, beside its old-system row and its Capsule record.
//
// A person can point the item at a record Capsule already has, or add a new
// record of the right kind from the old-system row (a person or a company
// client, a venue). The choice is saved on the item's link, which is keyed by
// the old-system identity, so a reload and every later import of the same row
// use it: the import finds the link and works on the chosen record instead of
// making another one. Skipping an item is also kept (lib/importResolution).
//
// Every write goes through the generated commands as the signed-in person, so
// the ordinary permissions apply; imported and native records are the same
// records afterwards.

import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { IMPORT_RECORD_HOMES } from "./lib/importRecordHomes";
import { recordLabel } from "./lib/importResolution";
import type { ParsedCapsuleContact, ParsedCapsuleVenue } from "./tppParser";

type RecordRow = Record<string, unknown> & {
  _id: string;
  tenantId?: string;
  deletedAt?: number | null;
  mergedIntoClientId?: string | null;
};

/** Search fields each record home can be found by. */
const SEARCH_FIELDS: Partial<Record<TableNames, string[]>> = {
  clients: ["companyName", "givenName", "familyName"],
  leads: ["companyName", "givenName", "familyName"],
  venues: ["name"],
  events: ["title"],
  dishes: ["name"],
  packLists: ["name"],
};

async function loadLink(
  ctx: Pick<QueryCtx, "db" | "auth">,
  linkId: Id<"externalRecordLinks">,
): Promise<{ link: Doc<"externalRecordLinks">; tenantId: string }> {
  const auth = await getAuthContext(ctx);
  const link = await ctx.db.get(linkId);
  if (
    !link ||
    !auth.tenantId ||
    link.tenantId !== auth.tenantId ||
    link.deletedAt != null
  ) {
    throw new ConvexError("This import item is gone. Reload the page.");
  }
  return { link, tenantId: auth.tenantId };
}

async function loadRecord(
  ctx: Pick<QueryCtx, "db">,
  table: TableNames,
  tenantId: string,
  id: string,
): Promise<RecordRow | null> {
  const normalized = ctx.db.normalizeId(table, id);
  if (!normalized) return null;
  const row = (await ctx.db.get(normalized)) as RecordRow | null;
  return row && row.tenantId === tenantId && row.deletedAt == null ? row : null;
}

/** Names of the Capsule records the given import items point at. */
export const itemRecordLabels = query({
  args: { linkIds: v.array(v.id("externalRecordLinks")) },
  handler: async (ctx, { linkIds }): Promise<Record<string, string>> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return {};
    const labels: Record<string, string> = {};
    for (const linkId of linkIds.slice(0, 200)) {
      const link = await ctx.db.get(linkId);
      if (!link || link.tenantId !== auth.tenantId || !link.capsuleId) continue;
      const home = IMPORT_RECORD_HOMES[link.recordType];
      if (!home) continue;
      const row = await loadRecord(
        ctx,
        home.table,
        auth.tenantId,
        link.capsuleId,
      );
      labels[linkId] = row ? recordLabel(row) : "Removed from Capsule";
    }
    return labels;
  },
});

/** Records of the item's kind whose name matches the typed text. */
export const findRecordsForItem = query({
  args: { linkId: v.id("externalRecordLinks"), text: v.string() },
  handler: async (
    ctx,
    { linkId, text },
  ): Promise<{ id: string; label: string }[]> => {
    const { link, tenantId } = await loadLink(ctx, linkId);
    const home = IMPORT_RECORD_HOMES[link.recordType];
    const fields = home ? SEARCH_FIELDS[home.table] : undefined;
    const typed = text.trim();
    if (!home || !fields || typed.length < 2) return [];
    const found = new Map<string, string>();
    for (const field of fields) {
      const rows = (await (
        ctx.db.query(home.table) as unknown as {
          withSearchIndex: (
            name: string,
            build: (q: {
              search: (
                f: string,
                t: string,
              ) => { eq: (f: string, v: string) => unknown };
            }) => unknown,
          ) => { take: (n: number) => Promise<RecordRow[]> };
        }
      )
        .withSearchIndex(`search_${field}`, (q) =>
          q.search(field, typed).eq("tenantId", tenantId),
        )
        .take(10)) as RecordRow[];
      for (const row of rows) {
        if (row.deletedAt != null || row.mergedIntoClientId) continue;
        found.set(String(row._id), recordLabel(row));
      }
    }
    return [...found].slice(0, 20).map(([id, label]) => ({ id, label }));
  },
});

/** Save the decision on the link: this record, decided by this person. */
async function settleOnRecord(
  ctx: MutationCtx,
  link: Doc<"externalRecordLinks">,
  recordId: string,
  note: string,
) {
  if (link.capsuleId !== recordId) {
    await ctx.runMutation(api.mutations.ExternalRecordLink_updateCapsuleId, {
      docId: link._id,
      capsuleId: recordId,
    });
  }
  // The record the import had made (if any) is no longer this row's record,
  // so the link drops its made snapshot: stopping the import never takes
  // back a record a person picked.
  await ctx.runMutation(api.mutations.ExternalRecordLink_verifyLink, {
    docId: link._id,
    verified: true,
    metadata: "{}",
  });
  await ctx.runMutation(api.mutations.ExternalRecordLink_decide, {
    docId: link._id,
    decision: "approved",
  });
  await ctx.runMutation(api.mutations.ExternalRecordLink_resolveConflict, {
    docId: link._id,
    conflictStatus: "resolved",
    resolutionNote: note,
  });
}

/** Point an import item at a record Capsule already has. */
export const chooseExistingRecord = mutation({
  args: { linkId: v.id("externalRecordLinks"), recordId: v.string() },
  handler: async (
    ctx,
    { linkId, recordId },
  ): Promise<{ label: string; leftBehind: string | null }> => {
    const { link, tenantId } = await loadLink(ctx, linkId);
    const home = IMPORT_RECORD_HOMES[link.recordType];
    if (!home) {
      throw new ConvexError(
        "This kind of item is matched with its own button.",
      );
    }
    const row = await loadRecord(ctx, home.table, tenantId, recordId);
    if (!row) throw new ConvexError("That record is not in Capsule any more.");
    if (row.mergedIntoClientId) {
      throw new ConvexError(
        "That client was merged into another one. Pick the client it was merged into.",
      );
    }
    const label = recordLabel(row);
    const before =
      link.capsuleId && link.capsuleId !== String(row._id)
        ? await loadRecord(ctx, home.table, tenantId, link.capsuleId)
        : null;
    await settleOnRecord(
      ctx,
      link,
      String(row._id),
      `Matched to ${label}, which Capsule already had.`,
    );
    return { label, leftBehind: before ? recordLabel(before) : null };
  },
});

function sourceRecord<T>(link: Doc<"externalRecordLinks">): T {
  try {
    return JSON.parse(link.rawSourceData ?? "{}") as T;
  } catch {
    return {} as T;
  }
}

/**
 * Add a new record of the right kind from the item's old-system row: a person
 * or a company client for a contact row, a venue for a venue row.
 */
export const addRecordForItem = mutation({
  args: {
    linkId: v.id("externalRecordLinks"),
    clientType: v.optional(v.union(v.literal("person"), v.literal("company"))),
  },
  handler: async (
    ctx,
    { linkId, clientType },
  ): Promise<{ id: string; label: string }> => {
    const { link } = await loadLink(ctx, linkId);
    if (link.capsuleId) {
      throw new ConvexError(
        "This item already has a Capsule record. Pick a different one instead.",
      );
    }
    const idempotencyKey = `tenant-shared/import-resolution:${link._id}`;
    let created: unknown;
    let label: string;
    if (link.recordType === "contact" || link.recordType === "company") {
      const row = sourceRecord<Partial<ParsedCapsuleContact>>(link);
      const type =
        clientType ?? (link.recordType === "company" ? "company" : "person");
      const personName = [row.givenName, row.familyName]
        .filter(Boolean)
        .join(" ");
      const companyName = row.company?.name || personName;
      if (type === "company" ? !companyName : !row.givenName) {
        throw new ConvexError(
          "The old-system row has no name. Pick an existing client instead.",
        );
      }
      created = await ctx.runMutation(api.mutations.Client_createViaRegister, {
        clientType: type,
        ...(type === "company"
          ? { companyName }
          : { givenName: row.givenName, familyName: row.familyName ?? "" }),
        email: row.email,
        phone: row.phone ?? row.mobile,
        addressLine1: row.addressLine1,
        city: row.city,
        region: row.region,
        postalCode: row.postalCode,
        notes: row.notes,
        idempotencyKey,
      });
      label = type === "company" ? companyName : personName;
    } else if (link.recordType === "venue") {
      const row = sourceRecord<Partial<ParsedCapsuleVenue>>(link);
      if (!row.name) {
        throw new ConvexError(
          "The old-system row has no venue name. Pick an existing venue instead.",
        );
      }
      created = await ctx.runMutation(api.mutations.Venue_createViaRegister, {
        name: row.name,
        venueType: (row.venueType ?? "other") as never,
        capacity: row.capacity ?? 0,
        addressLine1: row.addressLine1,
        city: row.city,
        region: row.region,
        postalCode: row.postalCode,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        accessNotes: row.accessNotes,
        cateringNotes: row.cateringNotes,
        loadInInstructions: row.loadInInstructions,
        logisticsNotes: row.logisticsNotes,
        idempotencyKey,
      });
      label = row.name;
    } else {
      throw new ConvexError(
        "Capsule can't add this kind of item from the old row. Pick an existing record instead.",
      );
    }
    const id = (created as { docId: string }).docId;
    await settleOnRecord(
      ctx,
      link,
      id,
      `Added as a new record (${label}) from the old-system row.`,
    );
    return { id, label };
  },
});
