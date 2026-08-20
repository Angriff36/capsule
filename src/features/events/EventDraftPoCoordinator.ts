const DRAFTABLE_STAGES = new Set([
  "planning",
  "quote",
  "sales_lock",
  "pending_approval",
  "approved",
  "executing",
]);

type SoftDelete = { deletedAt?: unknown };

export type EventDraftDemand = SoftDelete & {
  id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number | string;
  unit: string;
  status: string;
};

export type EventDraftOrder = SoftDelete & {
  id: string;
  eventId?: string | null;
  status: string;
};

export type EventDraftOrderLine = SoftDelete & {
  id: string;
  vendorOrderId: string;
  ingredientId: string;
  ingredientDemandId?: string | null;
  status?: string | null;
};

export type EventDraftIngredient = SoftDelete & {
  id: string;
  unit: string;
  costPerUnit: number | string;
};

export type EventDraftPoOk = {
  ok: true;
  vendorOrderId: string;
  lineCount: number;
  createdOrder: boolean;
};

export type EventDraftPoFail = {
  ok: false;
  reason: string;
};

export type EventDraftPoResult = EventDraftPoOk | EventDraftPoFail;

export type EventDraftPoPorts = {
  createOrder: (input: {
    vendorId: string;
    eventId: string;
    notes?: string;
  }) => Promise<{ docId: string }>;
  createLine: (input: {
    vendorOrderId: string;
    ingredientId: string;
    orderedQuantity: number;
    unit: string;
    unitCost: number;
    ingredientDemandId?: string;
  }) => Promise<{ docId: string }>;
};

export type EventDraftPoInput = {
  eventId: string;
  eventStage: string;
  vendorId: string;
  demands: readonly EventDraftDemand[];
  orders: readonly EventDraftOrder[];
  lines: readonly EventDraftOrderLine[];
  ingredients: readonly EventDraftIngredient[];
};

function isActive(row: SoftDelete) {
  return row.deletedAt == null;
}

/** Planning events may draft a PO from needs — approval is not required. */
export function eventAllowsDraftPoFromNeeds(stage: string): boolean {
  return DRAFTABLE_STAGES.has(String(stage));
}

export function eventDraftPoBlockedReason(stage: string): string | null {
  if (eventAllowsDraftPoFromNeeds(stage)) return null;
  return `Cannot draft a PO while the event is ${String(stage).replaceAll("_", " ")}.`;
}

export class EventDraftPoCoordinator {
  constructor(private readonly ports: EventDraftPoPorts) {}

  async draftFromNeeds(input: EventDraftPoInput): Promise<EventDraftPoResult> {
    const blocked = eventDraftPoBlockedReason(input.eventStage);
    if (blocked) return { ok: false, reason: blocked };
    if (!input.vendorId.trim()) {
      return {
        ok: false,
        reason: "Pick a vendor to draft a PO from this event's needs.",
      };
    }

    const needs = input.demands.filter(
      (demand) =>
        isActive(demand) &&
        demand.eventId === input.eventId &&
        demand.status !== "superseded" &&
        Number(demand.requiredQuantity) > 0,
    );
    if (needs.length === 0) {
      return {
        ok: false,
        reason: "This event has no ingredient needs to draft a PO from.",
      };
    }

    const existing = input.orders.find(
      (order) =>
        isActive(order) &&
        order.eventId === input.eventId &&
        String(order.status) === "draft",
    );
    const vendorOrderId =
      existing?.id ??
      (
        await this.ports.createOrder({
          vendorId: input.vendorId,
          eventId: input.eventId,
          notes: "Drafted from event needs",
        })
      ).docId;

    const existingLines = input.lines.filter(
      (line) =>
        isActive(line) &&
        line.vendorOrderId === vendorOrderId &&
        line.status !== "cancelled",
    );
    const covered = new Set(
      existingLines.flatMap((line) =>
        [line.ingredientDemandId, line.ingredientId].filter(Boolean),
      ),
    );

    let lineCount = 0;
    for (const need of needs) {
      if (covered.has(need.id) || covered.has(need.ingredientId)) continue;
      const ingredient = input.ingredients.find(
        (row) => isActive(row) && row.id === need.ingredientId,
      );
      const catalogCost = Number(ingredient?.costPerUnit);
      const sameUnit = ingredient != null && ingredient.unit === need.unit;
      const unitCost =
        sameUnit && Number.isFinite(catalogCost) && catalogCost > 0
          ? catalogCost
          : 0;
      await this.ports.createLine({
        vendorOrderId,
        ingredientId: need.ingredientId,
        orderedQuantity: Number(need.requiredQuantity),
        unit: need.unit,
        unitCost,
        ingredientDemandId: need.id,
      });
      covered.add(need.id);
      covered.add(need.ingredientId);
      lineCount += 1;
    }

    if (lineCount === 0 && existing) {
      return {
        ok: false,
        reason: "A draft PO already covers this event's needs.",
      };
    }

    return {
      ok: true,
      vendorOrderId,
      lineCount,
      createdOrder: existing == null,
    };
  }
}
