/**
 * Average-event-value breakdowns (spec §7.4): completed events split by one
 * fact (salesperson, service style, occasion or venue). Every event lands in
 * exactly one group; an event with no value for the fact goes to a named
 * "No …" group instead of being dropped, so the groups add back up to the
 * page's total.
 */

export interface BreakdownEvent {
  readonly quotedPrice?: number | null;
  readonly expectedHeadcount?: number | null;
}

export interface BreakdownRow {
  readonly key: string;
  readonly label: string;
  readonly eventCount: number;
  readonly totalRevenue: number;
  readonly avgEventValue: number;
  /** null when no event in the group has a guest count. */
  readonly revenuePerHead: number | null;
}

export function breakdownBy<E extends BreakdownEvent>(
  events: readonly E[],
  keyOf: (event: E) => string | null | undefined,
  labelOf: (key: string, event: E) => string,
  missingLabel: string,
): BreakdownRow[] {
  const groups = new Map<
    string,
    {
      label: string;
      revenue: number;
      count: number;
      heads: number;
      headRevenue: number;
    }
  >();
  for (const event of events) {
    const raw = keyOf(event);
    const key = raw ? String(raw) : "";
    const group = groups.get(key) ?? {
      label: key ? labelOf(key, event) : missingLabel,
      revenue: 0,
      count: 0,
      heads: 0,
      headRevenue: 0,
    };
    const price = event.quotedPrice ?? 0;
    group.revenue += price;
    group.count += 1;
    if (event.expectedHeadcount) {
      group.heads += event.expectedHeadcount;
      group.headRevenue += price;
    }
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      eventCount: group.count,
      totalRevenue: group.revenue,
      avgEventValue: group.revenue / group.count,
      revenuePerHead: group.heads > 0 ? group.headRevenue / group.heads : null,
    }))
    .sort((a, b) => b.avgEventValue - a.avgEventValue);
}
