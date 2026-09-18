import type { PacketIssue } from "./model";

/**
 * Cross-event workbook summaries. Pure projection over the persisted packet
 * rows (artifacts, issues, revisions) plus point-get event/client rows — the
 * seam reads the tables, this module decides what a workbook row means.
 * Counts reflect the last import or decision, not a live reconcile.
 */
export interface SummaryArtifactRow {
  eventId: string;
  purpose: string;
  metadataJson?: string | null;
}
export interface SummaryIssueRow {
  eventId: string;
  issueKey: string;
  issueJson: string;
  updatedAt?: number;
}
export interface SummaryRevisionRow {
  eventId: string;
  stage: string;
  createdAt: number;
}
export interface SummaryEventLike {
  _id: string;
  title?: string | null;
  startsAt?: number | null;
  stage?: string | null;
  clientId?: string | null;
}
export interface SummaryClientLike {
  clientType?: string | null;
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}
export interface PacketIssueSummary {
  id: string;
  key: string;
  section: string;
  severity: PacketIssue["severity"];
  owner: string;
  message: string;
}
export interface PacketWorkbookSummary {
  eventId: string;
  title: string;
  startsAt: number | null;
  stage: string;
  clientName: string;
  sourceCount: number;
  openBlocking: number;
  openWarning: number;
  ready: boolean;
  latestActivityAt: number | null;
  latestRevision: { stage: string; createdAt: number } | null;
  openIssues: PacketIssueSummary[];
}

function clientName(client: SummaryClientLike | null): string {
  if (!client) return "—";
  const companyName = client.companyName?.trim();
  if (client.clientType === "company" && companyName) return companyName;
  const name = [client.givenName, client.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || companyName || "—";
}

export function summarizePacketRows(input: {
  artifacts: SummaryArtifactRow[];
  issues: SummaryIssueRow[];
  revisions: SummaryRevisionRow[];
  getEvent: (eventId: string) => SummaryEventLike | null;
  getClient: (clientId: string) => SummaryClientLike | null;
}): PacketWorkbookSummary[] {
  const eventIds = new Set<string>([
    ...input.artifacts.map((r) => r.eventId),
    ...input.issues.map((r) => r.eventId),
    ...input.revisions.map((r) => r.eventId),
  ]);
  const summaries: PacketWorkbookSummary[] = [];
  for (const eventId of eventIds) {
    const event = input.getEvent(eventId);
    if (!event) continue;
    const open: PacketIssue[] = input.issues
      .filter((r) => r.eventId === eventId)
      .map((r) => JSON.parse(r.issueJson) as PacketIssue)
      .filter((issue) => issue.status === "open");
    const openIssues: PacketIssueSummary[] = open.map((issue) => ({
      id: issue.id,
      key: issue.key,
      section: issue.section,
      severity: issue.severity,
      owner: issue.owner,
      message: issue.message,
    }));
    const revisionRows = input.revisions.filter((r) => r.eventId === eventId);
    const latestRevision = revisionRows.length
      ? revisionRows.reduce((latest, r) =>
          r.createdAt > latest.createdAt ? r : latest,
        )
      : null;
    const activityAt = input.issues
      .filter((r) => r.eventId === eventId)
      .reduce((max, r) => Math.max(max, r.updatedAt ?? 0), 0);
    summaries.push({
      eventId,
      title: event.title ?? "Untitled event",
      startsAt: event.startsAt ?? null,
      stage: event.stage ?? "",
      clientName: clientName(input.getClient(event.clientId ?? "")),
      sourceCount: input.artifacts.filter(
        (r) =>
          r.eventId === eventId && r.purpose === "source" && !!r.metadataJson,
      ).length,
      openBlocking: open.filter((i) => i.severity === "blocking").length,
      openWarning: open.filter((i) => i.severity === "warning").length,
      ready: !open.some((i) => i.required),
      latestActivityAt: activityAt > 0 ? activityAt : null,
      latestRevision: latestRevision
        ? { stage: latestRevision.stage, createdAt: latestRevision.createdAt }
        : null,
      openIssues,
    });
  }
  summaries.sort((a, b) => {
    if (a.startsAt == null && b.startsAt == null)
      return a.title.localeCompare(b.title);
    if (a.startsAt == null) return 1;
    if (b.startsAt == null) return -1;
    return a.startsAt - b.startsAt || a.title.localeCompare(b.title);
  });
  return summaries;
}
