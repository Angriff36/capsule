const DRAFTABLE_STAGES = new Set(["planning", "quote", "sales_lock"]);

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
  materialize?: (input: {
    eventId: string;
    vendorId: string;
    existingOrderId?: string;
    lines: Array<{
      ingredientId: string;
      ingredientDemandId: string;
      orderedQuantity: number;
      unit: string;
      unitCost: number;
    }>;
  }) => Promise<{ vendorOrderId: string }>;
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

/** Draft PO from needs is allowed only on planning, quote, and sales_lock. */
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
    const existingLines = existing
      ? input.lines.filter(
          (line) =>
            isActive(line) &&
            line.vendorOrderId === existing.id &&
            line.status !== "cancelled",
        )
      : [];
    const covered = new Set(
      existingLines.flatMap((line) =>
        [line.ingredientDemandId, line.ingredientId].filter(Boolean),
      ),
    );
    const plannedLines = needs.flatMap((need) => {
      if (covered.has(need.id) || covered.has(need.ingredientId)) return [];
      const ingredient = input.ingredients.find(
        (row) => isActive(row) && row.id === need.ingredientId,
      );
      const catalogCost = Number(ingredient?.costPerUnit);
      const sameUnit = ingredient != null && ingredient.unit === need.unit;
      covered.add(need.id);
      covered.add(need.ingredientId);
      return [
        {
          ingredientId: need.ingredientId,
          ingredientDemandId: need.id,
          orderedQuantity: Number(need.requiredQuantity),
          unit: need.unit,
          unitCost:
            sameUnit && Number.isFinite(catalogCost) && catalogCost > 0
              ? catalogCost
              : 0,
        },
      ];
    });

    if (plannedLines.length === 0 && existing) {
      return {
        ok: false,
        reason: "A draft PO already covers this event's needs.",
      };
    }

    if (this.ports.materialize) {
      const result = await this.ports.materialize({
        eventId: input.eventId,
        vendorId: input.vendorId,
        existingOrderId: existing?.id,
        lines: plannedLines,
      });
      return {
        ok: true,
        vendorOrderId: result.vendorOrderId,
        lineCount: plannedLines.length,
        createdOrder: existing == null,
      };
    }

    const vendorOrderId =
      existing?.id ??
      (
        await this.ports.createOrder({
          vendorId: input.vendorId,
          eventId: input.eventId,
          notes: "Drafted from event needs",
        })
      ).docId;

    let lineCount = 0;
    for (const line of plannedLines) {
      await this.ports.createLine({
        vendorOrderId,
        ...line,
      });
      lineCount += 1;
    }

    return {
      ok: true,
      vendorOrderId,
      lineCount,
      createdOrder: existing == null,
    };
  }
}
