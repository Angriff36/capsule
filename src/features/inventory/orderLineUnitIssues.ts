/**
 * AC-468: which order lines carry an event amount whose recipe units did not
 * turn into the item's buying unit. The reason is written on the event's
 * ingredient demand; this finds it through the line's active demand links.
 */
export type UnitIssue = { eventId: string; reason: string };

type LineRow = { _id: string };
type LinkRow = {
  vendorOrderLineId: string;
  ingredientDemandId: string;
  deletedAt?: unknown;
  removedAt?: unknown;
};
type DemandRow = {
  _id: string;
  eventId: string;
  unitReviewReason?: string | null;
  deletedAt?: unknown;
};

export function orderLineUnitIssues(input: {
  lines: readonly LineRow[];
  links: readonly LinkRow[];
  demands: readonly DemandRow[];
}): Map<string, UnitIssue[]> {
  const demandById = new Map(input.demands.map((d) => [String(d._id), d]));
  const lineIds = new Set(input.lines.map((line) => String(line._id)));
  const issues = new Map<string, UnitIssue[]>();
  for (const link of input.links) {
    if (link.deletedAt != null || link.removedAt != null) continue;
    const lineId = String(link.vendorOrderLineId);
    if (!lineIds.has(lineId)) continue;
    const demand = demandById.get(String(link.ingredientDemandId));
    if (!demand || demand.deletedAt != null || !demand.unitReviewReason)
      continue;
    const list = issues.get(lineId) ?? [];
    if (!list.some((issue) => issue.eventId === String(demand.eventId)))
      list.push({
        eventId: String(demand.eventId),
        reason: demand.unitReviewReason,
      });
    issues.set(lineId, list);
  }
  return issues;
}
