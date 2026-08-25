import type {
  BundlePrepTask,
  EventBundle,
  BundleHeader,
} from "../lib/tppReports/eventBundle";
import { toEpochMillis } from "../lib/tppReports/reportValues";
import { planCommerceSteps } from "./CapsuleEventBundleCommercePlan";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import {
  centsToDollars,
  dishKey,
  isMenuDishLine,
  normalizeName,
  operationalRequirementsText,
  personNameParts,
  timelineEntryExists,
  venueAddressText,
  wholeQuantity,
  type PlannedStep,
} from "./CapsuleEventBundleShared";
import { planSupplySteps } from "./CapsuleEventBundleSupplyPlan";
import { toCapsuleUnit } from "./CapsuleMeasureUnit";

export type { PlannedStep } from "./CapsuleEventBundleShared";

/**
 * Turns a TPP event bundle into the ordered command sequence that enters it.
 *
 * This module is pure: it decides what to call and with which arguments, but
 * calls nothing. That keeps the mapping testable and makes the preview the
 * agent shows a true statement of what the run will do.
 *
 * With `context.existing` the plan attaches to an event that is already in
 * Capsule: records that exist are seeded by id and only the missing pieces
 * become steps. With `context.directory` the plan can match staff, vendors
 * and ingredients to tenant records.
 */

export interface EventBundlePlan {
  steps: PlannedStep[];
  /** Ids that already exist, keyed by the ref the steps use. */
  seedIds: Record<string, string>;
  /** Facts the caller should check before entering, in plain words. */
  warnings: string[];
  summary: {
    timelineActivities: number;
    dishes: number;
    prepTasks: number;
    packListItems: number;
    skippedPrepTasks: number;
    clientContacts: number;
    proposalLines: number;
    payments: number;
    staffAssignments: number;
    vendors: number;
    ingredients: number;
    orderLines: number;
    unassignedLines: number;
    inHouseLines: number;
  };
}

const HOUR_MS = 3_600_000;

function prepTaskUnit(task: BundlePrepTask): string | undefined {
  return toCapsuleUnit(task.unit);
}

function emptySummary(): EventBundlePlan["summary"] {
  return {
    timelineActivities: 0,
    dishes: 0,
    prepTasks: 0,
    packListItems: 0,
    skippedPrepTasks: 0,
    clientContacts: 0,
    proposalLines: 0,
    payments: 0,
    staffAssignments: 0,
    vendors: 0,
    ingredients: 0,
    orderLines: 0,
    unassignedLines: 0,
    inHouseLines: 0,
  };
}

/**
 * Build the command plan for a bundle.
 *
 * The order matters: venue and client exist before the event, the event before
 * its dishes, and a dish before the prep tasks that produce it.
 */
/**
 * The stable identity of a bundle: its TPP invoice number, or, when the
 * reports carry none, a key built from the header so two no-invoice bundles
 * never share proposal/invoice/order numbers or idempotency results.
 */
export function bundleIdentity(header: BundleHeader): string {
  if (header.invoiceNumber) return header.invoiceNumber;
  const title = (header.title ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return `noinvoice-${header.eventDate ?? "nodate"}-${header.startMinutes ?? "notime"}-${header.guestCount ?? "noguests"}${title ? `-${title}` : ""}`;
}

export function buildEventBundlePlan(
  bundle: EventBundle,
  context: CapsuleEventBundleContext = {},
): EventBundlePlan {
  const steps: PlannedStep[] = [];
  const seedIds: Record<string, string> = {};
  const warnings: string[] = [...bundle.warnings];
  const summary = emptySummary();
  const invoice = bundleIdentity(bundle.header);
  const existing = context.existing;

  const eventDate = bundle.header.eventDate;
  if (eventDate === undefined) {
    return {
      steps: [],
      seedIds,
      warnings: [
        ...warnings,
        "Refusing to plan: the bundle has no event date, which Event.planEngagement requires.",
      ],
      summary,
    };
  }

  const startMinutes = bundle.header.startMinutes ?? 17 * 60;
  if (bundle.header.startMinutes === undefined) {
    warnings.push("No start time was found; 5:00 PM is assumed.");
  }
  const startsAt = toEpochMillis(eventDate, startMinutes);
  const endMinutes = bundle.header.endMinutes;
  // An end before the start (10:00 PM - 2:00 AM) is the next morning, and so
  // is any timeline row (a 1:00 AM strike) that falls before the start.
  const crossesMidnight = endMinutes !== undefined && endMinutes < startMinutes;
  const eventRelativeMinutes = (minutes: number): number =>
    crossesMidnight && minutes < startMinutes ? minutes + 24 * 60 : minutes;
  const endsAt =
    endMinutes !== undefined && endMinutes !== startMinutes
      ? toEpochMillis(
          eventDate,
          endMinutes > startMinutes ? endMinutes : endMinutes + 24 * 60,
        )
      : startsAt + HOUR_MS;

  if (existing) {
    seedIds.event = existing.eventId;
    seedIds.client = existing.clientId;
    if (existing.venueId !== undefined) seedIds.venue = existing.venueId;
  } else {
    if (bundle.venue.name !== undefined) {
      steps.push({
        capabilityId: "Venue.register",
        ref: "venue",
        label: `Register venue ${bundle.venue.name}`,
        idempotencySuffix: `venue:${normalizeName(bundle.venue.name)}`,
        args: {
          name: bundle.venue.name,
          venueType: "other",
          capacity: bundle.header.guestCount ?? 0,
          addressLine1: bundle.venue.addressLine1,
          city: bundle.venue.city,
          region: bundle.venue.region,
          postalCode: bundle.venue.postalCode,
          contactName: bundle.venue.contactName,
          contactPhone: bundle.venue.contactPhone ?? bundle.venue.phone,
          cateringNotes: bundle.notes.cateringKitchen,
          loadInInstructions: bundle.notes.serviceSetup,
        },
      });
    }

    const { givenName, familyName } = personNameParts(bundle.client.name);
    steps.push({
      capabilityId: "Client.register",
      ref: "client",
      label: `Register client ${bundle.client.name ?? "(unnamed)"}`,
      idempotencySuffix: `client:${normalizeName(bundle.client.name ?? invoice)}`,
      args: {
        clientType: "person",
        givenName,
        familyName,
        email: bundle.client.email,
        phone: bundle.client.phone,
        addressLine1: bundle.client.addressLine1,
        city: bundle.client.city,
        region: bundle.client.region,
        postalCode: bundle.client.postalCode,
      },
    });

    steps.push({
      capabilityId: "Event.planEngagement",
      ref: "event",
      label: `Plan event ${bundle.header.title ?? invoice}`,
      idempotencySuffix: `event:${invoice}`,
      resolveRefs:
        bundle.venue.name === undefined
          ? ["clientId"]
          : ["clientId", "venueId"],
      args: {
        clientId: "client",
        venueId: bundle.venue.name === undefined ? undefined : "venue",
        title: bundle.header.title ?? `TPP invoice ${invoice}`,
        eventType: bundle.header.eventType ?? bundle.header.occasion ?? "Event",
        startsAt,
        endsAt,
        expectedHeadcount: Math.max(1, bundle.header.guestCount ?? 1),
        primaryContactName: bundle.client.name ?? "Unknown contact",
        primaryContactEmail: bundle.client.email,
        primaryContactPhone: bundle.client.phone,
        // The reports price the event but never state a client budget. Zero is
        // the house convention for a required amount the source does not carry,
        // as in convex/importCommit.ts.
        budgetAmount: 0,
        quotedPrice: centsToDollars(bundle.totals.eventTotalCents),
        venueName: bundle.venue.name,
        venueAddress: venueAddressText(bundle),
        serviceRequirements: bundle.notes.eventOverview,
        operationalRequirements: operationalRequirementsText(bundle),
      },
    });
  }

  const knownTimeline = existing?.timelineNames ?? [];
  const timeline = [...bundle.timeline].sort(
    (a, b) => eventRelativeMinutes(a.minutes) - eventRelativeMinutes(b.minutes),
  );
  timeline.forEach((entry, index) => {
    if (timelineEntryExists(entry.name, knownTimeline)) return;
    summary.timelineActivities += 1;
    steps.push({
      capabilityId: "EventTimelineActivity.schedule",
      ref: `timeline:${index}`,
      label: `Schedule ${entry.name}`,
      idempotencySuffix: `timeline:${invoice}:${entry.minutes}:${normalizeName(entry.name)}`,
      resolveRefs: ["eventId"],
      args: {
        eventId: "event",
        name: entry.name,
        startsAt: toEpochMillis(eventDate, eventRelativeMinutes(entry.minutes)),
        notes: entry.notes,
        category: entry.category,
        responsibleParty: entry.staff,
        assigneeTeams: entry.team === undefined ? undefined : [entry.team],
        sortOrder: index,
      },
    });
  });

  /** Menu item name → the local ref of its EventDish step or seeded id. */
  const eventDishRefs = new Map<string, string>();
  const existingDishes = new Map(
    (existing?.eventDishes ?? []).map((row) => [dishKey(row.dishName), row]),
  );

  bundle.menu.forEach((item, index) => {
    if (!isMenuDishLine(item)) return;
    const dishRef = `dish:${index}`;
    const eventDishRef = `eventDish:${index}`;
    const key = dishKey(item.name);
    const found = existingDishes.get(key);
    eventDishRefs.set(key, eventDishRef);

    if (found) {
      seedIds[eventDishRef] = found.id;
      if (item.course && !found.course) {
        steps.push({
          capabilityId: "EventDish.changeCourse",
          ref: `course:${index}`,
          label: `File ${item.name} under ${item.course}`,
          idempotencySuffix: `course:${invoice}:${key}`,
          resolveRefs: ["docId"],
          args: {
            docId: eventDishRef,
            course: item.course,
            serviceStyle: bundle.header.serviceStyle,
          },
        });
      }
      return;
    }

    summary.dishes += 1;
    steps.push({
      capabilityId: "Dish.introduce",
      ref: dishRef,
      label: `Introduce dish ${item.name}`,
      idempotencySuffix: `dish:${key}`,
      args: {
        name: item.name,
        portionSize: 1,
        portionUnit: "serving",
        description: item.description,
        course: item.course,
        serviceStyle: bundle.header.serviceStyle,
      },
    });
    steps.push({
      capabilityId: "EventDish.addToEvent",
      ref: eventDishRef,
      label: `Add ${item.name} to the event`,
      idempotencySuffix: `event-dish:${invoice}:${key}`,
      resolveRefs: ["eventId", "dishId"],
      args: {
        eventId: "event",
        dishId: dishRef,
        quantityServings:
          item.quantityServings ?? bundle.header.guestCount ?? 1,
        course: item.course,
        serviceStyle: bundle.header.serviceStyle,
        specialInstructions: item.specialInstructions,
      },
    });
  });

  const knownPrep = new Set(
    (existing?.prepTasks ?? []).map(
      (task) => `${dishKey(task.dishName)}:${normalizeName(task.name)}`,
    ),
  );
  let roundedPrep = 0;
  bundle.prepTasks.forEach((task, index) => {
    const taskDishKey = dishKey(task.dishName);
    const eventDishRef = eventDishRefs.get(taskDishKey);
    const unit = prepTaskUnit(task);
    if (eventDishRef === undefined) {
      summary.skippedPrepTasks += 1;
      warnings.push(
        `Prep task "${task.name}" was skipped: "${task.dishName}" is not on the event menu.`,
      );
      return;
    }
    if (unit === undefined) {
      summary.skippedPrepTasks += 1;
      warnings.push(
        `Prep task "${task.name}" was skipped: unit "${task.unit ?? "(none)"}" has no Capsule equivalent.`,
      );
      return;
    }
    if (knownPrep.has(`${taskDishKey}:${normalizeName(task.name)}`)) return;

    const { quantity, rounded } = wholeQuantity(task.quantity);
    if (rounded) roundedPrep += 1;
    summary.prepTasks += 1;
    steps.push({
      capabilityId: "PrepTask.open",
      ref: `prepTask:${index}`,
      label: `Open prep task ${task.name}`,
      idempotencySuffix: `prep:${invoice}:${taskDishKey}:${normalizeName(task.name)}`,
      resolveRefs: ["eventId", "eventDishId"],
      args: {
        eventId: "event",
        eventDishId: eventDishRef,
        name: task.name,
        quantity,
        unit,
        category: task.category,
        specialInstructions: rounded
          ? [
              task.specialInstructions,
              `TPP quantity: ${task.quantity} ${task.unit ?? ""}`.trim(),
            ]
              .filter(Boolean)
              .join(" · ")
          : task.specialInstructions,
      },
    });
  });
  if (roundedPrep > 0) {
    warnings.push(
      `${roundedPrep} prep task(s) under one unit were rounded up to 1 (the printed amount is kept in the instructions).`,
    );
  }

  if (bundle.packList.length > 0) {
    const knownItems = new Set(existing?.packList?.itemDescriptions ?? []);
    if (existing?.packList) {
      seedIds.packList = existing.packList.id;
    } else {
      // Approving an event opens its own pack list by Manifest reaction, so an
      // approval after this run leaves a second, empty one. Say so plainly.
      warnings.push(
        "A pack list is created here with the packed items. Approving the event later opens a second, empty pack list, because Event.approve does that by reaction.",
      );
      steps.push({
        capabilityId: "PackList.open",
        ref: "packList",
        label: `Open the pack list`,
        idempotencySuffix: `pack-list:${invoice}`,
        resolveRefs: ["eventId"],
        args: {
          eventId: "event",
          name: `${bundle.header.title ?? invoice} pack list`,
          notes: `Imported from the TPP pack list for invoice ${invoice}.`,
        },
      });
    }

    bundle.packList.forEach((item, index) => {
      const unit = toCapsuleUnit(item.unit) ?? "each";
      const forItems =
        item.forItems.length > 0 ? ` (for ${item.forItems.join(", ")})` : "";
      const description = `${item.classification}: ${item.name}${forItems}`;
      if (knownItems.has(description)) return;
      summary.packListItems += 1;
      steps.push({
        capabilityId: "PackListItem.addItem",
        ref: `packItem:${index}`,
        label: `Pack ${item.name}`,
        idempotencySuffix: `pack-item:${invoice}:${normalizeName(item.classification)}:${normalizeName(item.name)}`,
        resolveRefs: ["packListId"],
        args: {
          packListId: "packList",
          description,
          requiredQuantity: wholeQuantity(item.quantity).quantity,
          unit,
        },
      });
    });
  }

  const commerce = planCommerceSteps({
    bundle,
    invoice,
    eventDate,
    startsAt,
    endsAt,
    context,
  });
  steps.push(...commerce.steps);
  warnings.push(...commerce.warnings);
  Object.assign(seedIds, commerce.seedIds);
  Object.assign(summary, commerce.counts);

  const supply = planSupplySteps({ bundle, invoice, context });
  steps.push(...supply.steps);
  warnings.push(...supply.warnings);
  Object.assign(seedIds, supply.seedIds);
  Object.assign(summary, supply.counts);

  return { steps, seedIds, warnings, summary };
}
