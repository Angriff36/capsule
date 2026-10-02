/**
 * The venue facts frozen into a proposal revision and a finalized event
 * (spec §8.2, AC-315). One shape for both, so the two copies agree. No
 * encrypted field (address, contact) is copied here in plain text: the event
 * and proposal keep their own venue name/address snapshot.
 */
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type VenueFactsSnapshot = {
  name: string;
  venueType: string;
  capacity: number;
  onPremise: boolean | null;
  kitchenAccess: string | null;
  parkingAvailable: boolean | null;
  hasFreightElevator: boolean | null;
  storageAvailable: boolean | null;
  logisticsNotes: string | null;
  loadInInstructions: string | null;
  powerAvailable: boolean | null;
  waterAccess: boolean | null;
  hasStairs: boolean | null;
  wasteRules: string | null;
  permitsInsuranceNotes: string | null;
  restrictions: string | null;
  accessNotes: string | null;
  cateringNotes: string | null;
  seatedCapacity?: number | null;
  standingCapacity?: number | null;
  hasOven?: boolean | null;
  hasRefrigeration?: boolean | null;
  loadInFrom?: string | null;
  loadOutBy?: string | null;
};

export function venueFactsSnapshot(venue: Doc<"venues">): VenueFactsSnapshot {
  return {
    name: venue.name,
    venueType: venue.venueType,
    capacity: Number(venue.capacity),
    onPremise: venue.onPremise ?? null,
    kitchenAccess: venue.kitchenAccess ?? null,
    parkingAvailable: venue.parkingAvailable ?? null,
    hasFreightElevator: venue.hasFreightElevator ?? null,
    storageAvailable: venue.storageAvailable ?? null,
    logisticsNotes: venue.logisticsNotes ?? null,
    loadInInstructions: venue.loadInInstructions ?? null,
    powerAvailable: venue.powerAvailable ?? null,
    waterAccess: venue.waterAccess ?? null,
    hasStairs: venue.hasStairs ?? null,
    wasteRules: venue.wasteRules ?? null,
    permitsInsuranceNotes: venue.permitsInsuranceNotes ?? null,
    restrictions: venue.restrictions ?? null,
    accessNotes: venue.accessNotes ?? null,
    cateringNotes: venue.cateringNotes ?? null,
    seatedCapacity: venue.seatedCapacity ?? null,
    standingCapacity: venue.standingCapacity ?? null,
    hasOven: venue.hasOven ?? null,
    hasRefrigeration: venue.hasRefrigeration ?? null,
    loadInFrom: venue.loadInFrom ?? null,
    loadOutBy: venue.loadOutBy ?? null,
  };
}

/** The live venue of a company's record, or null (gone, other company). */
export async function liveVenue(
  ctx: Pick<MutationCtx, "db">,
  tenantId: string,
  venueId: string | null | undefined,
): Promise<Doc<"venues"> | null> {
  if (!venueId) return null;
  const venue = await ctx.db.get(venueId as Id<"venues">);
  if (!venue || venue.deletedAt != null || venue.tenantId !== tenantId) return null;
  return venue;
}

/** On finalize: freeze the event's venue facts once. A later finalize of the
 * same event (after a reopen) keeps the first copy. */
export async function freezeFinalVenueFacts(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event || event.finalVenueFacts != null) return;
  const venue = await liveVenue(ctx, event.tenantId, event.venueId);
  if (!venue) return;
  await ctx.runMutation(api.mutations.Event_recordFinalVenueFacts, {
    docId: eventId,
    facts: JSON.stringify(venueFactsSnapshot(venue)),
  });
}
