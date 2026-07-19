export type PrepPurchaseNeed = {
  id: string;
  version: number;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  deletedAt?: number | null;
};

export type PrepPurchaseEvent = {
  id: string;
  startsAt?: number | null;
  deletedAt?: number | null;
};

type DraftPorts = {
  openOrder(input: {
    vendorId: string;
    sourceRangeStart: number;
    sourceRangeEnd: number;
  }): Promise<{ docId: string }>;
  addLine(input: {
    vendorOrderId: string;
    ingredientId: string;
    orderedQuantity: number;
    unit: string;
    unitCost: number;
  }): Promise<{ docId: string }>;
  assignNeedToDraft(input: {
    docId: string;
    version: number;
    vendorOrderId: string;
    vendorOrderLineId: string;
  }): Promise<unknown>;
};

type GenerateInput = {
  vendorId: string;
  rangeStart: number;
  rangeEnd: number;
  needs: readonly PrepPurchaseNeed[];
  events: readonly PrepPurchaseEvent[];
};

type NeedGroup = {
  ingredientId: string;
  unit: string;
  requiredQuantity: number;
  needs: PrepPurchaseNeed[];
};

export class PrepPurchaseDraftCoordinator {
  constructor(private readonly ports: DraftPorts) {}

  async generate(input: GenerateInput) {
    if (input.rangeEnd < input.rangeStart) {
      throw new Error("Purchase draft range end must not precede its start");
    }

    const eventStartsAt = new Map(
      input.events
        .filter((event) => event.deletedAt == null && event.startsAt != null)
        .map((event) => [event.id, event.startsAt!] as const),
    );
    const groups = new Map<string, NeedGroup>();

    for (const need of input.needs) {
      const startsAt = eventStartsAt.get(need.eventId);
      if (
        need.deletedAt != null ||
        need.status !== "open" ||
        startsAt == null ||
        startsAt < input.rangeStart ||
        startsAt > input.rangeEnd
      ) {
        continue;
      }

      const key = `${need.ingredientId}:${need.unit}`;
      const existing = groups.get(key);
      if (existing) {
        existing.requiredQuantity += need.requiredQuantity;
        existing.needs.push(need);
      } else {
        groups.set(key, {
          ingredientId: need.ingredientId,
          unit: need.unit,
          requiredQuantity: need.requiredQuantity,
          needs: [need],
        });
      }
    }

    if (groups.size === 0) {
      throw new Error("No open purchase needs fall within this date range");
    }

    const order = await this.ports.openOrder({
      vendorId: input.vendorId,
      sourceRangeStart: input.rangeStart,
      sourceRangeEnd: input.rangeEnd,
    });

    let needCount = 0;
    for (const group of groups.values()) {
      const line = await this.ports.addLine({
        vendorOrderId: order.docId,
        ingredientId: group.ingredientId,
        orderedQuantity: group.requiredQuantity,
        unit: group.unit,
        unitCost: 0,
      });
      await Promise.all(
        group.needs.map((need) =>
          this.ports.assignNeedToDraft({
            docId: need.id,
            version: need.version,
            vendorOrderId: order.docId,
            vendorOrderLineId: line.docId,
          }),
        ),
      );
      needCount += group.needs.length;
    }

    return { orderId: order.docId, lineCount: groups.size, needCount };
  }
}
