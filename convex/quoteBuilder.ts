import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Public status payload for getQuoteSubmissionStatus — derived from the Doc so
// field types stay in sync with the schema (single source of truth).
type QuoteSubmissionStatusResult = {
  id: Doc<"quoteSubmissions">["_id"];
  status: Doc<"quoteSubmissions">["status"];
  submittedAt: Doc<"quoteSubmissions">["submittedAt"];
  completedAt: Doc<"quoteSubmissions">["completedAt"];
  clientId: Doc<"quoteSubmissions">["clientId"];
  leadId: Doc<"quoteSubmissions">["leadId"];
  eventId: Doc<"quoteSubmissions">["eventId"];
  proposalId: Doc<"quoteSubmissions">["proposalId"];
  errorMessage: Doc<"quoteSubmissions">["errorMessage"];
};

/**
 * Generates a stable deduplication key from email + event date + tenantId.
 * This ensures submit-once behavior even if the user submits multiple times.
 */
function generateDedupKey(
  email: string,
  eventDate: number,
  tenantId: string,
): string {
  // Full normalized tuple as the key (no hashing): exact-match dedup with no
  // collision risk, so two distinct requests never share a key.
  return `quote|${email.toLowerCase().trim()}|${eventDate}|${tenantId}`;
}

// eventDate/eventEndTime arrive as epoch-ms (converted in the browser so the
// visitor's timezone defines the calendar day, not the UTC server runtime).
// Reject NaN/Infinity AND finite-but-out-of-range epochs (e.g. 1e308): those
// make new Date(ms) invalid and would crash formatDate in the review queue.
// The "not in the past" UX rule is enforced client-side (visitor TZ); the
// server only guards against unparseable timestamps.
function isValidTimestamp(ms: number): boolean {
  return Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime());
}

// Bounded field lengths for the public form. The /quote action is anonymous and
// reachable by anyone, so cap payload size to prevent trivial storage/CPU abuse
// (a true per-caller rate limit needs a counter table and is a documented
// follow-up). Trim+cap is the proportionate guard for a catering lead form.
const MAX_SHORT = 200;
const MAX_LONG = 4000;
function bounded(value: string | undefined, max = MAX_SHORT): string {
  return (value ?? "").trim().slice(0, max);
}

/**
 * Public-ingress seam.
 *
 * The public /quote form runs ANONYMOUSLY (it lives outside AuthGate), so the
 * submitQuote action cannot use the auth-gated generated creates: a mutation
 * called from an action inherits the caller's (empty) auth context, and the
 * generated `QuoteSubmission_create` enforces the `salesAccess` write policy on
 * every command — so it throws for an anonymous caller before insert.
 *
 * This internal mutation runs with SYSTEM privileges (no auth context), so it
 * can read the active organization directly, dedupe, and insert the
 * QuoteSubmission capture record with an explicit tenantId. It is reachable
 * ONLY from submitQuote (internal mutations are never exposed to clients),
 * which has already validated the input — so this seam is not an open write
 * surface.
 *
 * Downstream sales records (Lead/Event/Proposal) are intentionally NOT created
 * here: they are auth-gated for good reason. An authenticated operator converts
 * a captured submission via `processQuoteSubmission`, which creates them with
 * the operator's own sales/admin auth.
 */
export const ingressQuoteSubmission = internalMutation({
  args: {
    clientName: v.string(),
    email: v.string(),
    phone: v.string(),
    eventDate: v.number(),
    eventEndTime: v.number(),
    guestCount: v.number(),
    serviceStyleId: v.optional(v.id("serviceStyles")),
    occasionId: v.optional(v.id("occasions")),
    serviceStyleText: v.string(),
    occasionText: v.string(),
    venueName: v.string(),
    venueAddress: v.string(),
    menuPreferences: v.string(),
    dietaryRestrictions: v.string(),
    notes: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    submissionId: Id<"quoteSubmissions">;
    isDuplicate: boolean;
    status: Doc<"quoteSubmissions">["status"];
  }> => {
    // Resolve the public tenant: the active organization this deployment serves.
    // Single-org deployment today; a multi-tenant host would resolve from
    // subdomain/route instead.
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!org) {
      throw new ConvexError(
        "Unable to process quote. Please contact us directly.",
      );
    }
    const tenantId = org.tenantId;

    // Per-tenant rate cap on the anonymous public write. Dedup only blocks
    // exact (email+date) repeats, so a caller varying those fields could flood
    // the review queue and inflate cost; cap submissions per tenant per hour
    // (table-less: a bounded take over the tenant index). A true per-caller
    // (per-IP) limit needs a counter table and remains a follow-up.
    const HOUR_MS = 60 * 60 * 1000;
    const MAX_PER_HOUR = 30;
    const recent = await ctx.db
      .query("quoteSubmissions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) => q.gte(q.field("submittedAt"), Date.now() - HOUR_MS))
      .take(MAX_PER_HOUR + 1);
    if (recent.length >= MAX_PER_HOUR) {
      throw new ConvexError(
        "We've received a lot of quote requests recently. Please try again shortly.",
      );
    }

    const email = args.email.trim().toLowerCase();
    const clientName = args.clientName.trim();
    const dedupKey = generateDedupKey(email, args.eventDate, tenantId);

    // Validate optional catalog selections belong to this tenant and are active,
    // so a direct API caller can't store cross-tenant/inactive ids that would
    // later be copied into the converted Event.
    if (args.serviceStyleId) {
      const ss = await ctx.db.get(args.serviceStyleId);
      if (!ss || ss.tenantId !== tenantId || ss.status !== "active") {
        throw new ConvexError("Invalid service style selection");
      }
    }
    if (args.occasionId) {
      const oc = await ctx.db.get(args.occasionId);
      if (!oc || oc.tenantId !== tenantId || oc.status !== "active") {
        throw new ConvexError("Invalid occasion selection");
      }
    }

    // Dedup: a prior active submission for the same key is returned as-is so a
    // repeat submit is a no-op (submit-once). Dismissed rows still count — the
    // raw capture is retained, and a repeat submit of a dismissed key must not
    // mint a second row. Failed submissions can be retried via a resubmit.
    const candidates = await ctx.db
      .query("quoteSubmissions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) => q.eq(q.field("dedupKey"), dedupKey))
      .collect();
    const existing = candidates.find(
      (sub) =>
        sub.deletedAt == null &&
        (sub.status === "pending" ||
          sub.status === "processing" ||
          sub.status === "completed" ||
          sub.status === "dismissed"),
    );
    if (existing) {
      return {
        submissionId: existing._id,
        isDuplicate: true,
        status: existing.status,
      };
    }

    const now = Date.now();
    const submissionId = await ctx.db.insert("quoteSubmissions", {
      tenantId,
      dedupKey,
      status: "pending",
      submittedAt: now,
      clientName,
      email,
      phone: args.phone.trim() || null,
      eventDate: args.eventDate,
      eventEndTime: args.eventEndTime || null,
      guestCount: args.guestCount,
      serviceStyleId: args.serviceStyleId ?? null,
      occasionId: args.occasionId ?? null,
      // Free-text answers from the empty-catalog fallback inputs (A5): stored
      // as text because no catalog row exists to reference.
      serviceStyleText: args.serviceStyleText.trim() || null,
      occasionText: args.occasionText.trim() || null,
      venueName: args.venueName.trim() || null,
      venueAddress: args.venueAddress.trim() || null,
      menuPreferences: args.menuPreferences.trim() || null,
      dietaryRestrictions: args.dietaryRestrictions.trim() || null,
      notes: args.notes.trim() || null,
      consentGrantedAt: now,
      version: 1,
    });

    return { submissionId, isDuplicate: false, status: "pending" };
  },
});

/**
 * Anonymous-safe catalog read for the public /quote form. The generated
 * listServiceStyle / listOccasion queries require event/sales roles and derive
 * tenant scope from auth, so they return [] for an anonymous visitor. This
 * authored query resolves the active organization's tenant directly (no auth)
 * and returns just the public, active options the form needs.
 */
export const getQuoteFormOptions = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    serviceStyles: { _id: Id<"serviceStyles">; name: string }[];
    occasions: { _id: Id<"occasions">; name: string }[];
  }> => {
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!org) return { serviceStyles: [], occasions: [] };
    const tenantId = org.tenantId;
    const [serviceStyles, occasions] = await Promise.all([
      ctx.db
        .query("serviceStyles")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect(),
      ctx.db
        .query("occasions")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect(),
    ]);
    const bySort = (a: { sortOrder?: number }, b: { sortOrder?: number }) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return {
      serviceStyles: serviceStyles
        .map((s) => ({ _id: s._id, name: s.name, sortOrder: s.sortOrder }))
        .sort(bySort),
      occasions: occasions
        .map((o) => ({ _id: o._id, name: o.name, sortOrder: o.sortOrder }))
        .sort(bySort),
    };
  },
});

/**
 * Public quote submission. Validates input, then captures the QuoteSubmission
 * via the system-privileged ingress seam. Anonymous-safe — creates ONLY the
 * capture record; an authenticated operator converts it into Lead/Event/
 * Proposal via processQuoteSubmission.
 *
 * Why capture-only on the public path: the generated sales creates enforce
 * salesAccess, which an anonymous web visitor cannot satisfy (and should not).
 */
export const submitQuote = action({
  args: {
    clientName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    eventDate: v.number(), // epoch-ms (browser-local; converted client-side)
    eventEndTime: v.optional(v.number()), // epoch-ms, browser-local
    guestCount: v.number(),
    consent: v.boolean(),
    serviceStyleId: v.optional(v.id("serviceStyles")),
    occasionId: v.optional(v.id("occasions")),
    serviceStyleText: v.optional(v.string()),
    occasionText: v.optional(v.string()),
    venueName: v.optional(v.string()),
    venueAddress: v.optional(v.string()),
    menuPreferences: v.optional(v.string()),
    dietaryRestrictions: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    submissionId: Id<"quoteSubmissions">;
    status: string;
    isDuplicate: boolean;
    message: string;
  }> => {
    // Validate input.
    if (!isValidTimestamp(args.eventDate)) {
      throw new ConvexError("Invalid event date");
    }
    if (
      !Number.isFinite(args.guestCount) ||
      args.guestCount < 1 ||
      args.guestCount > 100000
    ) {
      throw new ConvexError("Guest count must be between 1 and 100,000");
    }
    if (!args.clientName?.trim()) {
      throw new ConvexError("Client name is required");
    }
    if (!args.email?.trim()) {
      throw new ConvexError("Email address is required");
    }
    // Consent is validated server-side, not just by the client checkbox — a
    // direct API caller cannot stamp a submission as consented without it.
    if (!args.consent) {
      throw new ConvexError("Data processing consent is required");
    }

    if (
      args.eventEndTime !== undefined &&
      !isValidTimestamp(args.eventEndTime)
    ) {
      throw new ConvexError("Invalid end time");
    }

    const result = await ctx.runMutation(
      internal.quoteBuilder.ingressQuoteSubmission,
      {
        clientName: bounded(args.clientName),
        email: bounded(args.email),
        phone: bounded(args.phone),
        eventDate: args.eventDate,
        eventEndTime: args.eventEndTime ?? 0,
        guestCount: args.guestCount,
        serviceStyleId: args.serviceStyleId,
        occasionId: args.occasionId,
        serviceStyleText: bounded(args.serviceStyleText),
        occasionText: bounded(args.occasionText),
        venueName: bounded(args.venueName),
        venueAddress: bounded(args.venueAddress),
        menuPreferences: bounded(args.menuPreferences, MAX_LONG),
        dietaryRestrictions: bounded(args.dietaryRestrictions, MAX_LONG),
        notes: bounded(args.notes, MAX_LONG),
      },
    );

    return {
      submissionId: result.submissionId,
      status: result.status ?? "pending",
      isDuplicate: result.isDuplicate,
      message: result.isDuplicate
        ? "You've already submitted a quote request for this event. We'll be in touch soon!"
        : "Thank you! Your quote request has been submitted. We'll be in touch within 24-48 hours.",
    };
  },
});

/**
 * Authenticated operator path: converts a captured QuoteSubmission into the
 * real sales records (Client, Lead, Event, draft Proposal). Runs with the
 * caller's auth, so the generated sales creates pass their salesAccess guards.
 * Each step fails gracefully — a partial conversion still leaves the earlier
 * records and updates the submission with whatever was created.
 */
export const processQuoteSubmission = action({
  args: {
    submissionId: v.id("quoteSubmissions"),
  },
  handler: async (
    ctx,
    { submissionId },
  ): Promise<{
    submissionId: Id<"quoteSubmissions">;
    clientId: Id<"clients"> | null;
    leadId: Id<"leads"> | null;
    eventId: Id<"events"> | null;
    proposalId: Id<"proposals"> | null;
    errors: string[];
  }> => {
    const submission = await ctx.runQuery(api.queries.getQuoteSubmission, {
      id: submissionId,
    });
    if (!submission || submission.deletedAt != null) {
      throw new ConvexError("Quote submission not found");
    }
    // Only pending submissions can be converted: the manifest transitions are
    // pending → processing → completed|failed. A failed conversion reopens via
    // QuoteSubmission_retry (failed → pending, checkpointed ids kept) before
    // this action runs again — the steps below then reuse those records.
    if (submission.status !== "pending") {
      throw new ConvexError(
        `Only pending submissions can be converted (this one is ${submission.status}).`,
      );
    }

    const errors: string[] = [];
    const clientName = submission.clientName ?? "Quote Lead";
    const email = submission.email ?? "";
    const phone = submission.phone ?? undefined;

    // Move into processing (salesAccess write — caller is authorized).
    await ctx.runMutation(api.mutations.QuoteSubmission_startProcessing, {
      docId: submissionId,
    });

    // Client — match by email, else create. A retry (failed → pending) reuses
    // the checkpointed id from the failed attempt, so the retry never
    // duplicates the client.
    let clientId: Id<"clients"> | null = submission.clientId ?? null;
    if (!clientId) {
      try {
        const existingClients = await ctx.runQuery(api.queries.listClient);
        const existingClient = existingClients.find(
          (c) =>
            c.email?.toLowerCase() === email.toLowerCase() &&
            !c.deletedAt &&
            c.status === "active",
        );
        if (existingClient) {
          clientId = existingClient._id;
        } else {
          const created = await ctx.runMutation(
            api.mutations.Client_createViaRegister,
            { clientType: "company", companyName: clientName, email, phone },
          );
          clientId = created.docId;
        }
      } catch (error) {
        errors.push(
          `client: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Lead — reused from the checkpoint on retry, else created fresh.
    let leadId: Id<"leads"> | null = submission.leadId ?? null;
    if (!leadId) {
      try {
        if (clientId) {
          const leadResult = await ctx.runMutation(
            api.mutations.Lead_createViaCapture,
            {
              leadType: "company",
              source: "quote-builder",
              estimatedValue: 0,
              companyName: clientName,
              email,
              phone,
            },
          );
          const createdLeadId = leadResult.docId;
          leadId = createdLeadId;
          await ctx.runMutation(api.mutations.Lead_stageConversion, {
            docId: createdLeadId,
            clientId,
            clientContactId: undefined,
          });
          await ctx.runMutation(api.mutations.Lead_confirmConversion, {
            docId: createdLeadId,
          });
        }
      } catch (error) {
        errors.push(
          `lead: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Event — reused from the checkpoint on retry, else created fresh.
    let eventId: Id<"events"> | null = submission.eventId ?? null;
    if (!eventId) {
      try {
        if (clientId) {
          const eventStart = submission.eventDate ?? Date.now();
          // Default to a 4-hour event when no end time is supplied OR the
          // supplied end is invalid / non-positive-duration (e.g. an
          // "00:00" end equals the midnight start) — otherwise Event
          // creation fails terminally.
          const rawEnd = submission.eventEndTime ?? 0;
          const eventEnd =
            Number.isFinite(rawEnd) && rawEnd > eventStart
              ? rawEnd
              : eventStart + 4 * 60 * 60 * 1000;
          const eventResult = await ctx.runMutation(
            api.mutations.Event_createViaPlanEngagement,
            {
              clientId,
              title: `Quote Request: ${clientName}`,
              eventType: "Catering Inquiry",
              startsAt: eventStart,
              endsAt: eventEnd,
              expectedHeadcount: submission.guestCount ?? 0,
              primaryContactName: clientName,
              budgetAmount: 0,
              quotedPrice: 0,
              serviceStyleId: submission.serviceStyleId ?? undefined,
              occasionId: submission.occasionId ?? undefined,
              venueName: submission.venueName ?? undefined,
              venueAddress: submission.venueAddress ?? undefined,
              serviceRequirements: submission.menuPreferences ?? undefined,
              operationalRequirements:
                submission.dietaryRestrictions ?? undefined,
            },
          );
          eventId = eventResult.docId;
        }
      } catch (error) {
        errors.push(
          `event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Draft proposal.
    // Free-text style/occasion (A5): when the catalogs were empty the
    // prospect answered as text and there is no catalog row to link, so the
    // draft proposal's notes carry the answer — sales reads it without
    // re-opening the raw submission.
    const freeTextNotes: string[] = [];
    if (!submission.serviceStyleId && submission.serviceStyleText) {
      freeTextNotes.push(`Service style: ${submission.serviceStyleText}`);
    }
    if (!submission.occasionId && submission.occasionText) {
      freeTextNotes.push(`Occasion: ${submission.occasionText}`);
    }
    const proposalNotes = [
      submission.notes ??
        "Draft proposal created from quote request. Menu selection and pricing to follow.",
      ...freeTextNotes,
    ].join(" ");
    // Draft proposal — reused from the checkpoint on retry, else created
    // fresh.
    let proposalId: Id<"proposals"> | null = submission.proposalId ?? null;
    if (!proposalId) {
      try {
        if (clientId) {
          const proposalResult = await ctx.runMutation(
            api.mutations.Proposal_createViaDraft,
            {
              clientId,
              title: `Proposal for ${clientName}`,
              eventDate: submission.eventDate ?? Date.now(),
              // The submission's end time carries onto the draft proposal
              // (C2) so the create-event prefill can seed the event's endsAt.
              eventEndDate: submission.eventEndTime ?? undefined,
              eventType: "Catering Inquiry",
              venueName: submission.venueName ?? undefined,
              venueAddress: submission.venueAddress ?? undefined,
              guestCount: submission.guestCount ?? 0,
              subtotal: 0,
              taxAmount: 0,
              discountAmount: 0,
              total: 0,
              eventId: eventId ?? undefined,
              notes: proposalNotes,
            },
          );
          proposalId = proposalResult.docId;
          // Linked at creation: draft accepts an optional eventId, so the
          // proposal points at the event this conversion just created (the
          // accept path then reuses it instead of booking a second event).
        }
      } catch (error) {
        errors.push(
          `proposal: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Only mark complete when every entity was created: complete's id fields
    // are schema-typed ids, so passing ""/null for a missing one throws AFTER
    // startProcessing committed — which would strand the submission in
    // "processing". A partial conversion is marked failed (retriable via
    // QuoteSubmission_retry) with the per-step errors.
    if (errors.length === 0 && clientId && leadId && eventId && proposalId) {
      // Best-effort: link the draft proposal back onto the lead so the pipeline
      // shows it (and avoids a duplicate-proposal prompt). Non-fatal.
      try {
        await ctx.runMutation(api.mutations.Lead_stageProposal, {
          docId: leadId,
          proposalId,
        });
      } catch {
        // swallow — the proposal still exists and is recorded on the submission
      }
      await ctx.runMutation(api.mutations.QuoteSubmission_complete, {
        docId: submissionId,
        clientId,
        leadId,
        eventId,
        proposalId,
      });
    } else {
      // Persist whatever IDs WERE created onto the submission before marking it
      // failed, so the failed row keeps durable links to the partial records —
      // the review queue links them, and a retry reuses them instead of
      // creating duplicates.
      await ctx.runMutation(
        internal.quoteBuilder.checkpointQuoteSubmissionIds,
        {
          docId: submissionId,
          clientId: clientId ?? undefined,
          leadId: leadId ?? undefined,
          eventId: eventId ?? undefined,
          proposalId: proposalId ?? undefined,
        },
      );
      await ctx.runMutation(api.mutations.QuoteSubmission_fail, {
        docId: submissionId,
        errorMessage:
          "Conversion could not complete all steps; see processing errors.",
        processingErrors: errors.join("; ") || "Unknown conversion failure",
      });
    }

    return { submissionId, clientId, leadId, eventId, proposalId, errors };
  },
});

/**
 * Persists whichever sales-record IDs a partial conversion created onto the
 * QuoteSubmission (used before marking a conversion failed, so the failed
 * row retains its links for the queue and for retry). Internal — only
 * processQuoteSubmission calls it.
 */
export const checkpointQuoteSubmissionIds = internalMutation({
  args: {
    docId: v.id("quoteSubmissions"),
    clientId: v.optional(v.id("clients")),
    leadId: v.optional(v.id("leads")),
    eventId: v.optional(v.id("events")),
    proposalId: v.optional(v.id("proposals")),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, string> = {};
    if (args.clientId) patch.clientId = args.clientId;
    if (args.leadId) patch.leadId = args.leadId;
    if (args.eventId) patch.eventId = args.eventId;
    if (args.proposalId) patch.proposalId = args.proposalId;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.docId, patch);
    }
  },
});

/**
 * Anonymous-safe status read. The generated getQuoteSubmission query is
 * tenant-scoped (it returns null when the caller has no matching tenantId), so
 * an anonymous submitter cannot look up their own submission. This internal
 * query reads by id directly (the submission id is the unguessable tracking
 * number) and the public action below returns only non-PII status fields.
 */
export const getQuoteSubmissionPublicStatus = internalQuery({
  args: { id: v.id("quoteSubmissions") },
  handler: async (ctx, { id }): Promise<Doc<"quoteSubmissions"> | null> => {
    return await ctx.db.get(id);
  },
});

/**
 * Public query to check quote submission status by ID.
 * Allows users to check the status of their submission without authentication.
 */
export const getQuoteSubmissionStatus = action({
  args: {
    submissionId: v.id("quoteSubmissions"),
  },
  handler: async (
    ctx,
    { submissionId },
  ): Promise<QuoteSubmissionStatusResult> => {
    const submission = await ctx.runQuery(
      internal.quoteBuilder.getQuoteSubmissionPublicStatus,
      {
        id: submissionId,
      },
    );

    if (!submission || submission.deletedAt != null) {
      throw new ConvexError("Quote submission not found");
    }

    return {
      id: submission._id,
      status: submission.status,
      submittedAt: submission.submittedAt,
      completedAt: submission.completedAt,
      clientId: submission.clientId,
      leadId: submission.leadId,
      eventId: submission.eventId,
      proposalId: submission.proposalId,
      errorMessage: submission.errorMessage,
    };
  },
});
