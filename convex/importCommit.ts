/**
 * AUTHOR SEAM — real ImportRun commit/revert (spec §6.1 / §6.2 / §5.3).
 *
 * Why this exists: the generated `ImportRun_commit` / `ImportRun_revert` commands
 * (convex/mutations.ts, do-not-edit) only flip the run's status + emit an audit
 * event — they write ZERO business data. The orphaned `importCoordinator.ts`
 * `commitImport`/`revertImport` carry explicit TODOs. So an operator clicking
 * "Complete Commit" got a green "Completed" run with no records imported (silent
 * false-success), and §5.3's "imported TPP Event uses the same create-proposal
 * command" had no imported events to act on.
 *
 * This seam makes commit/revert REAL for the **venues**, **contacts**,
 * **events**, and **leads** datasets: caller-supplied TPP rows are parsed,
 * materialized into entities via the generated `Venue_createViaRegister`
 * (handles encryption + eventManageAccess guard), `Client_createViaRegister`
 * (person-type client account; salesAccess guard),
 * `Event_createViaPlanEngagement` (the create verb; eventManageAccess/
 * salesAccess guard), or `Lead_createViaCapture` (the create verb; salesAccess
 * guard), and linked idempotently through ExternalRecordLink. Re-run is safe
 * (per-record idempotencyKey + link dedup).
 * Revert supersedes the run's links (dataset-agnostic).
 *
 * Events resolve cross-dataset: a TPP Event's external `ClientID`/`VenueID` are
 * looked up against prior contacts/venues imports (recordType "contact"/"venue"
 * → Capsule id) before the Event is created; an event whose client was not
 * imported becomes a `pending_conflict` link (reconcile queue) rather than
 * fabricating a client. The TPP-mapped stage is NOT applied (the create command
 * hardcodes `stage: "planning"` and exposes no stage arg); the raw TPP
 * EventStatus is preserved on the link's rawSourceData for parallel-run
 * reconciliation (§6.1).
 *
 * Leads need NO cross-dataset resolution: a Lead is the PRE-client inquiry
 * (`clientId` is optional, set only on conversion), so a TPP opportunity/
 * pipeline row becomes a company-type Lead (`OpportunityName` → companyName)
 * without resolving its external `ClientID`. The TPP stage is NOT applied
 * (`capture` hardcodes stage "new"); the raw TPP ClientID + stage are preserved
 * on the link's rawSourceData for parallel-run reconciliation (§6.1).
 *
 * Payments materialize as reconciliation-reference LINKS, NOT Payment entities
 * (spec §6.4). `Payment.record` requires a Capsule invoice + client that NO
 * import produces (there is no invoice dataset), and §6.4 treats imported
 * payments as references matched (`Payment.markMatched`) against EXISTING
 * Capsule payments — "retain source, external transaction ID, amount, date,
 * type, event/client reference, and reconciliation state." So each TPP payment
 * becomes a `pending_conflict` ExternalRecordLink (recordType "payment",
 * capsuleEntity "payment", capsuleId "") awaiting a reconciliation match in the
 * queue; the external EventID is cross-resolved against the prior events import
 * for matching context. No Payment entity is created — by design (the spec's
 * reference model), not omission.
 *
 * Menus materialize as Dish entities, one per TPP dish-catalog row (the
 * work/dishes.csv export has no menu grouping, no external id, and EMPTY price
 * columns). Dish has no price field, so price_per_person / cost_per_person are
 * preserved on the link's rawSourceData (the §6.2 "prices" captured verbatim
 * from the source) rather than inventing a Menu+MenuDish pricing graph for
 * empty data. A future TPP export with real prices is the follow-up slice for a
 * queryable MenuDish.sellingPrice. `Dish_createViaIntroduce` is kitchenAccess-
 * guarded (not salesAccess), so a role with importAccess but not kitchenAccess
 * sees every dish land as pending_conflict; the dish name is slugified into the
 * link externalId (no id column in the feed).
 *
 * Pack lists materialize as Equipment PackList + PackListItem (spec §6.3). TPP
 * has no bulk export for per-event pack lists, so each caller-supplied row is
 * ONE event's browser-extracted pack list (source event id + page/version +
 * extraction time + nested items[text, qty, unit, group]). The source event is
 * cross-resolved against the prior events import (recordType "event") before
 * `PackList_createViaOpen` (logisticsAccess guard); each item becomes a
 * `PackListItem_createViaAddItem` (description-only when no Equipment/Dish
 * mapping — the §6.3 "unrecognized items may remain as imported free-text
 * lines" path). Idempotent per-event (externalId = sourceEventId); item-level
 * failures are recorded as extraction errors on the link without failing the
 * whole list.
 *
 * ponytail: ceiling — venues + contacts + events + leads + payments + menus +
 * pack lists ship here (all six §6.2 datasets + §6.3 pack lists). Revert
 * supersedes links but leaves imported
 * entities in place (an event may already reference one; deactivation is an
 * operator action) — documented honesty, not silent deletion. Source rows are
 * caller-supplied (TPP has no bulk export, spec §6.3), so this is the manual/
 * JSON-paste migration path.
 */
import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import {
  parseTppContacts,
  parseTppEvents,
  parseTppLeads,
  parseTppMenus,
  parseTppPackLists,
  parseTppPayments,
  parseTppVenues,
  type ParsedCapsuleEvent,
  type ParsedCapsuleLead,
  type ParsedCapsuleMenu,
  type ParsedCapsulePackList,
  type ParsedCapsulePayment,
  type TppContactRecord,
  type TppEventRecord,
  type TppLeadRecord,
  type TppMenuRecord,
  type TppPackListRecord,
  type TppPaymentRecord,
  type TppVenueRecord,
} from "./tppParser";
import type { Doc, Id } from "./_generated/dataModel";

/** Import access matches `importCoordinator.canImport` (managers + system). */
function canImport(role: string): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "owner" ||
    role === "system" ||
    role.endsWith("_manager")
  );
}

type CommitContext = {
  role: string;
  tenantId: string;
  actorId: string;
  importRun: Doc<"importRuns">;
};

/** Full-fidelity auth (query has ctx.db) + the run, in one read. */
export const loadCommitContext = internalQuery({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<CommitContext | null> => {
    const auth = await getAuthContext(ctx);
    const importRun = await ctx.db.get(args.importRunId);
    if (!importRun || importRun.deletedAt != null) return null;
    return {
      role: auth.role,
      tenantId: auth.tenantId,
      actorId: auth.id,
      importRun,
    };
  },
});

/**
 * Find an existing ACTIVE (non-superseded), non-deleted link for
 * (tenant, source, recordType, externalId). Excluding superseded matters: after
 * a revert, re-importing the same external venue must NOT be treated as an
 * idempotent skip (the old link is superseded, not active) — it should
 * re-materialize + reactivate.
 */
export const findLink = internalQuery({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    externalId: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"externalRecordLinks"> | null> => {
    return await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sourceSystem"), args.sourceSystem),
          q.eq(q.field("recordType"), args.recordType),
          q.eq(q.field("externalId"), args.externalId),
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .first();
  },
});

/**
 * Active (non-superseded), non-deleted links created by a given import run.
 * Bounded per page; `revertImportRun` pages until exhausted (superseding a
 * batch drops it from the next query), so a run with >500 links fully reverts.
 */
export const linksForRun = internalQuery({
  args: { sourceImportRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<Doc<"externalRecordLinks">[]> => {
    return await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_sourceImportRunId", (q) =>
        q.eq("sourceImportRunId", args.sourceImportRunId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), null),
          q.or(
            q.eq(q.field("conflictStatus"), "resolved"),
            q.eq(q.field("conflictStatus"), "pending_conflict"),
          ),
        ),
      )
      .take(500);
  },
});

/** Insert or update the link for a (tenant, source, recordType, externalId) key. */
export const upsertLink = internalMutation({
  args: {
    tenantId: v.string(),
    sourceSystem: v.string(),
    recordType: v.string(),
    externalId: v.string(),
    capsuleEntity: v.string(),
    capsuleId: v.string(),
    sourceImportRunId: v.id("importRuns"),
    rawSourceData: v.string(),
    conflictStatus: v.union(
      v.literal("resolved"),
      v.literal("pending_conflict"),
    ),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"externalRecordLinks">> => {
    const existing = await ctx.db
      .query("externalRecordLinks")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .filter((q) =>
        q.and(
          q.eq(q.field("sourceSystem"), args.sourceSystem),
          q.eq(q.field("recordType"), args.recordType),
          q.eq(q.field("externalId"), args.externalId),
          q.eq(q.field("deletedAt"), null),
        ),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        capsuleEntity:
          args.capsuleEntity as Doc<"externalRecordLinks">["capsuleEntity"],
        capsuleId: args.capsuleId,
        sourceImportRunId: args.sourceImportRunId,
        rawSourceData: args.rawSourceData,
        conflictStatus: args.conflictStatus,
        resolutionNote: args.resolutionNote ?? existing.resolutionNote,
        updatedAt: now,
        version: existing.version + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("externalRecordLinks", {
      tenantId: args.tenantId,
      sourceSystem:
        args.sourceSystem as Doc<"externalRecordLinks">["sourceSystem"],
      recordType: args.recordType,
      externalId: args.externalId,
      capsuleEntity:
        args.capsuleEntity as Doc<"externalRecordLinks">["capsuleEntity"],
      capsuleId: args.capsuleId,
      verified: false,
      sourceImportRunId: args.sourceImportRunId,
      rawSourceData: args.rawSourceData,
      conflictStatus: args.conflictStatus,
      resolutionNote: args.resolutionNote,
      createdAt: now,
      updatedAt: now,
      version: 0,
    });
  },
});

/** Mark a link superseded (revert). */
export const supersedeLink = internalMutation({
  args: { linkId: v.id("externalRecordLinks"), version: v.number() },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.linkId, {
      conflictStatus: "superseded",
      effectiveEndDate: now,
      verified: false,
      lastVerifiedAt: now,
      updatedAt: now,
      version: args.version + 1,
    });
  },
});

export type CommitResult = {
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
};

/**
 * Commit a venues ImportRun: parse caller-supplied TPP rows → materialize Venue
 * entities → idempotent ExternalRecordLinks → flip the run to completed via the
 * generated command. Per-record failures become pending_conflict links (visible
 * in the reconcile queue) rather than failing the whole run.
 */
export const commitImportRun = action({
  args: {
    importRunId: v.id("importRuns"),
    rawRows: v.array(v.any()),
  },
  handler: async (ctx, args): Promise<CommitResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can commit imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status !== "committing") {
      throw new ConvexError(
        `Import run must be in 'committing' status to commit, current: ${importRun.status}`,
      );
    }

    // ponytail: a TPP contact (a person we cater for) → a person-type Client
    // account. We deliberately do NOT create a ClientContact here: that entity
    // requires a parent clientId (the TPP CompanyID → Capsule Client resolution
    // the venue module header defers as cross-dataset). A person-Client is the
    // top-level home for an individual client and mirrors the venue path
    // exactly — generated `Client_createViaRegister` (salesAccess-guarded,
    // PII-encrypting, `idempotencyKey`-deduped, returns `{docId}`), then an
    // idempotent ExternalRecordLink (recordType "contact" → capsuleEntity
    // "client"). The company/title are folded into notes (the full raw row is
    // also preserved on the link), so nothing is lost.
    if (importRun.datasetType === "contacts") {
      if (args.rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppContacts(args.rawRows as TppContactRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid contact records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;
      for (const contact of parsed.records) {
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "contact",
          externalId: contact.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized in a prior run — idempotent skip.
          skipped += 1;
          continue;
        }

        const idempotencyKey = `import:${args.importRunId}:contact:${contact.externalId}`;
        const notes =
          [contact.title, contact.notes].filter(Boolean).join(" — ") ||
          undefined;
        try {
          const created = await ctx.runMutation(
            api.mutations.Client_createViaRegister,
            {
              clientType: "person",
              givenName: contact.givenName,
              familyName: contact.familyName,
              email: contact.email,
              phone: contact.phone ?? contact.mobile,
              notes,
              idempotencyKey,
            },
          );
          const clientId: string = (created as { docId: string }).docId;
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "contact",
            externalId: contact.externalId,
            capsuleEntity: "client",
            capsuleId: clientId,
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(contact),
            conflictStatus: "resolved",
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. salesAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Client materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "contact",
            externalId: contact.externalId,
            capsuleEntity: "client",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(contact),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: importRun.version,
      });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
      };
    }

    if (importRun.datasetType === "events") {
      if (args.rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppEvents(args.rawRows as TppEventRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid event records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const event of parsed.records as ParsedCapsuleEvent[]) {
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "event",
          externalId: event.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized in a prior run — idempotent skip.
          skipped += 1;
          continue;
        }

        // Cross-dataset resolution: a TPP Event's ClientID is an EXTERNAL id.
        // Resolve it to a Capsule client via the prior contacts import
        // (recordType "contact" → capsuleEntity "client"). The Event create
        // requires clientId, so an event whose client was not imported (e.g. a
        // TPP company id never imported as a contact) becomes a
        // pending_conflict link rather than fabricating a client — the
        // documented next slice (company→Client).
        const clientLink = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "contact",
          externalId: event.clientId,
        });
        if (!clientLink || !clientLink.capsuleId) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(event),
            conflictStatus: "pending_conflict",
            resolutionNote: `Client not imported (external ${event.clientId}); import contacts first.`,
          });
          pending += 1;
          continue;
        }
        const clientId: string = clientLink.capsuleId;

        // Venue is optional on Event; resolve if the TPP VenueID was imported.
        let venueId: string | undefined;
        if (event.venueId) {
          const venueLink = await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: "venue",
            externalId: event.venueId,
          });
          venueId = venueLink?.capsuleId || undefined;
        }

        // The create command (Event_createViaPlanEngagement) requires several
        // non-empty fields the TPP row does not carry directly. Synthesize the
        // spec-faithful minimum so complete TPP events import cleanly;
        // incomplete rows fall to pending_conflict via the catch below.
        // ponytail: eventType is required + non-empty; surface the TPP EventType
        // slug (parseTppEvent folds EventType into occasionId) as free text,
        // else an honest placeholder. primaryContactName derives from the
        // imported contact's name (stored on its link), else a placeholder.
        // Headcount is guarded >= 1; dates require endsAt > startsAt (default a
        // 1h window when EndTime is absent).
        const eventType = event.occasionId || "Imported Event";
        let primaryContactName = "Imported Contact";
        try {
          const contact = JSON.parse(clientLink.rawSourceData || "{}") as {
            givenName?: string;
            familyName?: string;
          };
          const name = [contact.givenName, contact.familyName]
            .filter(Boolean)
            .join(" ");
          if (name) primaryContactName = name;
        } catch {
          // keep placeholder
        }
        const expectedHeadcount = Math.max(1, event.expectedHeadcount ?? 1);
        if (!event.startsAt) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(event),
            conflictStatus: "pending_conflict",
            resolutionNote: "Event is missing a start date (EventDate).",
          });
          pending += 1;
          continue;
        }
        const startsAt = event.startsAt;
        const endsAt =
          !event.endsAt || event.endsAt <= startsAt
            ? startsAt + 3_600_000
            : event.endsAt;
        const budgetAmount = Math.max(0, event.budgetAmount ?? 0);
        const quotedPrice = Math.max(0, event.quotedRevenue ?? 0);

        const idempotencyKey = `import:${args.importRunId}:event:${event.externalId}`;
        try {
          const created = await ctx.runMutation(
            api.mutations.Event_createViaPlanEngagement,
            {
              clientId,
              title: event.title,
              eventType,
              startsAt,
              endsAt,
              expectedHeadcount,
              primaryContactName,
              budgetAmount,
              quotedPrice,
              venueId,
              venueName: event.venueName,
              venueAddress: event.venueAddress,
              accessibilityNeeds: event.accessibilityNeeds,
              operationalRequirements:
                event.operationalRequirements ?? event.notes,
              idempotencyKey,
            },
          );
          const eventId: string = (created as { docId: string }).docId;
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: eventId,
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(event),
            conflictStatus: "resolved",
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. missing required field, salesAccess
          // denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Event materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: event.externalId,
            capsuleEntity: "event_record",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(event),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: importRun.version,
      });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
      };
    }

    if (importRun.datasetType === "leads") {
      if (args.rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppLeads(args.rawRows as TppLeadRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid lead records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const lead of parsed.records as ParsedCapsuleLead[]) {
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "lead",
          externalId: lead.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized in a prior run — idempotent skip.
          skipped += 1;
          continue;
        }

        // ponytail: a TPP opportunity/pipeline row → a company-type Lead. The
        // Lead is the PRE-client inquiry (clientId is optional, set only on
        // conversion), so — unlike events — NO cross-dataset client resolution
        // is needed. The external TPP ClientID + the mapped stage are preserved
        // on the link's rawSourceData (the stage is NOT applied: `capture`
        // hardcodes stage "new" with no stage arg). Linking the lead to a
        // Capsule Client is the conversion workflow (stageConversion →
        // confirmConversion), a separate operator action.
        const idempotencyKey = `import:${args.importRunId}:lead:${lead.externalId}`;
        const notes =
          [
            lead.stage !== "new" ? `TPP stage: ${lead.stage}` : null,
            lead.clientId ? `TPP client ${lead.clientId}` : null,
          ]
            .filter(Boolean)
            .join(" — ") || undefined;
        try {
          const created = await ctx.runMutation(
            api.mutations.Lead_createViaCapture,
            {
              leadType: "company",
              source: lead.source,
              estimatedValue: lead.estimatedValue,
              companyName: lead.opportunityName,
              probability: lead.probability,
              notes,
              idempotencyKey,
            },
          );
          const leadId: string = (created as { docId: string }).docId;
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "lead",
            externalId: lead.externalId,
            capsuleEntity: "lead",
            capsuleId: leadId,
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(lead),
            conflictStatus: "resolved",
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. salesAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Lead materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "lead",
            externalId: lead.externalId,
            capsuleEntity: "lead",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(lead),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: importRun.version,
      });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
      };
    }

    if (importRun.datasetType === "payments") {
      // ponytail: payments materialize as reconciliation-reference LINKS, NOT
      // Payment entities (spec §6.4). Payment.record requires a Capsule invoice
      // + client that NO import produces (there is no invoice dataset), and §6.4
      // treats imported payments as references matched (Payment.markMatched)
      // against EXISTING Capsule payments. So each TPP payment becomes a
      // pending_conflict ExternalRecordLink (recordType "payment",
      // capsuleEntity "payment", capsuleId "") awaiting a reconciliation match
      // in the queue. conflictStatus "pending_conflict" is the CORRECT
      // "awaiting match" state here — not a creation failure — so a staged link
      // counts as `committed` (the link IS the artifact this dataset produces).
      if (args.rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppPayments(args.rawRows as TppPaymentRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid payment records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const payment of parsed.records as ParsedCapsulePayment[]) {
        // Idempotent skip: an existing ACTIVE link means this payment reference
        // is already staged (or already matched). The link IS the artifact, so
        // ANY active link — matched or not — is a no-op skip (re-runs don't
        // re-stage). findLink excludes superseded links, so a reverted run
        // re-stages cleanly.
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "payment",
          externalId: payment.externalId,
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        // Cross-dataset context (optional, aids later matching): resolve the
        // TPP EventID → Capsule event from the prior events import. The natural
        // Capsule match target is an invoice/payment, which is why §6.4 keys
        // these records on event/client reference + reconciliation state. The
        // external InvoiceID is preserved raw (no invoice import → not
        // resolvable to a Capsule invoice).
        let resolvedEventNote: string | null = null;
        if (payment.eventId) {
          const eventLink = await ctx.runQuery(internal.importCommit.findLink, {
            tenantId,
            sourceSystem,
            recordType: "event",
            externalId: payment.eventId,
          });
          if (eventLink?.capsuleId) {
            resolvedEventNote = `Capsule event ${eventLink.capsuleId}`;
          } else if (eventLink) {
            resolvedEventNote = `external event ${payment.eventId} (imported but unresolved)`;
          }
        }
        const note = [
          "Imported TPP payment — reconciliation reference (match via markMatched on a Capsule payment)",
          payment.invoiceId
            ? `external invoice ${payment.invoiceId} (no invoice import)`
            : null,
          resolvedEventNote ??
            (payment.eventId ? `external event ${payment.eventId}` : null),
          payment.recordedAt
            ? `recorded ${new Date(payment.recordedAt).toISOString()}`
            : null,
        ]
          .filter(Boolean)
          .join(" — ");

        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "payment",
          externalId: payment.externalId,
          capsuleEntity: "payment",
          capsuleId: "",
          sourceImportRunId: args.importRunId,
          rawSourceData: JSON.stringify(payment),
          conflictStatus: "pending_conflict",
          resolutionNote: note,
        });
        committed += 1;
      }

      if (committed === 0 && skipped === 0) {
        // parsed.records.length > 0 is enforced above, so this is defensive.
        throw new ConvexError("No payment references staged.");
      }

      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: importRun.version,
      });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
      };
    }

    if (importRun.datasetType === "menus") {
      // ponytail: each TPP dish-catalog row → a Dish entity (the menu catalog
      // item). The TPP dishes export (work/dishes.csv) has no menu grouping, no
      // external id, and EMPTY price columns, so a Dish per row is the faithful
      // one-entity mapping (mirrors venues/contacts/events/leads). Dish has no
      // price field, so price_per_person / cost_per_person are preserved on the
      // link's rawSourceData (captured verbatim from the source — they are empty
      // in the real feed) rather than inventing a Menu+MenuDish pricing graph.
      // Menu/MenuDish assembly (to make prices queryable) is a documented
      // follow-up if a TPP export with real prices arrives. The dish name is
      // slugified into the link externalId (no id column in the feed).
      // Dish_createViaIntroduce is kitchenAccess-guarded (NOT salesAccess like
      // the other branches), so a role with importAccess but not kitchenAccess
      // sees every dish land as pending_conflict (managers/admins/owners hold
      // both); portionSize is parsed from free text and defaults to 1.
      if (args.rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppMenus(args.rawRows as TppMenuRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid menu records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const menu of parsed.records as ParsedCapsuleMenu[]) {
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "menu",
          externalId: menu.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized in a prior run — idempotent skip.
          skipped += 1;
          continue;
        }

        const idempotencyKey = `import:${args.importRunId}:menu:${menu.externalId}`;
        try {
          const created = await ctx.runMutation(
            api.mutations.Dish_createViaIntroduce,
            {
              name: menu.name,
              portionSize: menu.portionSize,
              portionUnit: menu.portionUnit,
              description: menu.description,
              category: menu.category,
              serviceStyle: menu.serviceStyle,
              dietaryTags: menu.dietaryTags,
              allergenSummary: menu.allergenSummary,
              idempotencyKey,
            },
          );
          const dishId: string = (created as { docId: string }).docId;
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "menu",
            externalId: menu.externalId,
            capsuleEntity: "menu",
            capsuleId: dishId,
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(menu),
            conflictStatus: "resolved",
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. kitchenAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Dish materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "menu",
            externalId: menu.externalId,
            capsuleEntity: "menu",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(menu),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: importRun.version,
      });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
      };
    }

    if (importRun.datasetType === "pack_list") {
      // ponytail: §6.3 browser-extracted Pack Lists. TPP has no bulk export for
      // per-event equipment pack lists, so each source row is one event's
      // browser-extracted pack list (source event id + page/version + extraction
      // time + nested items[text, qty, unit, group]). The source event is
      // resolved to a Capsule Event via the prior events import (recordType
      // "event"); one PackList is opened for it and each item is added as a
      // PackListItem. Items with no Equipment/Dish mapping land as
      // description-only free-text lines (dishId null) per §6.3. Unmapped unit
      // text defaults to "each" (raw unit preserved on the link). Idempotent
      // per-event (externalId = sourceEventId): a re-run skips an already-linked
      // event. PackList_createViaOpen is logisticsAccess-guarded, so a role with
      // importAccess but not logisticsAccess sees the row land as pending_conflict.
      if (args.rawRows.length === 0) {
        throw new ConvexError("No source rows provided — nothing to commit.");
      }
      const parsed = parseTppPackLists(args.rawRows as TppPackListRecord[]);
      if (parsed.records.length === 0) {
        throw new ConvexError(
          `No valid pack-list records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
        );
      }
      const sourceSystem = importRun.sourceSystem;
      let committed = 0;
      let skipped = 0;
      let pending = 0;

      for (const packList of parsed.records as ParsedCapsulePackList[]) {
        const existing = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "pack_list",
          externalId: packList.externalId,
        });
        if (existing && existing.capsuleId) {
          // Already materialized in a prior run — idempotent skip.
          skipped += 1;
          continue;
        }

        // Cross-dataset resolution: the source event id is EXTERNAL — resolve it
        // to a Capsule Event via the prior events import (recordType "event").
        // PackList belongsTo Event, so an event that was not imported has no
        // target; stage as pending_conflict rather than fabricating an event —
        // mirrors how events resolve their external client/venue.
        const eventLink = await ctx.runQuery(internal.importCommit.findLink, {
          tenantId,
          sourceSystem,
          recordType: "event",
          externalId: packList.sourceEventId,
        });
        if (!eventLink || !eventLink.capsuleId) {
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "pack_list",
            externalId: packList.externalId,
            capsuleEntity: "pack_list",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(packList),
            conflictStatus: "pending_conflict",
            resolutionNote: `Source event not imported (external ${packList.sourceEventId}); import events first.`,
          });
          pending += 1;
          continue;
        }
        const eventId: string = eventLink.capsuleId;

        const idempotencyKey = `import:${args.importRunId}:pack_list:${packList.externalId}`;
        try {
          const created = await ctx.runMutation(
            api.mutations.PackList_createViaOpen,
            {
              eventId,
              name: packList.name,
              idempotencyKey,
            },
          );
          const packListId: string = (created as { docId: string }).docId;

          // Add each item. Per-item failures (e.g. a bad unit slipping through)
          // are recorded as extraction errors but do NOT fail the whole pack
          // list — partial import is faithful to §6.3 ("records … extraction
          // errors") and the PackList already exists.
          const itemImportErrors: string[] = [];
          let itemsAdded = 0;
          for (const [itemIndex, item] of packList.items.entries()) {
            try {
              await ctx.runMutation(
                api.mutations.PackListItem_createViaAddItem,
                {
                  packListId,
                  description: item.description,
                  requiredQuantity: item.requiredQuantity,
                  unit: item.unit,
                  // Deterministic per-item key: a retried/overlapping commit
                  // re-opens the SAME PackList (idempotencyKey above) — without
                  // a per-item key it would append duplicate items, breaking the
                  // §6.3 idempotent-import requirement. Run-scoped to match the
                  // PackList/Dish create-key convention; cross-run dedup is the
                  // pack-list link check's job (findLink above).
                  idempotencyKey: `import:${args.importRunId}:pack_list:${packList.externalId}:item:${itemIndex}`,
                },
              );
              itemsAdded += 1;
            } catch (itemCause) {
              itemImportErrors.push(
                `${item.description}: ${itemCause instanceof Error ? itemCause.message : "add item failed"}`,
              );
            }
          }

          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "pack_list",
            externalId: packList.externalId,
            capsuleEntity: "pack_list",
            capsuleId: packListId,
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify({
              ...packList,
              itemsAdded,
              itemImportErrors,
            }),
            conflictStatus: "resolved",
          });
          committed += 1;
        } catch (cause) {
          // Per-record failure (e.g. logisticsAccess denied) → review queue.
          const note =
            cause instanceof Error
              ? cause.message
              : "Pack list materialization failed";
          await ctx.runMutation(internal.importCommit.upsertLink, {
            tenantId,
            sourceSystem,
            recordType: "pack_list",
            externalId: packList.externalId,
            capsuleEntity: "pack_list",
            capsuleId: "",
            sourceImportRunId: args.importRunId,
            rawSourceData: JSON.stringify(packList),
            conflictStatus: "pending_conflict",
            resolutionNote: note,
          });
          pending += 1;
        }
      }

      if (committed === 0 && pending > 0) {
        throw new ConvexError(
          `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
        );
      }

      await ctx.runMutation(api.mutations.ImportRun_commit, {
        docId: args.importRunId,
        version: importRun.version,
      });

      return {
        committed,
        skipped,
        pending,
        parseErrors: parsed.errors.length,
      };
    }

    // ImportDatasetType is a closed union (contacts/events/leads/payments/menus/
    // pack_list/venues); the six branches above each return, so TS narrows
    // importRun.datasetType to "venues" here — this fall-through is exhaustive.
    // A future member added without a branch would fall through to venue parsing
    // and fail loudly ("No valid venue records parsed") rather than misroute.
    if (args.rawRows.length === 0) {
      throw new ConvexError("No source rows provided — nothing to commit.");
    }

    const parsed = parseTppVenues(args.rawRows as TppVenueRecord[]);
    if (parsed.records.length === 0) {
      // Non-empty input that yields zero valid records (all rows failed to
      // parse) must NOT silently flip the run to completed.
      throw new ConvexError(
        `No valid venue records parsed (${parsed.errors.length} parse error(s)). Nothing to commit.`,
      );
    }
    const sourceSystem = importRun.sourceSystem;
    let committed = 0;
    let skipped = 0;
    let pending = 0;

    for (const venue of parsed.records) {
      const existing = await ctx.runQuery(internal.importCommit.findLink, {
        tenantId,
        sourceSystem,
        recordType: "venue",
        externalId: venue.externalId,
      });
      if (existing && existing.capsuleId) {
        // Already materialized in a prior run — idempotent skip.
        skipped += 1;
        continue;
      }

      const idempotencyKey = `import:${args.importRunId}:venue:${venue.externalId}`;
      try {
        const created = await ctx.runMutation(
          api.mutations.Venue_createViaRegister,
          {
            name: venue.name,
            venueType: venue.venueType ?? "other",
            capacity: venue.capacity ?? 0,
            addressLine1: venue.addressLine1,
            city: venue.city,
            region: venue.region,
            postalCode: venue.postalCode,
            contactName: venue.contactName,
            contactEmail: venue.contactEmail,
            contactPhone: venue.contactPhone,
            accessNotes: venue.accessNotes,
            cateringNotes: venue.cateringNotes,
            idempotencyKey,
          },
        );
        const venueId: string = (created as { docId: string }).docId;
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "venue",
          externalId: venue.externalId,
          capsuleEntity: "venue",
          capsuleId: venueId,
          sourceImportRunId: args.importRunId,
          rawSourceData: JSON.stringify(venue),
          conflictStatus: "resolved",
        });
        committed += 1;
      } catch (cause) {
        // Per-record failure (e.g. eventManageAccess denied) → review queue.
        const note =
          cause instanceof Error
            ? cause.message
            : "Venue materialization failed";
        await ctx.runMutation(internal.importCommit.upsertLink, {
          tenantId,
          sourceSystem,
          recordType: "venue",
          externalId: venue.externalId,
          capsuleEntity: "venue",
          capsuleId: "",
          sourceImportRunId: args.importRunId,
          rawSourceData: JSON.stringify(venue),
          conflictStatus: "pending_conflict",
          resolutionNote: note,
        });
        pending += 1;
      }
    }

    if (committed === 0 && pending > 0) {
      throw new ConvexError(
        `No records materialized (${pending} pending conflict). Resolve in the reconcile queue before re-committing.`,
      );
    }

    // Flip the run to completed via the generated command (transition guard +
    // ImportRunCommitted event + OCC). Version is unchanged since the run was
    // last read (venue/link writes do not touch importRuns).
    await ctx.runMutation(api.mutations.ImportRun_commit, {
      docId: args.importRunId,
      version: importRun.version,
    });

    return {
      committed,
      skipped,
      pending,
      parseErrors: parsed.errors.length,
    };
  },
});

export type RevertResult = { rolledBack: number };

/**
 * Revert a completed ImportRun: supersede every link it created. Imported Venue
 * entities are left in place (an event may already reference one); superseding
 * the link removes the active mapping and surfaces the records for operator
 * deactivation. Then flip the run to reverted via the generated command.
 */
export const revertImportRun = action({
  args: { importRunId: v.id("importRuns") },
  handler: async (ctx, args): Promise<RevertResult> => {
    const runCtx = await ctx.runQuery(internal.importCommit.loadCommitContext, {
      importRunId: args.importRunId,
    });
    if (!runCtx || !runCtx.tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (!canImport(runCtx.role)) {
      throw new ConvexError("Only organization managers can revert imports.");
    }
    const { importRun, tenantId } = runCtx;
    if (importRun.tenantId !== tenantId) {
      throw new ConvexError("Import run not found");
    }
    if (importRun.status !== "completed") {
      throw new ConvexError(
        `Only completed imports can be reverted, current: ${importRun.status}`,
      );
    }

    // Page through ALL active links the run created. linksForRun returns only
    // non-superseded links; superseding a batch drops those rows from the next
    // query, so this terminates and fully reverts even a >500-link run.
    let rolledBack = 0;
    for (;;) {
      const batch = await ctx.runQuery(internal.importCommit.linksForRun, {
        sourceImportRunId: args.importRunId,
      });
      if (batch.length === 0) break;
      for (const link of batch) {
        await ctx.runMutation(internal.importCommit.supersedeLink, {
          linkId: link._id,
          version: link.version,
        });
        rolledBack += 1;
      }
      if (batch.length < 500) break; // last partial page
    }

    await ctx.runMutation(api.mutations.ImportRun_revert, {
      docId: args.importRunId,
      version: importRun.version,
    });

    return { rolledBack };
  },
});
