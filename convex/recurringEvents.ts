import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { decrypt } from "./lib/encryption";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";
import {
  RECURRING_EVENT_BATCH_LIMIT,
  RECURRING_EVENT_DRAFT_HORIZON_MS,
  nextRecurringEventSweepAt,
  recurrenceIncludesSequence,
  recurringEventStartsAt,
  type EventRecurrenceEndCondition,
  type EventRecurrenceFrequency,
} from "../src/lib/eventRecurrence";

const frequency = v.union(
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("annually"),
);
const endCondition = v.union(
  v.literal("on_date"),
  v.literal("after_occurrences"),
);

type RecurringEvent = Doc<"events"> & {
  recurrenceFrequency?: EventRecurrenceFrequency | null;
  recurrenceEndCondition?: EventRecurrenceEndCondition | null;
  recurrenceEndsAt?: number | null;
  recurrenceOccurrenceLimit?: number | null;
  recurrenceAnchorStartsAt?: number | null;
  recurrenceNextStartsAt?: number | null;
  recurrenceGeneratedCount?: number | null;
  recurrenceSeriesId?: string | null;
  recurrenceActive?: boolean | null;
  recurrenceCompletedAt?: number | null;
  recurrenceTemplateEventId?: Id<"events"> | null;
  recurrenceSequence?: number | null;
};

function requireScheduleSource(event: RecurringEvent): {
  anchorStartsAt: number;
  frequency: EventRecurrenceFrequency;
  endCondition: EventRecurrenceEndCondition;
  nextStartsAt: number;
} {
  if (
    typeof event.recurrenceAnchorStartsAt !== "number" ||
    typeof event.recurrenceNextStartsAt !== "number" ||
    !event.recurrenceFrequency ||
    !event.recurrenceEndCondition
  ) {
    throw new Error("Recurring Event schedule is incomplete");
  }
  return {
    anchorStartsAt: event.recurrenceAnchorStartsAt,
    frequency: event.recurrenceFrequency,
    endCondition: event.recurrenceEndCondition,
    nextStartsAt: event.recurrenceNextStartsAt,
  };
}

/** Event fields sealed by the generated Event commands (JSON envelope). */
async function openEventField(
  ctx: MutationCtx,
  property: string,
  raw: string | null | undefined,
): Promise<string | undefined> {
  if (raw == null) return undefined;
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !("v" in envelope) ||
    !("kid" in envelope) ||
    !("ct" in envelope)
  ) {
    return raw;
  }
  if ((envelope as { v: unknown }).v !== 1) {
    throw new Error(`Unsupported encryption envelope for Event.${property}`);
  }
  return await decrypt(
    (envelope as { ct: string }).ct,
    (envelope as { kid: string }).kid,
    { ctx, entity: "Event", property },
  );
}

/** Drops null/undefined so optional command params are omitted, not sent. */
function present<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item != null),
  ) as T;
}

/**
 * Event.planEngagement params for one occurrence: the same planning facts the
 * series has always copied from its source Event, moved to the occurrence
 * start, plus the recurrence link. Encrypted contact fields are opened here
 * and sealed again by the command.
 */
async function occurrencePlanArgs(
  ctx: MutationCtx,
  template: RecurringEvent,
  startsAt: number,
  sequence: number,
  seriesId: string,
) {
  const duration = Number(template.endsAt) - Number(template.startsAt);
  const primaryContactName = await openEventField(
    ctx,
    "primaryContactName",
    template.primaryContactName,
  );
  if (!template.clientId || !primaryContactName) {
    throw new Error(
      "Recurring Event source is missing its client or primary contact",
    );
  }
  return present({
    clientId: String(template.clientId),
    title: template.title,
    eventType: template.eventType,
    startsAt,
    endsAt: startsAt + duration,
    expectedHeadcount: template.expectedHeadcount,
    primaryContactName,
    // 0 is the planning seed planEngagement needs when the source has none.
    budgetAmount: template.budgetAmount ?? 0,
    quotedPrice: template.quotedPrice ?? 0,
    venueId: template.venueId ?? undefined,
    venueName: template.venueName ?? undefined,
    venueAddress: template.venueAddress ?? undefined,
    venueCapacity: template.venueCapacity ?? undefined,
    primaryContactEmail: await openEventField(
      ctx,
      "primaryContactEmail",
      template.primaryContactEmail,
    ),
    primaryContactPhone: await openEventField(
      ctx,
      "primaryContactPhone",
      template.primaryContactPhone,
    ),
    accessibilityNeeds: template.accessibilityNeeds ?? [],
    serviceRequirements: template.serviceRequirements ?? undefined,
    operationalRequirements: template.operationalRequirements ?? undefined,
    assignedToId: template.assignedToId ?? undefined,
    recurrenceTemplateEventId: String(template._id),
    recurrenceSeriesId: seriesId,
    recurrenceSequence: sequence,
  });
}

/**
 * Configure the governed Manifest recurrence command, then arm the internal
 * materializer. The action keeps tenant/policy enforcement in the generated
 * mutation while hiding scheduler bookkeeping from the operator.
 */
export const configure = action({
  args: {
    docId: v.id("events"),
    frequency,
    endCondition,
    recurrenceEndsAt: v.optional(v.number()),
    occurrenceLimit: v.optional(v.number()),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ seriesId: string }> => {
    const event = (await ctx.runQuery(api.queries.getEvent, {
      id: args.docId,
    })) as RecurringEvent | null;
    if (
      !event ||
      typeof event.startsAt !== "number" ||
      typeof event.endsAt !== "number"
    ) {
      throw new ConvexError(
        "Set the Event start and end before making it recurring.",
      );
    }

    const nextStartsAt = recurringEventStartsAt(
      event.startsAt,
      args.frequency,
      2,
    );
    if (
      !recurrenceIncludesSequence(
        {
          endCondition: args.endCondition,
          recurrenceEndsAt: args.recurrenceEndsAt,
          occurrenceLimit: args.occurrenceLimit,
        },
        nextStartsAt,
        2,
      )
    ) {
      throw new ConvexError(
        "The recurrence end must include at least one future Event.",
      );
    }

    const seriesId = crypto.randomUUID();
    await ctx.runMutation(api.mutations.Event_configureRecurrence, {
      docId: args.docId,
      frequency: args.frequency,
      endCondition: args.endCondition,
      recurrenceEndsAt: args.recurrenceEndsAt,
      occurrenceLimit: args.occurrenceLimit,
      nextStartsAt,
      seriesId,
      version: args.version,
    });
    await ctx.scheduler.runAfter(0, internal.recurringEvents.materializeDue, {
      templateEventId: args.docId,
      tenantId: event.tenantId,
      seriesId,
    });
    return { seriesId };
  },
});

/**
 * ~~Internal projection-gap seam. Manifest 3.6.41 can emit static cron calls but
 * cannot perform a secure tenant-wide query or supply system auth to generated
 * Event commands. This function is internal-only, tokenized per series, and
 * mirrors the generated Event.planEngagement document/event shape.~~
 * 2026-09-29: system auth for generated commands exists
 * (lib/tenantSystemCommandRunner.ts). This scheduled, identity-less sweep is
 * internal-only and tokenized per series; it plans each occurrence with the
 * generated Event.planEngagement (recurrence params, system role only) and
 * records progress with Event.advanceRecurrence, both through the tenant
 * system runner in this transaction. Occurrences therefore emit a real
 * EventPlanned, so the event-number hook and every other EventPlanned
 * consequence run for them. A sequence that already exists is skipped, so a
 * replayed sweep plans nothing twice.
 */
export const materializeDue = internalMutation({
  args: {
    templateEventId: v.id("events"),
    tenantId: v.string(),
    seriesId: v.string(),
  },
  handler: async (ctx, args) => {
    const rawTemplate = await ctx.db.get(args.templateEventId);
    const template = rawTemplate as RecurringEvent | null;
    if (
      !template ||
      template.tenantId !== args.tenantId ||
      template.deletedAt != null ||
      !template.recurrenceActive ||
      template.recurrenceSeriesId !== args.seriesId
    ) {
      return { generated: 0, active: false };
    }
    if (
      typeof template.startsAt !== "number" ||
      typeof template.endsAt !== "number" ||
      template.endsAt <= template.startsAt
    ) {
      throw new Error("Recurring Event source has an invalid date range");
    }

    const schedule = requireScheduleSource(template);
    const existing = (await ctx.db
      .query("events")
      .withIndex("by_recurrenceTemplateEventId", (query) =>
        query.eq("recurrenceTemplateEventId", args.templateEventId),
      )
      .collect()) as RecurringEvent[];
    const existingSequences = new Set(
      existing
        .filter((event) => event.recurrenceSeriesId === args.seriesId)
        .map((event) => event.recurrenceSequence)
        .filter((value): value is number => typeof value === "number"),
    );

    const system = TenantSystemCommandRunner.forTenant(
      ctx,
      args.tenantId,
    ).context;
    const now = Date.now();
    const horizon = now + RECURRING_EVENT_DRAFT_HORIZON_MS;
    let generatedCount = Math.max(template.recurrenceGeneratedCount ?? 1, 1);
    let sequence = generatedCount + 1;
    let nextStartsAt = schedule.nextStartsAt;
    let generated = 0;

    while (
      nextStartsAt <= horizon &&
      recurrenceIncludesSequence(
        {
          endCondition: schedule.endCondition,
          recurrenceEndsAt: template.recurrenceEndsAt,
          occurrenceLimit: template.recurrenceOccurrenceLimit,
        },
        nextStartsAt,
        sequence,
      ) &&
      generated < RECURRING_EVENT_BATCH_LIMIT
    ) {
      if (!existingSequences.has(sequence)) {
        await system.runMutation(
          api.mutations.Event_createViaPlanEngagement,
          await occurrencePlanArgs(
            ctx,
            template,
            nextStartsAt,
            sequence,
            args.seriesId,
          ),
        );
        generated += 1;
      }
      generatedCount = sequence;
      sequence += 1;
      nextStartsAt = recurringEventStartsAt(
        schedule.anchorStartsAt,
        schedule.frequency,
        sequence,
      );
    }

    const remainsActive = recurrenceIncludesSequence(
      {
        endCondition: schedule.endCondition,
        recurrenceEndsAt: template.recurrenceEndsAt,
        occurrenceLimit: template.recurrenceOccurrenceLimit,
      },
      nextStartsAt,
      sequence,
    );
    await system.runMutation(api.mutations.Event_advanceRecurrence, {
      docId: args.templateEventId,
      version: template.version,
      seriesId: args.seriesId,
      generatedCount,
      ...(remainsActive ? { nextStartsAt } : {}),
    });

    if (remainsActive) {
      await ctx.scheduler.runAt(
        nextRecurringEventSweepAt(nextStartsAt, now),
        internal.recurringEvents.materializeDue,
        args,
      );
    }
    return { generated, active: remainsActive };
  },
});
