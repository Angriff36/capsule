import type { EventBundle } from "../lib/tppReports/eventBundle";
import type { CapsuleEventBundleExistingEvent } from "./CapsuleEventBundleExistingState";
import { venueAddressText, type PlannedStep } from "./CapsuleEventBundleShared";

/**
 * The BEO is the newer truth (owner rule, 2026-09-20): a BEO imported for an
 * event that is already in Capsule overwrites the header values it carries
 * and fills in the empty ones. A value the BEO does not carry is left alone.
 *
 * Every suffix carries the value, so a later BEO with another value runs
 * again, and the same BEO a second time does nothing.
 */

const SCHEDULE_STAGES = ["planning", "pending_approval", "approved"];
const HEADCOUNT_STAGES = [...SCHEDULE_STAGES, "executing"];

export function planHeaderSteps(
  bundle: EventBundle,
  invoice: string,
  existing: CapsuleEventBundleExistingEvent | undefined,
  computed: {
    startsAt: number;
    endsAt: number;
    serviceStyleId?: string;
    /** The tenant venue the BEO's venue name matched, when it did. */
    venueId?: string;
  },
): PlannedStep[] {
  const steps: PlannedStep[] = [];
  const current = existing?.event;
  // A caller that did not read the header values gets no header steps.
  if (existing && current?.stage === undefined) return steps;

  // The TPP invoice number IS the event number the shop uses (tracker, binder
  // spine). The next import of this BEO finds the event by it.
  const tppNumber = bundle.header.invoiceNumber?.trim() ?? "";
  if (/^\d{4,6}$/.test(tppNumber) && (current?.eventNumber ?? "") !== tppNumber)
    steps.push({
      capabilityId: "Event.setEventNumber",
      ref: "event-number",
      label: `Number the event ${tppNumber}`,
      idempotencySuffix: `event-number:${invoice}:${tppNumber}`,
      resolveRefs: ["docId"],
      args: { docId: "event", eventNumber: tppNumber },
    });

  // A fresh event gets every header value from Event.planEngagement itself.
  if (!existing || !current || current.stage === undefined) return steps;
  const stage = current.stage;

  // A BEO with a start but no end must not shorten an event whose end is
  // already known: computed.endsAt is a one-hour guess in that case.
  const endsAt =
    bundle.header.endMinutes === undefined &&
    current.endsAt != null &&
    current.endsAt > computed.startsAt
      ? current.endsAt
      : computed.endsAt;
  if (
    SCHEDULE_STAGES.includes(stage) &&
    bundle.header.startMinutes !== undefined &&
    (current.startsAt !== computed.startsAt || current.endsAt !== endsAt)
  )
    steps.push({
      capabilityId: "Event.reschedule",
      ref: "event-schedule",
      label: "Bring the event date and time up to date",
      idempotencySuffix: `schedule:${invoice}:${computed.startsAt}:${endsAt}`,
      resolveRefs: ["docId"],
      args: {
        docId: "event",
        startsAt: computed.startsAt,
        endsAt,
      },
    });

  const guests = bundle.header.guestCount;
  if (
    HEADCOUNT_STAGES.includes(stage) &&
    guests !== undefined &&
    guests >= 1 &&
    guests !== current.expectedHeadcount
  )
    steps.push({
      capabilityId: "Event.changeHeadcount",
      ref: "event-headcount",
      label: `Set the guest count to ${guests}`,
      idempotencySuffix: `headcount:${invoice}:${guests}`,
      resolveRefs: ["docId"],
      args: { docId: "event", newHeadcount: guests },
    });

  if (
    computed.serviceStyleId !== undefined &&
    computed.serviceStyleId !== current.serviceStyleId
  )
    steps.push({
      capabilityId: "Event.changeServiceStyle",
      ref: "event-service-style",
      label: `Set the service style to ${bundle.header.serviceStyle}`,
      idempotencySuffix: `service-style:${invoice}:${computed.serviceStyleId}`,
      resolveRefs: ["docId"],
      args: { docId: "event", serviceStyleId: computed.serviceStyleId },
    });

  const venueName = bundle.venue.name ?? current.venueName ?? undefined;
  const venueRenamed =
    bundle.venue.name !== undefined &&
    (current.venueName ?? "").trim().toLowerCase() !==
      bundle.venue.name.trim().toLowerCase();
  // A renamed venue never keeps the old venue's address: the BEO's address
  // or none, so nobody is routed to the previous site.
  const venueAddress =
    venueAddressText(bundle) ??
    (venueRenamed ? undefined : (current.venueAddress ?? undefined));
  if (
    SCHEDULE_STAGES.includes(stage) &&
    (venueName !== (current.venueName ?? undefined) ||
      venueAddress !== (current.venueAddress ?? undefined))
  )
    steps.push({
      capabilityId: "Event.changeVenue",
      ref: "event-venue",
      label: "Bring the venue name and address up to date",
      idempotencySuffix: `venue:${invoice}:${venueName ?? ""}:${venueAddress ?? ""}`,
      resolveRefs: ["docId"],
      // Every optional param is sent: this command clears what it is not given.
      // A different venue name means a different venue: point at the matched
      // tenant venue, or at none, never at the old one under a new name.
      args: {
        docId: "event",
        venueId: venueRenamed
          ? (computed.venueId ?? undefined)
          : (computed.venueId ?? existing.venueId),
        venueName,
        venueAddress,
        venueCapacity: venueRenamed
          ? undefined
          : (current.venueCapacity ?? undefined),
      },
    });

  steps.push(...planVenueFillStep(bundle, invoice, existing));
  return steps;
}

/** Every field Venue.updateDetails takes; it clears the ones it is not given. */
const VENUE_DETAIL_FIELDS = [
  "name",
  "venueType",
  "onPremise",
  "kitchenAccess",
  "parkingAvailable",
  "hasFreightElevator",
  "storageAvailable",
  "logisticsNotes",
  "loadInInstructions",
  "powerAvailable",
  "waterAccess",
  "hasStairs",
  "wasteRules",
  "permitsInsuranceNotes",
  "restrictions",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
  "latitude",
  "longitude",
  "contactName",
  "contactEmail",
  "contactPhone",
  "accessNotes",
  "cateringNotes",
] as const;

/**
 * A venue is shared by every event held there, so a BEO only FILLS IN what
 * the venue record lacks (its contact, its coordinates, the kitchen and
 * load-in notes) and never overwrites a value the venue already has.
 */
function planVenueFillStep(
  bundle: EventBundle,
  invoice: string,
  existing: CapsuleEventBundleExistingEvent,
): PlannedStep[] {
  const venue = existing.venue;
  if (!venue || existing.venueId === undefined) return [];
  const empty = (value: unknown) => value == null || value === "";
  const fill = <T>(current: unknown, incoming: T | undefined) =>
    empty(current) && incoming !== undefined && incoming !== ""
      ? incoming
      : undefined;
  const fills: Record<string, unknown> = {
    addressLine1: fill(venue.addressLine1, bundle.venue.addressLine1),
    city: fill(venue.city, bundle.venue.city),
    region: fill(venue.region, bundle.venue.region),
    postalCode: fill(venue.postalCode, bundle.venue.postalCode),
    latitude: fill(venue.latitude, bundle.venue.latitude),
    longitude: fill(venue.longitude, bundle.venue.longitude),
    contactName: fill(venue.contactName, bundle.venue.contactName),
    contactPhone: fill(
      venue.contactPhone,
      bundle.venue.contactPhone ?? bundle.venue.phone,
    ),
    cateringNotes: fill(venue.cateringNotes, bundle.notes.cateringKitchen),
    loadInInstructions: fill(
      venue.loadInInstructions,
      bundle.notes.serviceSetup,
    ),
  };
  const changed = Object.entries(fills).filter(
    ([, value]) => value !== undefined,
  );
  if (changed.length === 0) return [];
  const current: Record<string, unknown> = {};
  for (const field of VENUE_DETAIL_FIELDS)
    current[field] = venue[field] ?? undefined;
  return [
    {
      capabilityId: "Venue.updateDetails",
      ref: "venue-details",
      label: `Fill in the venue's ${changed.map(([key]) => key).join(", ")}`,
      idempotencySuffix: `venue-details:${invoice}:${changed.map(([key]) => key).join(",")}`,
      resolveRefs: ["docId"],
      args: { docId: "venue", ...current, ...Object.fromEntries(changed) },
    },
  ];
}
