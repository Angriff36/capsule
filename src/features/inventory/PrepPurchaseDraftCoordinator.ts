export type PrepPurchaseNeed = {
  id: string;
  version: number;
  eventId: string;
  ingredientDemandId?: string | null;
  ingredientId: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  vendorOrderId?: string | null;
  vendorOrderLineId?: string | null;
  deletedAt?: number | null;
};

export type PrepPurchaseEvent = {
  id: string;
  startsAt?: number | null;
  deletedAt?: number | null;
};

export type PrepPurchaseOrder = {
  id: string;
  vendorId: string;
  sourceRangeStart?: number | null;
  sourceRangeEnd?: number | null;
  status: string;
  version?: number;
  deletedAt?: number | null;
};

export type PrepPurchaseLine = {
  id: string;
  vendorOrderId: string;
  ingredientId: string;
  orderedQuantity: number;
  unit: string;
  status: string;
  version?: number;
  deletedAt?: number | null;
};

export type PrepPurchaseDemandLink = {
  id: string;
  vendorOrderLineId: string;
  ingredientDemandId: string;
  contributionQuantity: number;
  unit: string;
  version: number;
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
  reviseLine?: (input: {
    docId: string;
    orderedQuantity: number;
    unit: string;
    unitCost: number;
    version?: number;
  }) => Promise<unknown>;
  linkDemand?: (input: {
    vendorOrderLineId: string;
    ingredientDemandId: string;
    vendorOrderId: string;
    contributionQuantity: number;
    unit: string;
  }) => Promise<{ docId: string }>;
  assignNeedToDraft(input: {
    docId: string;
    version: number;
    vendorOrderId: string;
    vendorOrderLineId: string;
  }): Promise<unknown>;
  /** Compensating abort when generate fails after creating an order this attempt. */
  cancelOrder?: (input: {
    docId: string;
    version?: number;
    reason: string;
  }) => Promise<unknown>;
  /** Compensating abort for lines created this attempt on a reused draft. */
  cancelLine?: (input: {
    docId: string;
    version?: number;
    reason: string;
  }) => Promise<unknown>;
  /** Compensating abort for demand links created this attempt (before order cancel). */
  retireDemandLink?: (input: {
    docId: string;
    version?: number;
    reason: string;
  }) => Promise<unknown>;
};

type GenerateInput = {
  vendorId: string;
  rangeStart: number;
  rangeEnd: number;
  needs: readonly PrepPurchaseNeed[];
  events: readonly PrepPurchaseEvent[];
  orders?: readonly PrepPurchaseOrder[];
  lines?: readonly PrepPurchaseLine[];
  demandLinks?: readonly PrepPurchaseDemandLink[];
};

type NeedGroup = {
  ingredientId: string;
  unit: string;
  requiredQuantity: number;
  needs: PrepPurchaseNeed[];
};

function sameRange(value: number | null | undefined, expected: number) {
  return value === expected;
}

const ROLLBACK_REASON =
  "Prep-list draft generate failed; aborting partial draft";

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
    const existingOrder = (input.orders ?? []).find(
      (order) =>
        order.deletedAt == null &&
        order.status === "draft" &&
        order.vendorId === input.vendorId &&
        sameRange(order.sourceRangeStart, input.rangeStart) &&
        sameRange(order.sourceRangeEnd, input.rangeEnd),
    );
    const draftOrderId = existingOrder?.id;
    const groups = this.groupEligibleNeeds(input, eventStartsAt, draftOrderId);
    if (groups.size === 0) {
      throw new Error("No open purchase needs fall within this date range");
    }

    let createdOrderId: string | null = null;
    const createdLineIds: string[] = [];
    const createdLinkIds: string[] = [];
    try {
      const order = existingOrder
        ? { docId: existingOrder.id }
        : await this.ports.openOrder({
            vendorId: input.vendorId,
            sourceRangeStart: input.rangeStart,
            sourceRangeEnd: input.rangeEnd,
          });
      if (!existingOrder) createdOrderId = order.docId;

      let needCount = 0;
      let lineCount = 0;
      const pendingAssign: Array<{
        need: PrepPurchaseNeed;
        lineId: string;
      }> = [];

      for (const group of groups.values()) {
        const existingLine = (input.lines ?? []).find(
          (line) =>
            line.deletedAt == null &&
            line.status !== "cancelled" &&
            line.vendorOrderId === order.docId &&
            line.ingredientId === group.ingredientId &&
            line.unit === group.unit,
        );
        const line = existingLine
          ? { docId: existingLine.id }
          : await this.ports.addLine({
              vendorOrderId: order.docId,
              ingredientId: group.ingredientId,
              orderedQuantity: group.requiredQuantity,
              unit: group.unit,
              unitCost: 0,
            });
        if (!existingLine) createdLineIds.push(line.docId);
        if (
          existingLine &&
          existingLine.orderedQuantity !== group.requiredQuantity &&
          this.ports.reviseLine
        ) {
          await this.ports.reviseLine({
            docId: existingLine.id,
            orderedQuantity: group.requiredQuantity,
            unit: group.unit,
            unitCost: 0,
            ...(existingLine.version != null
              ? { version: existingLine.version }
              : {}),
          });
        }
        lineCount += 1;

        for (const need of group.needs) {
          const linkedId = await this.linkNeed({
            need,
            lineId: line.docId,
            orderId: order.docId,
            demandLinks: input.demandLinks,
          });
          if (linkedId) createdLinkIds.push(linkedId);
          if (!need.vendorOrderId) {
            pendingAssign.push({ need, lineId: line.docId });
          }
          needCount += 1;
        }
      }

      // Assign after every link succeeds so a mid-generate failure leaves needs unlinked.
      for (const pending of pendingAssign) {
        await this.ports.assignNeedToDraft({
          docId: pending.need.id,
          version: pending.need.version,
          vendorOrderId: order.docId,
          vendorOrderLineId: pending.lineId,
        });
      }

      return { orderId: order.docId, lineCount, needCount };
    } catch (error) {
      await this.rollbackAttempt({
        createdOrderId,
        createdLineIds,
        createdLinkIds,
      });
      throw error;
    }
  }

  private groupEligibleNeeds(
    input: GenerateInput,
    eventStartsAt: Map<string, number>,
    draftOrderId: string | undefined,
  ) {
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
      if (need.vendorOrderId != null && need.vendorOrderId !== draftOrderId) {
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
    return groups;
  }

  private async linkNeed(input: {
    need: PrepPurchaseNeed;
    lineId: string;
    orderId: string;
    demandLinks: readonly PrepPurchaseDemandLink[] | undefined;
  }): Promise<string | null> {
    const { need, lineId, orderId, demandLinks } = input;
    const link = demandLinks?.find(
      (candidate) =>
        candidate.deletedAt == null &&
        candidate.vendorOrderLineId === lineId &&
        candidate.ingredientDemandId === need.ingredientDemandId,
    );
    if (!link && this.ports.linkDemand && need.ingredientDemandId) {
      const created = await this.ports.linkDemand({
        vendorOrderLineId: lineId,
        ingredientDemandId: need.ingredientDemandId,
        vendorOrderId: orderId,
        contributionQuantity: need.requiredQuantity,
        unit: need.unit,
      });
      return created.docId;
    }
    return null;
  }

  private async rollbackAttempt(input: {
    createdOrderId: string | null;
    createdLineIds: readonly string[];
    createdLinkIds: readonly string[];
  }) {
    // Retire links while the order is still draft, then cancel lines/order.
    if (this.ports.retireDemandLink) {
      for (const linkId of input.createdLinkIds) {
        await this.ports.retireDemandLink({
          docId: linkId,
          reason: ROLLBACK_REASON,
        });
      }
    }
    if (input.createdOrderId && this.ports.cancelOrder) {
      await this.ports.cancelOrder({
        docId: input.createdOrderId,
        reason: ROLLBACK_REASON,
      });
      return;
    }
    if (!this.ports.cancelLine) return;
    for (const lineId of input.createdLineIds) {
      await this.ports.cancelLine({
        docId: lineId,
        reason: ROLLBACK_REASON,
      });
    }
  }
}
