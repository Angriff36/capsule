import { describe, expect, it } from "vitest";

import {
  summarizePacketRows,
  type SummaryArtifactRow,
  type SummaryClientLike,
  type SummaryEventLike,
  type SummaryIssueRow,
  type SummaryRevisionRow,
} from "../src/lib/eventPacket/summaryProjection";
import type { PacketIssue } from "../src/lib/eventPacket/model";

function issue(overrides: Partial<PacketIssue> & { key: string }): string {
  return JSON.stringify({
    id: `issue-${overrides.key}`,
    fieldKey: "guestCount",
    required: true,
    severity: "blocking",
    section: "venue",
    printSection: "Event brief",
    owner: "sales",
    message: `Issue ${overrides.key}`,
    status: "open",
    evidence: [
      {
        artifactFingerprint: "abc",
        parserVersion: "event-packet/1",
      },
    ],
    evidenceFingerprint: "fp",
    ...overrides,
  } satisfies PacketIssue);
}

const event = (
  id: string,
  overrides: Partial<SummaryEventLike> = {},
): SummaryEventLike => ({
  _id: id,
  title: `Event ${id}`,
  startsAt: Date.parse("2026-10-01T18:00:00Z"),
  stage: "planning",
  clientId: `client-${id}`,
  ...overrides,
});

function run(input: {
  artifacts?: SummaryArtifactRow[];
  issues?: SummaryIssueRow[];
  revisions?: SummaryRevisionRow[];
  events?: SummaryEventLike[];
  clients?: Record<string, SummaryClientLike>;
}) {
  const events = new Map((input.events ?? []).map((e) => [e._id, e]));
  return summarizePacketRows({
    artifacts: input.artifacts ?? [],
    issues: input.issues ?? [],
    revisions: input.revisions ?? [],
    getEvent: (id) => events.get(id) ?? null,
    getClient: (id) => input.clients?.[id] ?? null,
  });
}

describe("summarizePacketRows", () => {
  it("counts only imported source artifacts", () => {
    const rows = run({
      artifacts: [
        { eventId: "e1", purpose: "source", metadataJson: "{}" },
        { eventId: "e1", purpose: "source" },
        { eventId: "e1", purpose: "pdf", metadataJson: "{}" },
      ],
      events: [event("e1")],
    });
    expect(rows[0]?.sourceCount).toBe(1);
  });

  it("counts open issues by severity and ignores resolved ones", () => {
    const rows = run({
      issues: [
        { eventId: "e1", issueKey: "a", issueJson: issue({ key: "a" }) },
        {
          eventId: "e1",
          issueKey: "b",
          issueJson: issue({ key: "b", severity: "warning" }),
        },
        {
          eventId: "e1",
          issueKey: "c",
          issueJson: issue({ key: "c", status: "resolved" }),
        },
      ],
      events: [event("e1")],
    });
    expect(rows[0]?.openBlocking).toBe(1);
    expect(rows[0]?.openWarning).toBe(1);
    expect(rows[0]?.openIssues.map((i) => i.key)).toEqual(["a", "b"]);
  });

  it("marks ready only with no open required issues", () => {
    const requiredOpen = run({
      issues: [
        { eventId: "e1", issueKey: "a", issueJson: issue({ key: "a" }) },
      ],
      events: [event("e1")],
    });
    expect(requiredOpen[0]?.ready).toBe(false);
    const optionalOpen = run({
      issues: [
        {
          eventId: "e1",
          issueKey: "a",
          issueJson: issue({ key: "a", required: false }),
        },
      ],
      events: [event("e1")],
    });
    expect(optionalOpen[0]?.ready).toBe(true);
  });

  it("takes the latest revision by createdAt", () => {
    const rows = run({
      revisions: [
        { eventId: "e1", stage: "review", createdAt: 100 },
        { eventId: "e1", stage: "ready", createdAt: 200 },
      ],
      events: [event("e1")],
    });
    expect(rows[0]?.latestRevision).toEqual({ stage: "ready", createdAt: 200 });
  });

  it("lists events from any packet table and drops unreadable events", () => {
    const rows = run({
      revisions: [{ eventId: "gone", stage: "ready", createdAt: 1 }],
      issues: [
        { eventId: "e1", issueKey: "a", issueJson: issue({ key: "a" }) },
      ],
      events: [event("e1")],
    });
    expect(rows.map((r) => r.eventId)).toEqual(["e1"]);
  });

  it("strips evidence arrays from issue summaries", () => {
    const rows = run({
      issues: [
        { eventId: "e1", issueKey: "a", issueJson: issue({ key: "a" }) },
      ],
      events: [event("e1")],
    });
    expect(rows[0]?.openIssues[0]).not.toHaveProperty("evidence");
    expect(rows[0]?.openIssues[0]).not.toHaveProperty("evidenceFingerprint");
  });

  it("sorts by service date with undated events last", () => {
    const rows = run({
      events: [
        event("late", { startsAt: Date.parse("2026-11-01T18:00:00Z") }),
        event("undated", { startsAt: null }),
        event("early", { startsAt: Date.parse("2026-09-01T18:00:00Z") }),
      ],
      artifacts: ["late", "undated", "early"].map((eventId) => ({
        eventId,
        purpose: "source",
        metadataJson: "{}",
      })),
    });
    expect(rows.map((r) => r.eventId)).toEqual(["early", "late", "undated"]);
  });

  it("labels company clients by company name", () => {
    const rows = run({
      artifacts: [{ eventId: "e1", purpose: "source", metadataJson: "{}" }],
      events: [event("e1", { clientId: "co" })],
      clients: {
        co: {
          clientType: "company",
          companyName: "Liberty Mutual",
          givenName: "Jo",
          familyName: "Doe",
        },
      },
    });
    expect(rows[0]?.clientName).toBe("Liberty Mutual");
  });

  it("reports the latest issue activity", () => {
    const rows = run({
      issues: [
        {
          eventId: "e1",
          issueKey: "a",
          issueJson: issue({ key: "a" }),
          updatedAt: 50,
        },
        {
          eventId: "e1",
          issueKey: "b",
          issueJson: issue({ key: "b" }),
          updatedAt: 90,
        },
      ],
      events: [event("e1")],
    });
    expect(rows[0]?.latestActivityAt).toBe(90);
  });
});
