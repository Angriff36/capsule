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
  computed: { startsAt: number; endsAt: number; serviceStyleId?: string },
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

  if (
    SCHEDULE_STAGES.includes(stage) &&
    bundle.header.startMinutes !== undefined &&
    (current.startsAt !== computed.startsAt ||
      current.endsAt !== computed.endsAt)
  )
    steps.push({
      capabilityId: "Event.reschedule",
      ref: "event-schedule",
      label: "Bring the event date and time up to date",
      idempotencySuffix: `schedule:${invoice}:${computed.startsAt}:${computed.endsAt}`,
      resolveRefs: ["docId"],
      args: {
        docId: "event",
        startsAt: computed.startsAt,
        endsAt: computed.endsAt,
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
  const venueAddress =
    venueAddressText(bundle) ?? current.venueAddress ?? undefined;
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
      args: {
        docId: "event",
        venueId: existing.venueId,
        venueName,
        venueAddress,
        venueCapacity: current.venueCapacity ?? undefined,
      },
    });

  return steps;
}
