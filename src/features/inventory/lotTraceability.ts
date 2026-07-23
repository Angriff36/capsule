export type LotTraceabilityFilters = {
  supplierLotNumber: string;
  receivedFrom?: number;
  receivedTo?: number;
};

export type LotTraceabilityRow = {
  id: string;
  lotId: string;
  supplierLotNumber: string;
  vendorName: string;
  receivedAt?: number | null;
  eventId: string;
  eventTitle: string;
  eventStartsAt?: number | null;
  clientId?: string;
  clientName: string;
  ingredientName: string;
  locationName: string;
  quantity: number;
  unit: string;
  firstConsumedAt: number;
  lastConsumedAt: number;
  consumptionCount: number;
};

type TraceabilityCatalogs = {
  lots: readonly any[];
  reservations: readonly any[];
  events: readonly any[];
  clients: readonly any[];
  ingredients: readonly any[];
  vendors: readonly any[];
  locations: readonly any[];
  items: readonly any[];
};

export function buildLotTraceabilityRows(
  catalogs: TraceabilityCatalogs,
  filters: LotTraceabilityFilters,
): LotTraceabilityRow[] {
  const lotSearch = filters.supplierLotNumber.trim().toLocaleLowerCase();
  const lotsById = new Map(
    catalogs.lots
      .filter(
        (lot) =>
          lot.deletedAt == null &&
          (!lotSearch ||
            String(lot.supplierLotNumber)
              .toLocaleLowerCase()
              .includes(lotSearch)) &&
          (filters.receivedFrom == null ||
            (lot.receivedAt != null &&
              Number(lot.receivedAt) >= filters.receivedFrom)) &&
          (filters.receivedTo == null ||
            (lot.receivedAt != null &&
              Number(lot.receivedAt) <= filters.receivedTo)),
      )
      .map((lot) => [String(lot._id), lot]),
  );
  const rows = new Map<string, LotTraceabilityRow>();

  for (const reservation of catalogs.reservations) {
    if (
      reservation.deletedAt != null ||
      reservation.status !== "consumed" ||
      reservation.consumedAt == null ||
      !reservation.inventoryLotId
    ) {
      continue;
    }
    const consumedAt = Number(reservation.consumedAt);
    const lot = lotsById.get(String(reservation.inventoryLotId));
    if (!lot) continue;

    const event = catalogs.events.find(
      (candidate) => candidate._id === reservation.eventId,
    );
    const client = event
      ? catalogs.clients.find((candidate) => candidate._id === event.clientId)
      : undefined;
    const item = catalogs.items.find(
      (candidate) => candidate._id === reservation.inventoryItemId,
    );
    const ingredient = catalogs.ingredients.find(
      (candidate) => candidate._id === lot.ingredientId,
    );
    const vendor = catalogs.vendors.find(
      (candidate) => candidate._id === lot.vendorId,
    );
    const location = catalogs.locations.find(
      (candidate) => candidate._id === lot.locationId,
    );
    const id = `${lot._id}:${reservation.eventId}`;
    const existing = rows.get(id);
    if (existing) {
      existing.quantity += Number(reservation.quantity);
      existing.firstConsumedAt = Math.min(existing.firstConsumedAt, consumedAt);
      existing.lastConsumedAt = Math.max(existing.lastConsumedAt, consumedAt);
      existing.consumptionCount += 1;
      continue;
    }

    rows.set(id, {
      id,
      lotId: String(lot._id),
      supplierLotNumber: String(lot.supplierLotNumber),
      vendorName: String(vendor?.name ?? "Unknown vendor"),
      receivedAt: lot.receivedAt,
      eventId: String(reservation.eventId),
      eventTitle: String(event?.title ?? "Unknown event"),
      eventStartsAt: event?.startsAt,
      clientId: event?.clientId,
      clientName: formatClientName(client),
      ingredientName: String(ingredient?.name ?? "Unknown ingredient"),
      locationName: String(location?.name ?? "Unknown location"),
      quantity: Number(reservation.quantity),
      unit: String(item?.unit ?? lot.unit ?? "unit"),
      firstConsumedAt: consumedAt,
      lastConsumedAt: consumedAt,
      consumptionCount: 1,
    });
  }

  return [...rows.values()].sort(
    (left, right) =>
      right.lastConsumedAt - left.lastConsumedAt ||
      left.eventTitle.localeCompare(right.eventTitle) ||
      left.supplierLotNumber.localeCompare(right.supplierLotNumber),
  );
}

export function countUnattributedConsumptions(
  reservations: readonly any[],
): number {
  return reservations.filter((reservation) => {
    if (
      reservation.deletedAt != null ||
      reservation.status !== "consumed" ||
      reservation.consumedAt == null ||
      reservation.inventoryLotId
    ) {
      return false;
    }
    return true;
  }).length;
}

function formatClientName(client: any): string {
  if (!client) return "Unknown client";
  const personName = [client.givenName, client.familyName]
    .filter(Boolean)
    .join(" ");
  return String(client.companyName || personName || "Unnamed client");
}
