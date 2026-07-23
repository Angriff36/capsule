import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
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

function recurringDraft(
  template: RecurringEvent,
  startsAt: number,
  sequence: number,
  seriesId: string,
  now: number,
): Omit<Doc<"events">, "_id" | "_creationTime"> {
  const templateStartsAt = Number(template.startsAt);
  const templateEndsAt = Number(template.endsAt);
  const duration = templateEndsAt - templateStartsAt;
  return {
    tenantId: template.tenantId,
    clientId: template.clientId,
    venueId: template.venueId,
    assignedToId: template.assignedToId,
    title: template.title,
    eventType: template.eventType,
    startsAt,
    endsAt: startsAt + duration,
    purchasingWeekStart: startsAt,
    venueName: template.venueName,
    venueAddress: template.venueAddress,
    venueCapacity: template.venueCapacity,
    expectedHeadcount: template.expectedHeadcount,
    primaryContactName: template.primaryContactName,
    primaryContactEmail: template.primaryContactEmail,
    primaryContactPhone: template.primaryContactPhone,
    accessibilityNeeds: template.accessibilityNeeds ?? [],
    serviceRequirements: template.serviceRequirements,
    operationalRequirements: template.operationalRequirements,
    budgetAmount: template.budgetAmount,
    quotedPrice: template.quotedPrice,
    stage: "planning",
    plannedAt: now,
    recurrenceActive: false,
    recurrenceSeriesId: seriesId,
    recurrenceTemplateEventId: template._id,
    recurrenceSequence: sequence,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
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
 * Internal projection-gap seam. Manifest 3.6.41 can emit static cron calls but
 * cannot perform a secure tenant-wide query or supply system auth to generated
 * Event commands. This function is internal-only, tokenized per series, and
 * mirrors the generated Event.planEngagement document/event shape.
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
        const draft = recurringDraft(
          template,
          nextStartsAt,
          sequence,
          args.seriesId,
          now,
        );
        const eventId = await ctx.db.insert("events", draft);
        await ctx.db.insert("manifestEvents", {
          type: "EventPlanned",
          entity: "Event",
          entityId: eventId,
          payload: {
            eventId,
            tenantId: draft.tenantId,
            clientId: draft.clientId,
            venueId: draft.venueId,
            venueCapacity: draft.venueCapacity,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            expectedHeadcount: draft.expectedHeadcount,
            recurrenceTemplateEventId: args.templateEventId,
            recurrenceSeriesId: args.seriesId,
            recurrenceSequence: sequence,
          },
          createdAt: now,
        });
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
    await ctx.db.patch(args.templateEventId, {
      recurrenceGeneratedCount: generatedCount,
      recurrenceNextStartsAt: remainsActive ? nextStartsAt : null,
      recurrenceActive: remainsActive,
      recurrenceCompletedAt: remainsActive ? null : now,
      updatedAt: now,
      version: (template.version ?? 0) + 1,
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
