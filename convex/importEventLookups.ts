// PL-SOURCE-DATASETS (AC-057): TPP's event list report prints each event's
// occasion, referral source ("Referred From") and sales person by name. The
// event import gives the event the company's occasion and referral source of
// that name, and adds one to the company's list when it has none yet (the old
// system's lists are the company's real lists). The sales person is the one
// active person with that exact name; a person is never made up, so with no
// single match the event keeps the printed name only.

import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { plainName } from "./importClientByName";

export type LookupRow = { id: string; keys: string[] };

export type EventLookups = {
  occasions: LookupRow[];
  referralSources: LookupRow[];
  people: LookupRow[];
};

/** "Corporate Event" -> "corporate_event": the code a new list row gets. */
export const lookupCode = (name: string) => plainName(name).replace(/ /g, "_");

/** The one row whose name (or code) is this printed name, if exactly one. */
export function findLookup(
  rows: readonly LookupRow[],
  name: string,
): string | null {
  const wanted = plainName(name);
  if (!wanted) return null;
  const hits = rows.filter((row) => row.keys.includes(wanted));
  return hits.length === 1 ? hits[0]!.id : null;
}

/** The company's active occasions, referral sources and people, by name. */
export const eventLookups = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }): Promise<EventLookups> => {
    const [occasions, referralSources, people] = await Promise.all([
      ctx.db
        .query("occasions")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("referralSources")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("people")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ]);
    const listRow = (row: {
      _id: string;
      name: string;
      code: string;
    }): LookupRow => ({
      id: row._id,
      keys: [plainName(row.name), plainName(row.code.replace(/_/g, " "))],
    });
    return {
      occasions: occasions
        .filter((o) => o.deletedAt == null && o.status === "active")
        .map(listRow),
      referralSources: referralSources
        .filter((r) => r.deletedAt == null && r.status === "active")
        .map(listRow),
      people: people
        .filter((p) => p.deletedAt == null && p.status === "active")
        .map((p) => ({
          id: p._id,
          keys: [plainName(`${p.givenName} ${p.familyName}`)],
        })),
    };
  },
});

export type EventLookupFields = {
  occasionId?: string;
  occasionName?: string;
  referralSourceId?: string;
  assignedToId?: string;
  ownerName?: string;
};

/** Lookups for one import batch; `refused` = names that could not be added. */
export type BatchLookups = EventLookups & { refused: Set<string> };

/**
 * The occasion, referral source and sales person an imported event gets.
 * A missing occasion or referral source is added to the company's list once
 * (later rows find it in `lookups`); when the importing person may not add
 * one, the event keeps the printed occasion name and no referral source.
 */
export async function eventLookupFields(
  ctx: ActionCtx,
  lookups: BatchLookups,
  printed: { occasion?: string; referralSource?: string; owner?: string },
): Promise<EventLookupFields> {
  const fields: EventLookupFields = {};
  if (printed.occasion) {
    fields.occasionName = printed.occasion;
    const id = await findOrAdd(lookups, "occasions", printed.occasion, (args) =>
      ctx.runMutation(api.mutations.Occasion_createViaRegister, args),
    );
    if (id) fields.occasionId = id;
  }
  if (printed.referralSource) {
    const id = await findOrAdd(
      lookups,
      "referralSources",
      printed.referralSource,
      (args) =>
        ctx.runMutation(api.mutations.ReferralSource_createViaRegister, args),
    );
    if (id) fields.referralSourceId = id;
  }
  if (printed.owner) {
    fields.ownerName = printed.owner;
    const id = findLookup(lookups.people, printed.owner);
    if (id) fields.assignedToId = id;
  }
  return fields;
}

async function findOrAdd(
  lookups: BatchLookups,
  list: "occasions" | "referralSources",
  name: string,
  register: (args: {
    name: string;
    code: string;
    sortOrder: number;
  }) => Promise<unknown>,
): Promise<string | null> {
  const rows = lookups[list];
  const found = findLookup(rows, name);
  if (found) return found;
  const key = plainName(name);
  // No name, two rows with this name (never guess), or not allowed to add.
  if (
    !key ||
    lookups.refused.has(`${list}:${key}`) ||
    rows.some((row) => row.keys.includes(key))
  )
    return null;
  try {
    const created = (await register({
      name,
      code: lookupCode(name),
      sortOrder: rows.length,
    })) as { docId: string };
    rows.push({ id: created.docId, keys: [key] });
    return created.docId;
  } catch {
    // Not allowed, or an inactive row holds the code: keep the name only.
    lookups.refused.add(`${list}:${key}`);
    return null;
  }
}
