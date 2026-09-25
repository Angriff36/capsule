/**
 * Display-only formatting for the LIVE event readiness projection returned by
 * `api.eventReadiness.getEventReadiness`. Readiness is never stored on the
 * Event — the helper takes the projection only, so it cannot read or recompute
 * Event fields. A later live fact change changes what the card prints.
 */
import {
  EVENT_READINESS_DOMAINS,
  type EventReadinessDomain,
  type EventReadinessIssue,
  type EventReadinessProjection,
} from "../../../convex/lib/eventReadinessProjection";

export const EVENT_READINESS_DOMAIN_LABELS: Record<
  EventReadinessDomain,
  string
> = {
  commercial: "Commercial",
  planning: "Planning",
  kitchen: "Kitchen",
  purchasing: "Purchasing",
  staffing: "Staffing",
  packing: "Packing",
  packet: "Packet",
  execution: "Execution",
  closeout: "Closeout",
};

export type EventReadinessRow = {
  domain: EventReadinessDomain;
  label: string;
  issues: EventReadinessIssue[];
};

/** Always nine rows in domain order; empty issues when a domain is missing. */
export function eventReadinessRows(
  projection: EventReadinessProjection | null | undefined,
): EventReadinessRow[] {
  if (projection == null) return [];
  return EVENT_READINESS_DOMAINS.map((domain) => ({
    domain,
    label: EVENT_READINESS_DOMAIN_LABELS[domain],
    issues:
      projection.domains.find((entry) => entry.domain === domain)?.issues ?? [],
  }));
}

export function eventReadinessIssueLine(issue: EventReadinessIssue): string {
  return `${issue.reason} · ${issue.severity} · ${issue.resolvingAction}`;
}

export function eventReadinessOpenCount(
  projection: EventReadinessProjection | null | undefined,
): number {
  return eventReadinessRows(projection).reduce(
    (total, row) => total + row.issues.length,
    0,
  );
}
