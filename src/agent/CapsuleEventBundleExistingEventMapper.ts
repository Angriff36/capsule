import {
  directoryRows,
  liveRow,
  rowText,
} from "./CapsuleEventBundleDirectoryMapper";
import type { CapsuleEventBundleExistingEvent } from "./CapsuleEventBundleExistingState";

/**
 * The state of an event that is already in Capsule, from plain query rows.
 * The agent loader and the browser importer both call this, so a BEO that is
 * imported again fills in and brings up to date the SAME event on both paths.
 * No client, no auth, no Node: safe in the page bundle.
 */
export interface BundleExistingEventRows {
  events: unknown;
  clients: unknown;
  clientContacts: unknown;
  eventDishes: unknown;
  dishes: unknown;
  timeline: unknown;
  prepTasks: unknown;
  packLists: unknown;
  packListItems: unknown;
  assignments: unknown;
}

export function mapBundleExistingEvent(
  eventId: string,
  input: BundleExistingEventRows,
): CapsuleEventBundleExistingEvent {
  const rows = directoryRows;
  const live = liveRow;
  const text = rowText;
  const event = rows(input.events).find((row) => String(row._id) === eventId);
  if (!event) {
    throw new Error(`Event ${eventId} was not found in this tenant.`);
  }
  const clientId = String(event.clientId);
  const clientRow = rows(input.clients).find(
    (row) => String(row._id) === clientId,
  );
  const dishNames = new Map(
    rows(input.dishes).map((row) => [String(row._id), text(row.name)]),
  );
  const forEvent = (row: Record<string, unknown>) =>
    live(row) && String(row.eventId) === eventId;
  const eventDishRows = rows(input.eventDishes).filter(forEvent);
  const dishNameByEventDish = new Map(
    eventDishRows.map((row) => [
      String(row._id),
      dishNames.get(String(row.dishId)) ?? "",
    ]),
  );
  // Only a list that can still take items: PackListItem.addItem is guarded
  // to draft/packing. A packed, loaded, dispatched or cancelled list is left
  // alone and the plan opens a new one.
  const eventPackLists = rows(input.packLists).filter(forEvent);
  const packList = eventPackLists.find(
    (row) => row.status === "draft" || row.status === "packing",
  );
  const closedPackLists = eventPackLists.length - (packList ? 1 : 0);

  return {
    eventId,
    clientId,
    venueId: event.venueId == null ? undefined : String(event.venueId),
    event: {
      stage: text(event.stage) || undefined,
      eventNumber: event.eventNumber as string | null | undefined,
      startsAt: event.startsAt as number | null | undefined,
      endsAt: event.endsAt as number | null | undefined,
      expectedHeadcount: event.expectedHeadcount as number | null | undefined,
      serviceStyleId:
        event.serviceStyleId == null ? null : String(event.serviceStyleId),
      venueName: event.venueName as string | null | undefined,
      venueAddress: event.venueAddress as string | null | undefined,
      venueCapacity: event.venueCapacity as number | null | undefined,
      quotedPrice: Number(event.quotedPrice ?? 0),
      primaryContactName: text(event.primaryContactName) || undefined,
      primaryContactEmail: event.primaryContactEmail as
        string | null | undefined,
      primaryContactPhone: event.primaryContactPhone as
        string | null | undefined,
      serviceRequirements: event.serviceRequirements as
        string | null | undefined,
      operationalRequirements: event.operationalRequirements as
        string | null | undefined,
    },
    client: {
      email: clientRow?.email as string | null | undefined,
      phone: clientRow?.phone as string | null | undefined,
    },
    clientContactNames: rows(input.clientContacts)
      .filter((row) => live(row) && String(row.clientId) === clientId)
      .map((row) => `${text(row.givenName)} ${text(row.familyName)}`.trim()),
    eventDishes: eventDishRows.map((row) => ({
      id: String(row._id),
      dishName: dishNames.get(String(row.dishId)) ?? "",
      course: row.course as string | null | undefined,
    })),
    timelineNames: rows(input.timeline)
      .filter(forEvent)
      .map((row) => text(row.name)),
    prepTasks: rows(input.prepTasks)
      .filter(forEvent)
      .map((row) => ({
        dishName: dishNameByEventDish.get(String(row.eventDishId)) ?? "",
        name: text(row.name),
      })),
    closedPackLists,
    packList: packList
      ? {
          id: String(packList._id),
          itemDescriptions: rows(input.packListItems)
            .filter(
              (row) =>
                live(row) && String(row.packListId) === String(packList._id),
            )
            .map((row) => text(row.description)),
        }
      : undefined,
    assignedPersonIds: rows(input.assignments)
      .filter(forEvent)
      .map((row) => String(row.personId)),
  };
}
