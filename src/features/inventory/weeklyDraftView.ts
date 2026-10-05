/**
 * BE-10.6 (AC-483): what the purchasing page shows for the week's automatic
 * draft, line by line. Pure: the page passes in the rows it already reads.
 *
 * Quantities per line, all in the line's buying unit:
 * - needed: what the week's events need in total;
 * - fromStock: stock on hand this line counts on instead of buying;
 * - onOtherOrders: supply already on an order outside this draft;
 * - toBuy: the automatic amount (needed less the two above);
 * - ordering: what the order says now (the buyer may have changed it);
 * - received / stillToCome: what has come in and what is still owed.
 */
import {
  packRounding,
  type PackMapping,
  type PackRounding,
} from "./packRounding";
import { orderLineUnitIssues } from "./orderLineUnitIssues";

export type DraftOrder = {
  _id: string;
  vendorId: string;
  status: unknown;
  sourceRangeStart?: number | null;
  deletedAt?: unknown;
};

export type DraftLine = {
  _id: string;
  vendorOrderId: string;
  ingredientId: string;
  unit: string;
  status: unknown;
  orderedQuantity: number;
  plannedQuantity?: number | null;
  quantityIsManual?: boolean | null;
  quantityReviewReason?: string | null;
  receivedQuantity: number;
  stockAppliedQuantity?: number | null;
  pendingSupplyQuantity?: number | null;
  deletedAt?: unknown;
};

export type DraftLink = {
  vendorOrderLineId: string;
  ingredientDemandId: string;
  deletedAt?: unknown;
  removedAt?: unknown;
};

export type DraftNeed = {
  _id: string;
  eventId: string;
  ingredientDemandId: string;
  vendorOrderLineId?: string | null;
  requiredQuantity: number;
  unit: string;
  status: unknown;
  deletedAt?: unknown;
};

export type DraftDemand = {
  _id: string;
  eventId: string;
  unitReviewReason?: string | null;
  deletedAt?: unknown;
};

export type EventShare = { eventId: string; quantity: number; unit: string };

export type DraftException = { eventId: string | null; reason: string };

export type WeeklyDraftLineView = {
  lineId: string;
  ingredientId: string;
  unit: string;
  needed: number;
  fromStock: number;
  onOtherOrders: number;
  toBuy: number;
  ordering: number;
  received: number;
  stillToCome: number;
  /** The buyer's quantity differs from the automatic amount and is kept. */
  buyerChanged: boolean;
  events: EventShare[];
  rounding: PackRounding | null;
  exceptions: DraftException[];
};

/** Monday-based week start in local time, as a timestamp. */
function weekStart(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

/**
 * The draft purchasing opens on: this week's automatic draft, else the next
 * upcoming one, else the latest past one still in draft.
 */
export function currentWeeklyDraft<T extends DraftOrder>(
  orders: readonly T[],
  now: number,
): T | null {
  const drafts = orders
    .filter(
      (order) =>
        order.deletedAt == null &&
        String(order.status) === "draft" &&
        order.sourceRangeStart != null,
    )
    .sort(
      (left, right) =>
        Number(left.sourceRangeStart) - Number(right.sourceRangeStart),
    );
  const thisWeek = weekStart(now);
  return (
    drafts.find((order) => Number(order.sourceRangeStart) >= thisWeek) ??
    drafts[drafts.length - 1] ??
    null
  );
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;

export function weeklyDraftLines(input: {
  order: DraftOrder;
  lines: readonly DraftLine[];
  links: readonly DraftLink[];
  needs: readonly DraftNeed[];
  demands: readonly DraftDemand[];
  mappings: readonly PackMapping[];
}): WeeklyDraftLineView[] {
  const orderLines = input.lines.filter(
    (line) =>
      line.deletedAt == null &&
      line.vendorOrderId === input.order._id &&
      String(line.status) !== "cancelled",
  );
  const unitIssues = orderLineUnitIssues({
    lines: orderLines,
    links: input.links,
    demands: input.demands,
  });
  return orderLines.map((line) => {
    const lineNeeds = input.needs.filter(
      (need) =>
        need.deletedAt == null &&
        String(need.status) !== "cancelled" &&
        (need.vendorOrderLineId === line._id ||
          input.links.some(
            (link) =>
              link.deletedAt == null &&
              link.removedAt == null &&
              link.vendorOrderLineId === line._id &&
              link.ingredientDemandId === need.ingredientDemandId,
          )),
    );
    const fromStock = Number(line.stockAppliedQuantity ?? 0);
    const onOtherOrders = Number(line.pendingSupplyQuantity ?? 0);
    const ordering = Number(line.orderedQuantity);
    const toBuy = Number(line.plannedQuantity ?? ordering);
    const sameUnitNeeds = lineNeeds.filter((need) => need.unit === line.unit);
    const needed =
      sameUnitNeeds.length > 0
        ? sameUnitNeeds.reduce(
            (sum, need) => sum + Number(need.requiredQuantity),
            0,
          )
        : toBuy + fromStock + onOtherOrders;
    const received = Number(line.receivedQuantity);
    const exceptions: DraftException[] = [
      ...(unitIssues.get(line._id) ?? []).map((issue) => ({
        eventId: issue.eventId,
        reason: issue.reason,
      })),
      ...(line.quantityReviewReason
        ? [{ eventId: null, reason: line.quantityReviewReason }]
        : []),
    ];
    return {
      lineId: line._id,
      ingredientId: line.ingredientId,
      unit: line.unit,
      needed: round4(needed),
      fromStock: round4(fromStock),
      onOtherOrders: round4(onOtherOrders),
      toBuy: round4(toBuy),
      ordering: round4(ordering),
      received: round4(received),
      stillToCome: round4(Math.max(0, ordering - received)),
      buyerChanged:
        line.plannedQuantity != null &&
        line.quantityIsManual !== false &&
        round4(ordering) !== round4(toBuy),
      events: lineNeeds.map((need) => ({
        eventId: need.eventId,
        quantity: round4(Number(need.requiredQuantity)),
        unit: need.unit,
      })),
      rounding: packRounding({
        need: toBuy,
        lineUnit: line.unit,
        ingredientId: line.ingredientId,
        mappings: input.mappings,
      }),
      exceptions,
    };
  });
}
