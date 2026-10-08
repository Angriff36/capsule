// PL-PUBLIC-MENU (AC-064, PR02-08): service styles on imported events.
//
// The event import (importCommit.commitImportRun) matches each event's old
// service style to this company's service-style list. A style the list does
// not know never blocks the event: the event imports without a style and
// the old style waits on the import matching screen as one "service_style"
// item, traceable to the events that named it. Matching it to a Capsule
// style later applies that style to those imported events that still have
// none — events that already have a style are left alone — and later
// imports with the same old style use the match at once.

import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

export const SERVICE_STYLE_RECORD_TYPE = "service_style";

/** Old-system style text as the import stores it: lowercase, "_" for spaces. */
export const styleCode = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, "_");

async function findMatch(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
  sourceSystem: string,
  code: string,
): Promise<Doc<"serviceStyles"> | null> {
  const styles = (
    await ctx.db
      .query("serviceStyles")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect()
  ).filter((s) => s.deletedAt == null && s.status === "active");
  const direct = styles.find(
    (s) => styleCode(s.code) === code || styleCode(s.name) === code,
  );
  if (direct) return direct;
  // An earlier match someone made on the import matching screen.
  const matched = (
    await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", tenantId).eq("recordType", SERVICE_STYLE_RECORD_TYPE),
      )
      .collect()
  ).find(
    (link) =>
      link.deletedAt == null &&
      link.sourceSystem === sourceSystem &&
      link.externalId === code &&
      link.conflictStatus === "resolved" &&
      link.capsuleId,
  );
  return matched
    ? (styles.find((s) => s._id === matched.capsuleId) ?? null)
    : null;
}

/** The Capsule service style an imported style code means, if known. */
export const matchServiceStyle = internalQuery({
  args: { tenantId: v.string(), sourceSystem: v.string(), code: v.string() },
  handler: async (
    ctx,
    { tenantId, sourceSystem, code },
  ): Promise<{ _id: Id<"serviceStyles">; name: string } | null> => {
    const style = await findMatch(ctx, tenantId, sourceSystem, code);
    return style ? { _id: style._id, name: style.name } : null;
  },
});

/**
 * Match an old service style (a "service_style" import item) to a Capsule
 * style, and give that style to the imported events that named it and still
 * have none. Runs as the signed-in person: each event change goes through
 * Event.changeServiceStyle and its own permission check.
 */
const EVENT_LINKS_PER_CALL = 300;

export const resolveImportedServiceStyle = mutation({
  // The imported events are worked one page per call: `cursor` and
  // `appliedBefore` come from the last call's answer, until it returns no
  // cursor. Only then is the import item marked matched. Reading every
  // imported event at once went past the per-call read limit.
  args: {
    linkId: v.id("externalRecordLinks"),
    serviceStyleId: v.id("serviceStyles"),
    cursor: v.optional(v.string()),
    appliedBefore: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { linkId, serviceStyleId, cursor, appliedBefore },
  ): Promise<{ applied: number; cursor?: string }> => {
    const auth = await getAuthContext(ctx);
    const link = await ctx.db.get(linkId);
    if (
      !link ||
      !auth.tenantId ||
      link.tenantId !== auth.tenantId ||
      link.deletedAt != null ||
      link.recordType !== SERVICE_STYLE_RECORD_TYPE
    ) {
      throw new Error("Import item not found");
    }
    const style = await ctx.db.get(serviceStyleId);
    if (
      !style ||
      style.tenantId !== auth.tenantId ||
      style.deletedAt != null ||
      style.status !== "active"
    ) {
      throw new Error("Pick one of your active service styles.");
    }

    let applied = appliedBefore ?? 0;
    const page = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId_and_recordType", (q) =>
        q.eq("tenantId", auth.tenantId).eq("recordType", "event"),
      )
      .paginate({ numItems: EVENT_LINKS_PER_CALL, cursor: cursor ?? null });
    const eventLinks = page.page.filter(
      (row) =>
        row.deletedAt == null &&
        row.sourceSystem === link.sourceSystem &&
        row.capsuleId,
    );
    for (const row of eventLinks) {
      let code: unknown;
      try {
        code = (
          JSON.parse(row.rawSourceData ?? "{}") as { serviceStyleId?: unknown }
        ).serviceStyleId;
      } catch {
        continue;
      }
      if (code !== link.externalId) continue;
      const event = await ctx.db.get(row.capsuleId as Id<"events">);
      if (
        !event ||
        event.tenantId !== auth.tenantId ||
        event.deletedAt != null ||
        event.serviceStyleId != null
      ) {
        continue;
      }
      await ctx.runMutation(api.mutations.Event_changeServiceStyle, {
        docId: event._id,
        serviceStyleId,
        serviceStyleName: style.name,
      });
      applied += 1;
    }
    if (!page.isDone) return { applied, cursor: page.continueCursor };

    await ctx.runMutation(api.mutations.ExternalRecordLink_updateCapsuleId, {
      docId: linkId,
      capsuleId: serviceStyleId,
    });
    await ctx.runMutation(api.mutations.ExternalRecordLink_resolveConflict, {
      docId: linkId,
      conflictStatus: "resolved",
      resolutionNote: `Matched to service style ${style.name}; ${applied} imported event(s) updated.`,
    });
    return { applied };
  },
});
